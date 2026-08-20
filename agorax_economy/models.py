"""
AgoraX Economy — Data Models

Pure data classes defining the economic domain. No ORM dependency.
Your persistence layer wraps these.
"""

from __future__ import annotations

import enum
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional


# ── Enums ────────────────────────────────────────────────────

class VerificationStatus(enum.Enum):
    UNVERIFIED = "unverified"
    PENDING = "pending"
    VERIFIED = "verified"
    SUSPENDED = "suspended"


class DeliberationType(enum.Enum):
    MICRO = "micro"
    STANDARD = "standard"
    EXPERT = "expert"
    POLL = "poll"
    COMMUNITY_POLICY = "community_policy"


class DeliberationVisibility(enum.Enum):
    PUBLIC = "public"
    EMBARGOED = "embargoed"


class DeliberationStatus(enum.Enum):
    DRAFT = "draft"
    FUNDED = "funded"
    SORTITION_COMPLETE = "sortition_complete"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    RESULTS_PUBLISHED = "results_published"
    DISCLOSED = "disclosed"


class TransactionType(enum.Enum):
    DELIBERATION_REWARD = "deliberation_reward"
    CIVIC_DIVIDEND = "civic_dividend"
    REFERRAL_BONUS = "referral_bonus"
    EARLY_ADOPTER_BONUS = "early_adopter_bonus"
    REDEMPTION = "redemption"
    MANUAL_ADJUSTMENT = "manual_adjustment"


class LedgerEntryType(enum.Enum):
    INBOUND_PAYMENT = "inbound_payment"
    CITIZEN_PAYOUT = "citizen_payout"
    OPERATIONS_EXPENSE = "operations_expense"
    DIVIDEND_DISTRIBUTION = "dividend_distribution"


class PaymentStatus(enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FAILED = "failed"
    REFUNDED = "refunded"


class RedemptionStatus(enum.Enum):
    REQUESTED = "requested"
    PROCESSING = "processing"
    COMPLETED = "completed"
    REJECTED = "rejected"


# ── Data Classes ─────────────────────────────────────────────

@dataclass
class Citizen:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED
    joined_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    is_early_adopter: bool = False
    expertise_tags: list[str] = field(default_factory=list)
    referred_by: Optional[uuid.UUID] = None
    locale: str = "el"


@dataclass
class Deliberation:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    title: str = ""
    description: str = ""
    deliberation_type: DeliberationType = DeliberationType.STANDARD
    visibility: DeliberationVisibility = DeliberationVisibility.PUBLIC
    status: DeliberationStatus = DeliberationStatus.DRAFT
    client_id: str = ""
    funded_amount: Decimal = Decimal("0")
    funded_currency: str = "EUR"
    panel_size: int = 15
    required_expertise: list[str] = field(default_factory=list)
    sortition_seed: Optional[str] = None
    sortition_proof: Optional[str] = None
    embargo_until: Optional[datetime] = None


@dataclass
class DeliberationParticipant:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    deliberation_id: uuid.UUID = field(default_factory=uuid.uuid4)
    citizen_id: uuid.UUID = field(default_factory=uuid.uuid4)
    participated: bool = False
    points_awarded: int = 0


@dataclass
class PointsBalance:
    citizen_id: uuid.UUID = field(default_factory=uuid.uuid4)
    balance: int = 0
    lifetime_earned: int = 0


@dataclass
class Transaction:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    citizen_id: uuid.UUID = field(default_factory=uuid.uuid4)
    transaction_type: TransactionType = TransactionType.DELIBERATION_REWARD
    points: int = 0
    deliberation_id: Optional[uuid.UUID] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class TreasuryLedger:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    entry_type: LedgerEntryType = LedgerEntryType.INBOUND_PAYMENT
    amount_eur: Decimal = Decimal("0")
    original_amount: Decimal = Decimal("0")
    original_currency: str = "EUR"
    deliberation_id: Optional[uuid.UUID] = None
    payment_id: Optional[uuid.UUID] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class PaymentInbound:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    amount: Decimal = Decimal("0")
    currency: str = "EUR"
    eur_equivalent: Decimal = Decimal("0")
    payment_method: str = ""
    status: PaymentStatus = PaymentStatus.PENDING
    external_reference: Optional[str] = None
    deliberation_id: Optional[uuid.UUID] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class RedemptionRequest:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    citizen_id: uuid.UUID = field(default_factory=uuid.uuid4)
    points_amount: int = 0
    target_currency: str = "EUR"
    eur_amount: Decimal = Decimal("0")
    status: RedemptionStatus = RedemptionStatus.REQUESTED
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class CommunityPolicy:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    policy_key: str = ""
    policy_value: str = ""
    decided_by_deliberation_id: Optional[uuid.UUID] = None
    superseded_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ── Result Types ─────────────────────────────────────────────

@dataclass
class RevenueSplit:
    total: Decimal
    citizen: Decimal
    operations: Decimal
    profit: Decimal = Decimal("0.00")


@dataclass
class LaunchResult:
    deliberation_id: uuid.UUID
    revenue_split: RevenueSplit
    sortition_seed: str
    sortition_proof: str
    panel_size: int
    participant_ids: list[uuid.UUID]


@dataclass
class CompletionResult:
    deliberation_id: uuid.UUID
    total_points_awarded: int
    per_citizen: dict[str, int]  # citizen_id_str → points


@dataclass
class DividendResult:
    total_eur: Decimal
    total_points: int
    eligible_count: int
    points_per_citizen: int
    eur_per_citizen: Decimal
