"""
SQLAlchemy-backed repository implementations.

Implements the three Protocol interfaces from agorax_economy:
- PointsRepository
- TreasuryRepository
- DeliberationRepository
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from models import (
    Citizen,
    CommunityPolicy,
    Deliberation,
    DeliberationParticipant,
    PaymentInbound,
    PointsBalance,
    RedemptionRequest,
    Transaction,
    TreasuryLedger,
)

# Import domain models and enums from agorax_economy
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agorax_economy.models import (
    Citizen as DomainCitizen,
    CommunityPolicy as DomainCommunityPolicy,
    Deliberation as DomainDeliberation,
    DeliberationParticipant as DomainDeliberationParticipant,
    PointsBalance as DomainPointsBalance,
    RedemptionRequest as DomainRedemptionRequest,
    Transaction as DomainTransaction,
    TreasuryLedger as DomainTreasuryLedger,
    VerificationStatus,
    DeliberationType,
    DeliberationVisibility,
    DeliberationStatus,
    TransactionType,
    LedgerEntryType,
    PaymentStatus,
    RedemptionStatus,
)


# ── Helper: Convert between ORM and domain models ───────────────────────────

def _orm_to_domain_citizen(c: Citizen) -> DomainCitizen:
    return DomainCitizen(
        id=c.id,
        verification_status=VerificationStatus(c.verification_status),
        joined_at=c.joined_at,
        is_early_adopter=c.is_early_adopter,
        expertise_tags=c.expertise_tags or [],
        referred_by=c.referred_by,
        locale=c.locale,
    )


def _orm_to_domain_deliberation(d: Deliberation) -> DomainDeliberation:
    return DomainDeliberation(
        id=d.id,
        title=d.title,
        description=d.description,
        deliberation_type=DeliberationType(d.deliberation_type),
        visibility=DeliberationVisibility(d.visibility),
        status=DeliberationStatus(d.status),
        client_id=d.client_id,
        funded_amount=d.funded_amount,
        funded_currency=d.funded_currency,
        panel_size=d.panel_size,
        required_expertise=d.required_expertise or [],
        sortition_seed=d.sortition_seed,
        sortition_proof=d.sortition_proof,
        embargo_until=d.embargo_until,
    )


def _orm_to_domain_participant(p: DeliberationParticipant) -> DomainDeliberationParticipant:
    return DomainDeliberationParticipant(
        id=p.id,
        deliberation_id=p.deliberation_id,
        citizen_id=p.citizen_id,
        participated=p.participated,
        points_awarded=p.points_awarded,
    )


def _orm_to_domain_balance(b: PointsBalance) -> DomainPointsBalance:
    return DomainPointsBalance(
        citizen_id=b.citizen_id,
        balance=b.balance,
        lifetime_earned=b.lifetime_earned,
    )


def _orm_to_domain_transaction(t: Transaction) -> DomainTransaction:
    return DomainTransaction(
        id=t.id,
        citizen_id=t.citizen_id,
        transaction_type=TransactionType(t.transaction_type),
        points=t.points,
        deliberation_id=t.deliberation_id,
        created_at=t.created_at,
    )


def _orm_to_domain_community_policy(p: CommunityPolicy) -> DomainCommunityPolicy:
    return DomainCommunityPolicy(
        id=p.id,
        policy_key=p.policy_key,
        policy_value=p.policy_value,
        decided_by_deliberation_id=p.decided_by_deliberation_id,
        superseded_at=p.superseded_at,
        created_at=p.created_at,
    )


# ── PointsRepository ────────────────────────────────────────────────────────

class SQLAlchemyPointsRepository:
    """SQLAlchemy implementation of PointsRepository."""

    def __init__(self, session: Session):
        self.session = session

    async def get_balance(self, citizen_id: uuid.UUID) -> Optional[DomainPointsBalance]:
        stmt = select(PointsBalance).where(PointsBalance.citizen_id == citizen_id)
        result = self.session.execute(stmt).scalar_one_or_none()
        if result is None:
            return None
        return _orm_to_domain_balance(result)

    async def upsert_balance(self, balance: DomainPointsBalance) -> None:
        existing = self.session.execute(
            select(PointsBalance).where(PointsBalance.citizen_id == balance.citizen_id)
        ).scalar_one_or_none()

        if existing is None:
            orm = PointsBalance(
                citizen_id=balance.citizen_id,
                balance=balance.balance,
                lifetime_earned=balance.lifetime_earned,
            )
            self.session.add(orm)
        else:
            existing.balance = balance.balance
            existing.lifetime_earned = balance.lifetime_earned

    async def create_transaction(self, txn: DomainTransaction) -> None:
        orm = Transaction(
            citizen_id=txn.citizen_id,
            transaction_type=txn.transaction_type.value,
            points=txn.points,
            deliberation_id=txn.deliberation_id,
            created_at=txn.created_at,
        )
        self.session.add(orm)

    async def get_citizen(self, citizen_id: uuid.UUID) -> Optional[DomainCitizen]:
        stmt = select(Citizen).where(Citizen.id == citizen_id)
        result = self.session.execute(stmt).scalar_one_or_none()
        if result is None:
            return None
        return _orm_to_domain_citizen(result)

    async def create_redemption(self, request: DomainRedemptionRequest) -> None:
        orm = RedemptionRequest(
            citizen_id=request.citizen_id,
            points_amount=request.points_amount,
            target_currency=request.target_currency,
            eur_amount=request.eur_amount,
            status=request.status.value,
            created_at=request.created_at,
        )
        self.session.add(orm)


# ── TreasuryRepository ──────────────────────────────────────────────────────

class SQLAlchemyTreasuryRepository:
    """SQLAlchemy implementation of TreasuryRepository."""

    def __init__(self, session: Session):
        self.session = session

    async def create_ledger_entry(self, entry: DomainTreasuryLedger) -> None:
        orm = TreasuryLedger(
            entry_type=entry.entry_type.value,
            amount_eur=entry.amount_eur,
            original_amount=entry.original_amount,
            original_currency=entry.original_currency,
            deliberation_id=entry.deliberation_id,
            payment_id=entry.payment_id,
            created_at=entry.created_at,
        )
        self.session.add(orm)

    async def get_total_by_type(self, entry_type: LedgerEntryType) -> Decimal:
        stmt = (
            select(func.coalesce(func.sum(TreasuryLedger.amount_eur), Decimal("0")))
            .where(TreasuryLedger.entry_type == entry_type.value)
        )
        result = self.session.execute(stmt).scalar_one()
        return Decimal(str(result)) if result else Decimal("0")

    async def update_payment_status(self, payment_id: uuid.UUID, status: PaymentStatus) -> None:
        stmt = select(PaymentInbound).where(PaymentInbound.id == payment_id)
        payment = self.session.execute(stmt).scalar_one_or_none()
        if payment is not None:
            payment.status = status.value

    async def get_operations_balance(self) -> Decimal:
        """Get available operations funds (inbound - operations expenses)."""
        total_inbound = await self.get_total_by_type(LedgerEntryType.INBOUND_PAYMENT)
        total_ops = await self.get_total_by_type(LedgerEntryType.OPERATIONS_EXPENSE)
        return total_inbound - total_ops

    async def get_citizen_pool_balance(self) -> Decimal:
        """Get available citizen pool funds (citizen payouts not yet distributed)."""
        total_citizen = await self.get_total_by_type(LedgerEntryType.CITIZEN_PAYOUT)
        total_dividends = await self.get_total_by_type(LedgerEntryType.DIVIDEND_DISTRIBUTION)
        return total_citizen - total_dividends


# ── DeliberationRepository ──────────────────────────────────────────────────

class SQLAlchemyDeliberationRepository:
    """SQLAlchemy implementation of DeliberationRepository."""

    def __init__(self, session: Session):
        self.session = session

    async def get(self, deliberation_id: uuid.UUID) -> Optional[DomainDeliberation]:
        stmt = select(Deliberation).where(Deliberation.id == deliberation_id)
        result = self.session.execute(stmt).scalar_one_or_none()
        if result is None:
            return None
        return _orm_to_domain_deliberation(result)

    async def save(self, deliberation: DomainDeliberation) -> None:
        existing = self.session.execute(
            select(Deliberation).where(Deliberation.id == deliberation.id)
        ).scalar_one_or_none()

        if existing is None:
            orm = Deliberation(
                id=deliberation.id,
                title=deliberation.title,
                description=deliberation.description,
                deliberation_type=deliberation.deliberation_type.value,
                visibility=deliberation.visibility.value,
                status=deliberation.status.value,
                client_id=deliberation.client_id,
                funded_amount=deliberation.funded_amount,
                funded_currency=deliberation.funded_currency,
                panel_size=deliberation.panel_size,
                required_expertise=deliberation.required_expertise,
                sortition_seed=deliberation.sortition_seed,
                sortition_proof=deliberation.sortition_proof,
                embargo_until=deliberation.embargo_until,
            )
            self.session.add(orm)
        else:
            existing.title = deliberation.title
            existing.description = deliberation.description
            existing.deliberation_type = deliberation.deliberation_type.value
            existing.visibility = deliberation.visibility.value
            existing.status = deliberation.status.value
            existing.client_id = deliberation.client_id
            existing.funded_amount = deliberation.funded_amount
            existing.funded_currency = deliberation.funded_currency
            existing.panel_size = deliberation.panel_size
            existing.required_expertise = deliberation.required_expertise
            existing.sortition_seed = deliberation.sortition_seed
            existing.sortition_proof = deliberation.sortition_proof
            existing.embargo_until = deliberation.embargo_until

    async def save_participants(self, participants: list[DomainDeliberationParticipant]) -> None:
        for p in participants:
            existing = self.session.execute(
                select(DeliberationParticipant).where(
                    DeliberationParticipant.deliberation_id == p.deliberation_id,
                    DeliberationParticipant.citizen_id == p.citizen_id,
                )
            ).scalar_one_or_none()

            if existing is None:
                orm = DeliberationParticipant(
                    deliberation_id=p.deliberation_id,
                    citizen_id=p.citizen_id,
                    participated=p.participated,
                    points_awarded=p.points_awarded,
                )
                self.session.add(orm)
            else:
                existing.participated = p.participated
                existing.points_awarded = p.points_awarded

    async def get_participants(self, deliberation_id: uuid.UUID) -> list[DomainDeliberationParticipant]:
        stmt = (
            select(DeliberationParticipant)
            .where(DeliberationParticipant.deliberation_id == deliberation_id)
        )
        results = self.session.execute(stmt).scalars().all()
        return [_orm_to_domain_participant(r) for r in results]

    async def get_all_verified_citizen_ids(self) -> list[uuid.UUID]:
        stmt = (
            select(Citizen.id)
            .where(Citizen.verification_status == VerificationStatus.VERIFIED.value)
        )
        results = self.session.execute(stmt).scalars().all()
        return list(results)

    async def get_community_policy(self, key: str) -> Optional[DomainCommunityPolicy]:
        stmt = select(CommunityPolicy).where(
            CommunityPolicy.policy_key == key,
            CommunityPolicy.superseded_at.is_(None),
        )
        result = self.session.execute(stmt).scalar_one_or_none()
        if result is None:
            return None
        return _orm_to_domain_community_policy(result)


# Aliases for main.py imports
PointsRepo = SQLAlchemyPointsRepository
TreasuryRepo = SQLAlchemyTreasuryRepository
DeliberationRepo = SQLAlchemyDeliberationRepository
