"""
SQLAlchemy ORM models for the Economy Service.

Maps each agorax_economy data class to a database table.
All money uses NUMERIC (Decimal), all timestamps are UTC, UUIDs for PKs.
"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    Boolean,
    Index,
    func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import declarative_base, relationship

import uuid as _uuid

Base = declarative_base()


# ── Citizens ────────────────────────────────────────────────────────────────

class Citizen(Base):
    """Verified citizen of the platform."""

    __tablename__ = "citizens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    verification_status = Column(
        Enum("unverified", "pending", "verified", "suspended", name="verification_status"),
        nullable=False,
        default="unverified",
        index=True,
    )
    joined_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    is_early_adopter = Column(Boolean, nullable=False, default=False)
    expertise_tags = Column(JSONB, nullable=False, default=[])
    referred_by = Column(UUID(as_uuid=True), ForeignKey("citizens.id"), nullable=True)
    locale = Column(String(10), nullable=False, default="el")

    # Relationships
    balances = relationship("PointsBalance", back_populates="citizen", uselist=False)
    transactions = relationship("Transaction", back_populates="citizen")
    redemption_requests = relationship("RedemptionRequest", back_populates="citizen")
    deliberation_participations = relationship("DeliberationParticipant", back_populates="citizen")

    __table_args__ = (
        Index("ix_citizens_verification_status", "verification_status"),
    )

    def __repr__(self) -> str:
        return f"<Citizen(id={self.id}, status={self.verification_status})>"


# ── Deliberations ───────────────────────────────────────────────────────────

class Deliberation(Base):
    """A deliberation (poll, expert panel, etc.) created by a client."""

    __tablename__ = "deliberations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    title = Column(String(512), nullable=False)
    description = Column(Text, nullable=False, default="")
    deliberation_type = Column(
        Enum("micro", "standard", "expert", "poll", "community_policy", name="deliberation_type"),
        nullable=False,
        default="standard",
    )
    visibility = Column(
        Enum("public", "embargoed", name="deliberation_visibility"),
        nullable=False,
        default="public",
    )
    status = Column(
        Enum(
            "draft", "funded", "sortition_complete", "in_progress",
            "completed", "results_published", "disclosed",
            name="deliberation_status",
        ),
        nullable=False,
        default="draft",
        index=True,
    )
    client_id = Column(String(255), nullable=False, default="")
    funded_amount = Column(Numeric(15, 2), nullable=False, default=Decimal("0"))
    funded_currency = Column(String(10), nullable=False, default="EUR")
    panel_size = Column(Integer, nullable=False, default=15)
    required_expertise = Column(JSONB, nullable=False, default=[])
    sortition_seed = Column(String(64), nullable=True)
    sortition_proof = Column(String(64), nullable=True)
    embargo_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    # Relationships
    participants = relationship("DeliberationParticipant", back_populates="deliberation")
    transactions = relationship("Transaction")
    treasury_entries = relationship("TreasuryLedger")
    payments = relationship("PaymentInbound")

    __table_args__ = (
        Index("ix_deliberations_status_type", "status", "deliberation_type"),
    )

    def __repr__(self) -> str:
        return f"<Deliberation(id={self.id}, status={self.status})>"


# ── Deliberation Participants ───────────────────────────────────────────────

class DeliberationParticipant(Base):
    """Links a citizen to a deliberation panel."""

    __tablename__ = "deliberation_participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    deliberation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("deliberations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    citizen_id = Column(
        UUID(as_uuid=True),
        ForeignKey("citizens.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    participated = Column(Boolean, nullable=False, default=False)
    points_awarded = Column(Integer, nullable=False, default=0)

    # Relationships
    deliberation = relationship("Deliberation", back_populates="participants")
    citizen = relationship("Citizen", back_populates="deliberation_participations")

    __table_args__ = (
        Index("ix_dp_deliberation_citizen", "deliberation_id", "citizen_id", unique=True),
    )

    def __repr__(self) -> str:
        return f"<DeliberationParticipant(deliberation={self.deliberation_id}, citizen={self.citizen_id})>"


# ── Points Balances ─────────────────────────────────────────────────────────

class PointsBalance(Base):
    """Current Democracy Points balance for a citizen."""

    __tablename__ = "points_balances"

    citizen_id = Column(
        UUID(as_uuid=True),
        ForeignKey("citizens.id", ondelete="CASCADE"),
        primary_key=True,
    )
    balance = Column(Integer, nullable=False, default=0)
    lifetime_earned = Column(Integer, nullable=False, default=0)

    # Relationships
    citizen = relationship("Citizen", back_populates="balances")

    def __repr__(self) -> str:
        return f"<PointsBalance(citizen={self.citizen_id}, balance={self.balance})>"


# ── Transactions ────────────────────────────────────────────────────────────

class Transaction(Base):
    """Audit trail for every points mutation."""

    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    citizen_id = Column(
        UUID(as_uuid=True),
        ForeignKey("citizens.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    transaction_type = Column(
        Enum(
            "deliberation_reward", "civic_dividend", "referral_bonus",
            "early_adopter_bonus", "redemption", "manual_adjustment",
            name="transaction_type",
        ),
        nullable=False,
        default="deliberation_reward",
    )
    points = Column(Integer, nullable=False, default=0)
    deliberation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("deliberations.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    # Relationships
    citizen = relationship("Citizen", back_populates="transactions")

    __table_args__ = (
        Index("ix_transactions_citizen_created", "citizen_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Transaction(id={self.id}, type={self.transaction_type}, points={self.points})>"


# ── Treasury Ledger ─────────────────────────────────────────────────────────

class TreasuryLedger(Base):
    """Append-only double-entry ledger for the treasury."""

    __tablename__ = "treasury_ledger"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    entry_type = Column(
        Enum(
            "inbound_payment", "citizen_payout",
            "operations_expense", "dividend_distribution",
            name="ledger_entry_type",
        ),
        nullable=False,
        index=True,
    )
    amount_eur = Column(Numeric(15, 2), nullable=False)
    original_amount = Column(Numeric(15, 2), nullable=False, default=Decimal("0"))
    original_currency = Column(String(10), nullable=False, default="EUR")
    deliberation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("deliberations.id", ondelete="SET NULL"),
        nullable=True,
    )
    payment_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_treasury_ledger_type_created", "entry_type", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<TreasuryLedger(type={self.entry_type}, amount={self.amount_eur} EUR)>"


# ── Inbound Payments ────────────────────────────────────────────────────────

class PaymentInbound(Base):
    """Record of an incoming payment from a client."""

    __tablename__ = "payments_inbound"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(10), nullable=False, default="EUR")
    eur_equivalent = Column(Numeric(15, 2), nullable=False, default=Decimal("0"))
    payment_method = Column(String(50), nullable=False, default="")
    status = Column(
        Enum("pending", "confirmed", "failed", "refunded", name="payment_status"),
        nullable=False,
        default="pending",
        index=True,
    )
    external_reference = Column(String(255), nullable=True)
    deliberation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("deliberations.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_payments_inbound_external_ref", "external_reference"),
    )

    def __repr__(self) -> str:
        return f"<PaymentInbound(id={self.id}, status={self.status}, amount={self.amount})>"


# ── Redemption Requests ─────────────────────────────────────────────────────

class RedemptionRequest(Base):
    """Citizen request to convert points to fiat/crypto."""

    __tablename__ = "redemption_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    citizen_id = Column(
        UUID(as_uuid=True),
        ForeignKey("citizens.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    points_amount = Column(Integer, nullable=False)
    target_currency = Column(String(10), nullable=False, default="EUR")
    eur_amount = Column(Numeric(15, 2), nullable=False)
    status = Column(
        Enum("requested", "processing", "completed", "rejected", name="redemption_status"),
        nullable=False,
        default="requested",
        index=True,
    )
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    # Relationships
    citizen = relationship("Citizen", back_populates="redemption_requests")

    def __repr__(self) -> str:
        return f"<RedemptionRequest(id={self.id}, status={self.status})>"


# ── Community Policies ──────────────────────────────────────────────────────

class CommunityPolicy(Base):
    """Platform-wide policy decided by deliberation."""

    __tablename__ = "community_policies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    policy_key = Column(String(255), nullable=False, unique=True, index=True)
    policy_value = Column(Text, nullable=False)
    decided_by_deliberation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("deliberations.id", ondelete="SET NULL"),
        nullable=True,
    )
    superseded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"<CommunityPolicy(key={self.policy_key})>"
