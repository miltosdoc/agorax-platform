"""
AgoraX Economy Module

A non-profit economic engine for democratic deliberation.
Clients pay for deliberations. 70% goes to citizens, 30% to operations.
Zero profit. Zero shareholders.

Digital μισθός εκκλησιαστικός.
"""

from .config import EconomyConfig, Phase, DEFAULT_CONFIG
from .models import (
    Citizen,
    CommunityPolicy,
    Deliberation,
    DeliberationParticipant,
    DeliberationStatus,
    DeliberationType,
    DeliberationVisibility,
    LedgerEntryType,
    PaymentInbound,
    PaymentStatus,
    PointsBalance,
    RedemptionRequest,
    RedemptionStatus,
    RevenueSplit,
    Transaction,
    TransactionType,
    TreasuryLedger,
    VerificationStatus,
    LaunchResult,
    CompletionResult,
    DividendResult,
)
from .sortition import (
    InsufficientPoolError,
    SortitionWarning,
    select_panel,
    verify_selection,
)
from .points import (
    PointsManager,
    PointsRepository,
    InsufficientPointsError,
    RedemptionBlockedError,
)
from .treasury import TreasuryManager, TreasuryRepository
from .payments import (
    PaymentGateway,
    PaymentAdapter,
    ExchangeRateProvider,
    CoinGeckoProvider,
    StripeAdapter,
    BTCPayAdapter,
)
from .engine import EconomyEngine, DeliberationRepository

__all__ = [
    # Config
    "EconomyConfig",
    "Phase",
    "DEFAULT_CONFIG",
    # Models
    "Citizen",
    "CommunityPolicy",
    "Deliberation",
    "DeliberationParticipant",
    "DeliberationStatus",
    "DeliberationType",
    "DeliberationVisibility",
    "LedgerEntryType",
    "PaymentInbound",
    "PaymentStatus",
    "PointsBalance",
    "RedemptionRequest",
    "RedemptionStatus",
    "RevenueSplit",
    "Transaction",
    "TransactionType",
    "TreasuryLedger",
    "VerificationStatus",
    "LaunchResult",
    "CompletionResult",
    "DividendResult",
    # Sortition
    "InsufficientPoolError",
    "SortitionWarning",
    "select_panel",
    "verify_selection",
    # Points
    "PointsManager",
    "PointsRepository",
    "InsufficientPointsError",
    "RedemptionBlockedError",
    # Treasury
    "TreasuryManager",
    "TreasuryRepository",
    # Payments
    "PaymentGateway",
    "PaymentAdapter",
    "ExchangeRateProvider",
    "CoinGeckoProvider",
    "StripeAdapter",
    "BTCPayAdapter",
    # Engine
    "EconomyEngine",
    "DeliberationRepository",
]

__version__ = "0.1.0"
