"""
Client-facing API routes.

Handles deliberation creation, funding, results retrieval, and payment webhooks.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

import stripe as stripe_lib
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from agorax_economy.models import (
    Deliberation as DomainDeliberation,
    DeliberationStatus,
    DeliberationType,
    DeliberationVisibility,
    PaymentInbound,
    PaymentStatus,
)
from agorax_economy.sortition import verify_selection

from config import settings
from database import get_db
from repositories import (
    SQLAlchemyDeliberationRepository,
    SQLAlchemyPointsRepository,
    SQLAlchemyTreasuryRepository,
)

logger = logging.getLogger("economy_service.client")

router = APIRouter(prefix="/api", tags=["client"])


# ── Pydantic Schemas ────────────────────────────────────────────────────────

class CreateDeliberationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    description: str = Field(default="", max_length=10000)
    deliberation_type: str = Field(default="standard")
    visibility: str = Field(default="public")
    client_id: str = Field(..., min_length=1, max_length=255)
    panel_size: int = Field(default=15, ge=3, le=500)
    required_expertise: list[str] = Field(default_factory=list)
    embargo_days: Optional[int] = Field(default=None, ge=30, le=365)


class FundDeliberationRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(default="EUR", pattern="^[A-Z]{3}$")
    payment_method: str = Field(default="stripe")


class FundDeliberationResponse(BaseModel):
    deliberation_id: str
    payment_intent: dict
    payment_id: str


class DeliberationResultsResponse(BaseModel):
    deliberation_id: str
    status: str
    sortition_seed: Optional[str] = None
    sortition_proof: Optional[str] = None
    panel_size: int
    participants_count: int
    embargo_until: Optional[str] = None
    results_available: bool


class SortitionVerifyRequest(BaseModel):
    pool: list[str]
    panel_size: int


class SortitionVerifyResponse(BaseModel):
    valid: bool
    seed: str
    proof: str


# ── Routes ──────────────────────────────────────────────────────────────────

@router.post(
    "/deliberations",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
)
async def create_deliberation(
    body: CreateDeliberationRequest,
    db: Session = Depends(get_db),
):
    """Create a new deliberation (unfunded draft)."""
    repo = SQLAlchemyDeliberationRepository(db)

    deliberation = DomainDeliberation(
        title=body.title,
        description=body.description,
        deliberation_type=DeliberationType(body.deliberation_type),
        visibility=DeliberationVisibility(body.visibility),
        status=DeliberationStatus.DRAFT,
        client_id=body.client_id,
        panel_size=body.panel_size,
        required_expertise=body.required_expertise,
    )

    await repo.save(deliberation)
    db.commit()

    logger.info(f"Created deliberation {deliberation.id} for client {body.client_id}")

    return {
        "deliberation_id": str(deliberation.id),
        "status": "draft",
        "message": "Deliberation created. Fund it to launch.",
    }


@router.post(
    "/deliberations/{deliberation_id}/fund",
    response_model=FundDeliberationResponse,
)
async def fund_deliberation(
    deliberation_id: str,
    body: FundDeliberationRequest,
    db: Session = Depends(get_db),
):
    """
    Initiate payment for a deliberation.

    Creates a payment intent (Stripe or BTCPay) and records the inbound payment.
    The deliberation is launched after payment confirmation via webhook.
    """
    try:
        did = uuid.UUID(deliberation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid deliberation ID")

    repo = SQLAlchemyDeliberationRepository(db)
    deliberation = await repo.get(did)

    if deliberation is None:
        raise HTTPException(status_code=404, detail="Deliberation not found")

    if deliberation.status != DeliberationStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot fund deliberation in status '{deliberation.status.value}'",
        )

    # Create payment intent via gateway
    from agorax_economy.payments import (
        PaymentGateway,
        StripeAdapter,
        BTCPayAdapter,
        CoinGeckoProvider,
    )

    gateway = PaymentGateway(CoinGeckoProvider(settings.COINGECKO_API_URL))

    if body.payment_method == "stripe":
        gateway.register_adapter(StripeAdapter(settings.STRIPE_SECRET_KEY))
    elif body.payment_method == "btcpay":
        gateway.register_adapter(BTCPayAdapter(settings.BTCPAY_SERVER_URL, settings.BTCPAY_API_KEY))
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported payment method: {body.payment_method}")

    intent, payment = await gateway.initiate_payment(
        amount=body.amount,
        currency=body.currency,
        method=body.payment_method,
        description=f"Deliberation funding: {deliberation.title}",
    )

    # Store payment record
    from models import PaymentInbound as ORMPayment

    orm_payment = ORMPayment(
        amount=payment.amount,
        currency=payment.currency,
        eur_equivalent=payment.eur_equivalent,
        payment_method=payment.payment_method,
        status=payment.status.value,
        external_reference=payment.external_reference,
        deliberation_id=deliberation.id,
    )
    db.add(orm_payment)
    db.commit()

    logger.info(f"Payment initiated for deliberation {deliberation.id}: {body.amount} {body.currency}")

    return FundDeliberationResponse(
        deliberation_id=str(deliberation.id),
        payment_intent=intent,
        payment_id=str(payment.id),
    )


@router.get("/deliberations/{deliberation_id}/results")
async def get_deliberation_results(
    deliberation_id: str,
    db: Session = Depends(get_db),
):
    """
    Get deliberation results.

    Respects embargo — returns limited info if results are still embargoed.
    """
    try:
        did = uuid.UUID(deliberation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid deliberation ID")

    repo = SQLAlchemyDeliberationRepository(db)
    deliberation = await repo.get(did)

    if deliberation is None:
        raise HTTPException(status_code=404, detail="Deliberation not found")

    # Check embargo
    embargoed = (
        deliberation.visibility == DeliberationVisibility.EMBARGOED
        and deliberation.embargo_until
        and datetime.now(timezone.utc) < deliberation.embargo_until
    )

    participants = await repo.get_participants(did)
    participated = [p for p in participants if p.participated]

    return DeliberationResultsResponse(
        deliberation_id=str(deliberation.id),
        status=deliberation.status.value,
        sortition_seed=deliberation.sortition_seed if not embargoed else None,
        sortition_proof=deliberation.sortition_proof if not embargoed else None,
        panel_size=deliberation.panel_size,
        participants_count=len(participated),
        embargo_until=deliberation.embargo_until.isoformat() if deliberation.embargo_until else None,
        results_available=not embargoed,
    )


@router.post("/payments/webhook/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Stripe webhook handler.

    Idempotent — safe to retry. Processes payment confirmation.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe_lib.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid payload: {e}")
    except stripe_lib.error.SignatureVerificationError as e:
        raise HTTPException(status_code=401, detail=f"Invalid signature: {e}")

    if event["type"] != "payment_intent.succeeded":
        return Response(status_code=200)

    intent_data = event["data"]["object"]
    payment_intent_id = intent_data.get("id", "")

    # Find the payment record
    from sqlalchemy import select
    from models import PaymentInbound as ORMPayment

    stmt = select(ORMPayment).where(ORMPayment.external_reference == payment_intent_id)
    result = db.execute(stmt).scalar_one_or_none()

    if result is None:
        logger.warning(f"Stripe webhook: payment not found for intent {payment_intent_id}")
        return Response(status_code=200)

    # Idempotency: skip if already confirmed
    if result.status == "confirmed":
        logger.info(f"Stripe webhook: payment {result.id} already confirmed, skipping")
        return Response(status_code=200)

    # Update payment status
    result.status = "confirmed"

    # Process through treasury
    from agorax_economy.treasury import TreasuryManager
    from agorax_economy.config import EconomyConfig

    treasury_repo = SQLAlchemyTreasuryRepository(db)
    treasury = TreasuryManager(EconomyConfig(), treasury_repo)

    payment = PaymentInbound(
        id=result.id,
        amount=Decimal(str(result.amount)),
        currency=result.currency,
        eur_equivalent=Decimal(str(result.eur_equivalent)),
        payment_method=result.payment_method,
        status=PaymentStatus.CONFIRMED,
        external_reference=result.external_reference,
        deliberation_id=result.deliberation_id,
    )

    split = await treasury.process_payment(payment, deliberation_id=result.deliberation_id)

    # Update deliberation status
    if result.deliberation_id:
        del_repo = SQLAlchemyDeliberationRepository(db)
        deliberation = await del_repo.get(result.deliberation_id)
        if deliberation and deliberation.status == DeliberationStatus.DRAFT:
            deliberation.status = DeliberationStatus.FUNDED
            deliberation.funded_amount = payment.eur_equivalent
            deliberation.funded_currency = payment.currency
            await del_repo.save(deliberation)

    db.commit()

    logger.info(f"Stripe payment confirmed: {result.id}, split={split}")
    return Response(status_code=200)


@router.post("/payments/webhook/btcpay")
async def btcpay_webhook(request: Request, db: Session = Depends(get_db)):
    """
    BTCPay Server webhook handler.

    Idempotent — safe to retry. Processes Bitcoin payment confirmation.
    """
    payload = await request.json()

    # BTCPay webhook validation (simplified — use HMAC in production)
    invoice_id = payload.get("invoiceId", "")
    invoice_status = payload.get("invoiceStatus", "")

    if invoice_status not in ("paid", "expired"):
        return Response(status_code=200)

    # Find the payment record
    from sqlalchemy import select
    from models import PaymentInbound as ORMPayment

    stmt = select(ORMPayment).where(ORMPayment.external_reference == invoice_id)
    result = db.execute(stmt).scalar_one_or_none()

    if result is None:
        logger.warning(f"BTCPay webhook: payment not found for invoice {invoice_id}")
        return Response(status_code=200)

    # Idempotency: skip if already confirmed
    if result.status == "confirmed":
        logger.info(f"BTCPay webhook: payment {result.id} already confirmed, skipping")
        return Response(status_code=200)

    if invoice_status == "expired":
        result.status = "failed"
        db.commit()
        return Response(status_code=200)

    # Update payment status
    result.status = "confirmed"

    # Process through treasury
    from agorax_economy.treasury import TreasuryManager
    from agorax_economy.config import EconomyConfig

    treasury_repo = SQLAlchemyTreasuryRepository(db)
    treasury = TreasuryManager(EconomyConfig(), treasury_repo)

    payment = PaymentInbound(
        id=result.id,
        amount=Decimal(str(result.amount)),
        currency=result.currency,
        eur_equivalent=Decimal(str(result.eur_equivalent)),
        payment_method=result.payment_method,
        status=PaymentStatus.CONFIRMED,
        external_reference=result.external_reference,
        deliberation_id=result.deliberation_id,
    )

    split = await treasury.process_payment(payment, deliberation_id=result.deliberation_id)

    # Update deliberation status
    if result.deliberation_id:
        del_repo = SQLAlchemyDeliberationRepository(db)
        deliberation = await del_repo.get(result.deliberation_id)
        if deliberation and deliberation.status == DeliberationStatus.DRAFT:
            deliberation.status = DeliberationStatus.FUNDED
            deliberation.funded_amount = payment.eur_equivalent
            deliberation.funded_currency = payment.currency
            await del_repo.save(deliberation)

    db.commit()

    logger.info(f"BTCPay payment confirmed: {result.id}, split={split}")
    return Response(status_code=200)
