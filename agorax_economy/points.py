"""
AgoraX Economy — Points Manager

Converts deliberation participation into Democracy Points
(ο μισθός εκκλησιαστικός). Handles accrual, conversion rates, and redemption.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, ROUND_DOWN
from typing import Optional, Protocol

from .config import EconomyConfig
from .models import (
    Citizen,
    Deliberation,
    DeliberationParticipant,
    PointsBalance,
    RedemptionRequest,
    Transaction,
    TransactionType,
    RedemptionStatus,
)


class InsufficientPointsError(Exception):
    """Raised when a citizen doesn't have enough points for redemption."""
    pass


class RedemptionBlockedError(Exception):
    """Raised when redemption is attempted during PRE_REVENUE phase."""
    pass


class PointsRepository(Protocol):
    """Repository interface for points-related data access."""

    async def get_balance(self, citizen_id: uuid.UUID) -> PointsBalance | None: ...
    async def upsert_balance(self, balance: PointsBalance) -> None: ...
    async def create_transaction(self, txn: Transaction) -> None: ...
    async def get_citizen(self, citizen_id: uuid.UUID) -> Citizen | None: ...
    async def create_redemption(self, request: RedemptionRequest) -> None: ...


class PointsManager:
    """
    Manages Democracy Points: accrual, conversion, and redemption.

    All point mutations go through _credit() and _debit() —
    no direct balance manipulation. Every mutation creates a
    Transaction record for full audit trail.
    """

    def __init__(
        self,
        config: EconomyConfig,
        repo: PointsRepository,
    ):
        self.config = config
        self.repo = repo

    # ── Points Calculation ────────────────────────────────────

    def calculate_deliberation_points(
        self,
        deliberation: Deliberation,
        citizen: Citizen,
    ) -> int:
        """
        Calculate points for a citizen completing a deliberation.

        Formula:
            base_points = lookup by deliberation_type
            multiplier = 1.0
            if citizen.is_early_adopter: multiplier *= 1.5
            if funded_amount > €200:
                funding_ratio = funded_amount / 200, capped at 3.0
                multiplier *= funding_ratio
            final_points = base_points × multiplier
        """
        base_points = self.config.base_points_for_type(
            deliberation.deliberation_type.value.upper()
        )

        multiplier = Decimal("1.0")

        # Early adopter bonus (permanent)
        if citizen.is_early_adopter:
            multiplier *= self.config.early_adopter_multiplier

        # Funding ratio scaling (well-funded deliberations pay more)
        if deliberation.funded_amount > self.config.minimum_funding_for_ratio:
            funding_ratio = (
                deliberation.funded_amount / self.config.minimum_funding_for_ratio
            )
            funding_ratio = min(funding_ratio, self.config.funding_ratio_cap)
            multiplier *= funding_ratio

        final_points = int(base_points * multiplier)
        return max(final_points, 1)  # At least 1 point

    # ── Award Operations ─────────────────────────────────────

    async def award_deliberation_points(
        self,
        deliberation: Deliberation,
        citizen_id: uuid.UUID,
    ) -> Transaction:
        """
        Award points for completing a deliberation.

        Returns the created Transaction record.
        """
        citizen = await self.repo.get_citizen(citizen_id)
        if citizen is None:
            raise ValueError(f"Citizen {citizen_id} not found")

        points = self.calculate_deliberation_points(deliberation, citizen)

        txn = Transaction(
            citizen_id=citizen_id,
            transaction_type=TransactionType.DELIBERATION_REWARD,
            points=points,
            deliberation_id=deliberation.id,
        )

        await self._credit(citizen_id, points, txn)
        return txn

    async def award_referral_bonus(
        self,
        referrer_id: uuid.UUID,
        new_citizen_id: uuid.UUID,
    ) -> Transaction:
        """
        Award referral bonus when referred citizen reaches VERIFIED status.
        """
        points = self.config.referral_bonus_points

        txn = Transaction(
            citizen_id=referrer_id,
            transaction_type=TransactionType.REFERRAL_BONUS,
            points=points,
        )
        txn.points = points  # Ensure positive
        await self._credit(referrer_id, points, txn)
        return txn

    async def distribute_civic_dividend(
        self,
        total_points_pool: int,
        eligible_citizen_ids: list[uuid.UUID],
    ) -> list[Transaction]:
        """
        Divide pool equally among all verified citizens.

        Unconditional — participation not required.
        Integer division; remainder stays in pool for next cycle.
        """
        if not eligible_citizen_ids:
            return []

        points_per_citizen = total_points_pool // len(eligible_citizen_ids)
        transactions = []

        for citizen_id in eligible_citizen_ids:
            txn = Transaction(
                citizen_id=citizen_id,
                transaction_type=TransactionType.CIVIC_DIVIDEND,
                points=points_per_citizen,
            )
            await self._credit(citizen_id, points_per_citizen, txn)
            transactions.append(txn)

        return transactions

    # ── Redemption ────────────────────────────────────────────

    async def request_redemption(
        self,
        citizen_id: uuid.UUID,
        points_amount: int,
        target_currency: str = "EUR",
    ) -> RedemptionRequest:
        """
        Request points redemption.

        Only available when current_phase != PRE_REVENUE.
        Debits points immediately (hold). Creates RedemptionRequest.
        Actual payout handled by payment gateway (separate process).
        """
        if self.config.current_phase.value == "pre_revenue":
            raise RedemptionBlockedError(
                "Redemption is not available during PRE_REVENUE phase. "
                "Points will become redeemable once the platform has revenue."
            )

        balance = await self.repo.get_balance(citizen_id)
        if balance is None or balance.balance < points_amount:
            raise InsufficientPointsError(
                f"Insufficient points. Balance: {balance.balance if balance else 0}, "
                f"requested: {points_amount}"
            )

        eur_amount = self.config.points_to_eur(points_amount)

        # Debit points immediately
        txn = Transaction(
            citizen_id=citizen_id,
            transaction_type=TransactionType.REDEMPTION,
            points=-points_amount,  # Negative = debit
        )
        await self._debit(citizen_id, points_amount, txn)

        # Create redemption request
        request = RedemptionRequest(
            citizen_id=citizen_id,
            points_amount=points_amount,
            target_currency=target_currency,
            eur_amount=eur_amount,
            status=RedemptionStatus.REQUESTED,
        )
        await self.repo.create_redemption(request)
        return request

    # ── Conversion ────────────────────────────────────────────

    def points_to_eur(self, points: int) -> Decimal:
        """Convert Democracy Points to EUR. Rounds DOWN."""
        return self.config.points_to_eur(points)

    def eur_to_points(self, eur: Decimal) -> int:
        """Convert EUR to Democracy Points. Truncated to int."""
        return self.config.eur_to_points(eur)

    # ── Internal ──────────────────────────────────────────────

    async def _credit(
        self,
        citizen_id: uuid.UUID,
        points: int,
        txn: Transaction,
    ) -> None:
        """Credit points to a citizen's balance. Creates transaction record."""
        balance = await self.repo.get_balance(citizen_id)

        if balance is None:
            balance = PointsBalance(
                citizen_id=citizen_id,
                balance=points,
                lifetime_earned=points,
            )
        else:
            balance.balance += points
            balance.lifetime_earned += points

        await self.repo.upsert_balance(balance)
        await self.repo.create_transaction(txn)

    async def _debit(
        self,
        citizen_id: uuid.UUID,
        points: int,
        txn: Transaction,
    ) -> None:
        """Debit points from a citizen's balance. Creates transaction record."""
        balance = await self.repo.get_balance(citizen_id)

        if balance is None or balance.balance < points:
            raise InsufficientPointsError(
                f"Insufficient points for debit. "
                f"Balance: {balance.balance if balance else 0}, "
                f"requested: {points}"
            )

        balance.balance -= points
        # lifetime_earned does NOT decrease — it's a lifetime stat
        await self.repo.upsert_balance(balance)
        await self.repo.create_transaction(txn)
