"""
Citizen-facing API routes.

Handles citizen registration, balance queries, transaction history,
deliberation participation, redemption, and referral links.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from agorax_economy.models import (
    Citizen as DomainCitizen,
    PointsBalance as DomainPointsBalance,
    RedemptionRequest as DomainRedemptionRequest,
    TransactionType,
    VerificationStatus,
)
from agorax_economy.points import InsufficientPointsError, RedemptionBlockedError

from config import settings
from database import get_db
from repositories import (
    SQLAlchemyDeliberationRepository,
    SQLAlchemyPointsRepository,
)

router = APIRouter(prefix="/api/citizens", tags=["citizen"])


# ── Pydantic Schemas ────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    locale: str = Field(default="el", max_length=10)
    expertise_tags: list[str] = Field(default_factory=list)
    referred_by: Optional[str] = Field(default=None)


class RegisterResponse(BaseModel):
    citizen_id: str
    verification_status: str
    message: str


class BalanceResponse(BaseModel):
    citizen_id: str
    balance: int
    lifetime_earned: int
    eur_equivalent: str


class TransactionItem(BaseModel):
    id: str
    transaction_type: str
    points: int
    deliberation_id: Optional[str] = None
    created_at: str


class TransactionHistoryResponse(BaseModel):
    citizen_id: str
    transactions: list[TransactionItem]
    total: int


class DeliberationItem(BaseModel):
    id: str
    title: str
    status: str
    participated: bool
    points_awarded: int


class CitizenDeliberationsResponse(BaseModel):
    citizen_id: str
    past: list[DeliberationItem]
    pending: list[DeliberationItem]


class RedeemRequest(BaseModel):
    points_amount: int = Field(..., gt=0)
    target_currency: str = Field(default="EUR", pattern="^[A-Z]{3}$")


class RedeemResponse(BaseModel):
    redemption_id: str
    points_amount: int
    eur_amount: str
    status: str


class ReferralLinkResponse(BaseModel):
    citizen_id: str
    referral_link: str
    referral_code: str


# ── Helper: Extract citizen_id from request ─────────────────────────────────

def get_citizen_id(request: Request) -> uuid.UUID:
    """
    Extract citizen_id from request headers or query params.
    In production, this would use JWT/OAuth tokens.
    """
    citizen_id_str = request.headers.get("X-Citizen-ID", "")
    if not citizen_id_str:
        citizen_id_str = request.query_params.get("citizen_id", "")

    if not citizen_id_str:
        raise HTTPException(
            status_code=401,
            detail="Citizen ID required. Provide X-Citizen-ID header or citizen_id query param.",
        )

    try:
        return uuid.UUID(citizen_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid citizen ID format")


# ── Routes ──────────────────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_citizen(
    body: RegisterRequest,
    db: Session = Depends(get_db),
):
    """
    Start citizen verification process.

    Creates a citizen record with UNVERIFIED status.
    Verification happens via external identity provider (Gov.gr, etc.).
    """
    from models import Citizen as ORMCitizen

    referred_by = None
    if body.referred_by:
        try:
            referred_by = uuid.UUID(body.referred_by)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid referred_by UUID")

    citizen = ORMCitizen(
        verification_status="unverified",
        is_early_adopter=False,
        expertise_tags=body.expertise_tags,
        referred_by=referred_by,
        locale=body.locale,
    )
    db.add(citizen)
    db.commit()

    return RegisterResponse(
        citizen_id=str(citizen.id),
        verification_status="unverified",
        message="Registration started. Please complete identity verification.",
    )


@router.get("/me/balance", response_model=BalanceResponse)
async def get_balance(
    request: Request,
    db: Session = Depends(get_db),
):
    """Get current Democracy Points balance."""
    citizen_id = get_citizen_id(request)
    repo = SQLAlchemyPointsRepository(db)

    balance = await repo.get_balance(citizen_id)
    if balance is None:
        raise HTTPException(status_code=404, detail="No balance found for this citizen")

    # Calculate EUR equivalent
    from agorax_economy.config import EconomyConfig
    config = EconomyConfig()
    eur = config.points_to_eur(balance.balance)

    return BalanceResponse(
        citizen_id=str(citizen_id),
        balance=balance.balance,
        lifetime_earned=balance.lifetime_earned,
        eur_equivalent=str(eur),
    )


@router.get("/me/transactions", response_model=TransactionHistoryResponse)
async def get_transactions(
    request: Request,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Get transaction history for the authenticated citizen."""
    citizen_id = get_citizen_id(request)

    from sqlalchemy import select
    from models import Transaction as ORMTransaction

    stmt = (
        select(ORMTransaction)
        .where(ORMTransaction.citizen_id == citizen_id)
        .order_by(ORMTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    results = db.execute(stmt).scalars().all()

    total_stmt = select(ORMTransaction).where(ORMTransaction.citizen_id == citizen_id)
    total = db.execute(total_stmt).scalars().all()

    transactions = [
        TransactionItem(
            id=str(t.id),
            transaction_type=t.transaction_type,
            points=t.points,
            deliberation_id=str(t.deliberation_id) if t.deliberation_id else None,
            created_at=t.created_at.isoformat(),
        )
        for t in results
    ]

    return TransactionHistoryResponse(
        citizen_id=str(citizen_id),
        transactions=transactions,
        total=len(total),
    )


@router.get("/me/deliberations", response_model=CitizenDeliberationsResponse)
async def get_my_deliberations(
    request: Request,
    db: Session = Depends(get_db),
):
    """Get past and pending deliberations for the authenticated citizen."""
    citizen_id = get_citizen_id(request)

    from sqlalchemy import select
    from models import DeliberationParticipant as ORMParticipant

    stmt = (
        select(ORMParticipant)
        .where(ORMParticipant.citizen_id == citizen_id)
    )
    participations = db.execute(stmt).scalars().all()

    past = []
    pending = []

    for p in participations:
        from sqlalchemy import select as sel
        from models import Deliberation as ORMDeliberation

        d = db.execute(
            sel(ORMDeliberation).where(ORMDeliberation.id == p.deliberation_id)
        ).scalar_one_or_none()

        if d is None:
            continue

        item = DeliberationItem(
            id=str(d.id),
            title=d.title,
            status=d.status,
            participated=p.participated,
            points_awarded=p.points_awarded,
        )

        if p.participated:
            past.append(item)
        else:
            pending.append(item)

    return CitizenDeliberationsResponse(
        citizen_id=str(citizen_id),
        past=past,
        pending=pending,
    )


@router.post("/me/redeem", response_model=RedeemResponse)
async def request_redemption(
    request: Request,
    body: RedeemRequest,
    db: Session = Depends(get_db),
):
    """
    Request points redemption.

    Debits points immediately (hold). Actual payout handled asynchronously.
    """
    citizen_id = get_citizen_id(request)
    repo = SQLAlchemyPointsRepository(db)

    from agorax_economy.points import PointsManager
    from agorax_economy.config import EconomyConfig

    config = EconomyConfig()
    points_manager = PointsManager(config, repo)

    try:
        redemption = await points_manager.request_redemption(
            citizen_id=citizen_id,
            points_amount=body.points_amount,
            target_currency=body.target_currency,
        )
    except InsufficientPointsError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RedemptionBlockedError as e:
        raise HTTPException(status_code=403, detail=str(e))

    db.commit()

    return RedeemResponse(
        redemption_id=str(redemption.id),
        points_amount=redemption.points_amount,
        eur_amount=str(redemption.eur_amount),
        status=redemption.status.value,
    )


@router.get("/me/referral-link", response_model=ReferralLinkResponse)
async def get_referral_link(
    request: Request,
    db: Session = Depends(get_db),
):
    """Get the citizen's referral link."""
    citizen_id = get_citizen_id(request)
    repo = SQLAlchemyPointsRepository(db)

    citizen = await repo.get_citizen(citizen_id)
    if citizen is None:
        raise HTTPException(status_code=404, detail="Citizen not found")

    referral_code = str(citizen_id)[:8]
    referral_link = f"https://agorax.gr/ref/{referral_code}"

    return ReferralLinkResponse(
        citizen_id=str(citizen_id),
        referral_link=referral_link,
        referral_code=referral_code,
    )
