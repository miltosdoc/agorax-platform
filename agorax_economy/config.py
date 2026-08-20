"""
AgoraX Economy — Configuration

All tunable economic parameters. Enforces the non-profit constraint
at initialization. Constitutional — not a suggestion.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_DOWN
from typing import Any


class Phase(enum.Enum):
    """Platform maturity phase. Controls redemption and dividend availability."""
    PRE_REVENUE = "pre_revenue"
    EARLY_REVENUE = "early_revenue"
    SCALED = "scaled"


@dataclass(frozen=True)
class EconomyConfig:
    """
    Economic parameters for the AgoraX platform.

    The non-profit constraint is enforced: profit_share must be 0.00
    and citizen_share + operations_share must equal 1.0.
    """

    citizen_share: Decimal = Decimal("0.70")
    operations_share: Decimal = Decimal("0.30")
    profit_share: Decimal = Decimal("0.00")

    points_per_eur: int = 100
    early_adopter_multiplier: Decimal = Decimal("1.5")

    micro_deliberation_base_points: int = 500
    standard_deliberation_base_points: int = 2000
    expert_deliberation_base_points: int = 5000
    poll_base_points: int = 250
    community_policy_base_points: int = 2000

    default_disclosure_delay_days: int = 180
    minimum_disclosure_delay_days: int = 30
    maximum_disclosure_delay_days: int = 365

    referral_bonus_points: int = 1000

    funding_ratio_cap: Decimal = Decimal("3.0")
    minimum_funding_for_ratio: Decimal = Decimal("200")

    current_phase: Phase = Phase.PRE_REVENUE

    def __post_init__(self) -> None:
        # Constitutional enforcement: no profit
        if self.profit_share != Decimal("0.00"):
            raise ValueError(
                f"profit_share must be 0.00 (got {self.profit_share}). "
                "This platform is non-profit by constitutional design."
            )

        # Shares must sum to 1.0
        total = self.citizen_share + self.operations_share + self.profit_share
        if total != Decimal("1.0"):
            raise ValueError(
                f"Shares must sum to 1.0 (got {total}). "
                f"citizen={self.citizen_share}, ops={self.operations_share}, profit={self.profit_share}"
            )

        # Disclosure delay bounds
        if self.minimum_disclosure_delay_days > self.maximum_disclosure_delay_days:
            raise ValueError(
                f"minimum_disclosure_delay_days ({self.minimum_disclosure_delay_days}) "
                f"cannot exceed maximum ({self.maximum_disclosure_delay_days})"
            )

        if self.default_disclosure_delay_days < self.minimum_disclosure_delay_days:
            raise ValueError(
                f"default_disclosure_delay_days ({self.default_disclosure_delay_days}) "
                f"below minimum ({self.minimum_disclosure_delay_days})"
            )

        if self.default_disclosure_delay_days > self.maximum_disclosure_delay_days:
            raise ValueError(
                f"default_disclosure_delay_days ({self.default_disclosure_delay_days}) "
                f"exceeds maximum ({self.maximum_disclosure_delay_days})"
            )

    def points_to_eur(self, points: int) -> Decimal:
        """Convert Democracy Points to EUR. Rounds DOWN (never overpay)."""
        return (Decimal(points) / Decimal(self.points_per_eur)).quantize(
            Decimal("0.01"), rounding=ROUND_DOWN
        )

    def eur_to_points(self, eur: Decimal) -> int:
        """Convert EUR to Democracy Points. Truncated to int."""
        return int(eur * Decimal(self.points_per_eur))

    def base_points_for_type(self, deliberation_type: str) -> int:
        """Look up base points for a deliberation type."""
        mapping = {
            "MICRO": self.micro_deliberation_base_points,
            "STANDARD": self.standard_deliberation_base_points,
            "EXPERT": self.expert_deliberation_base_points,
            "POLL": self.poll_base_points,
            "COMMUNITY_POLICY": self.community_policy_base_points,
        }
        return mapping.get(deliberation_type, self.standard_deliberation_base_points)

    def to_dict(self) -> dict[str, Any]:
        """Serialize config for API responses."""
        return {
            "citizen_share": str(self.citizen_share),
            "operations_share": str(self.operations_share),
            "profit_share": str(self.profit_share),
            "points_per_eur": self.points_per_eur,
            "early_adopter_multiplier": str(self.early_adopter_multiplier),
            "current_phase": self.current_phase.value,
            "default_disclosure_delay_days": self.default_disclosure_delay_days,
        }


# Default singleton — import and use directly
DEFAULT_CONFIG = EconomyConfig()
