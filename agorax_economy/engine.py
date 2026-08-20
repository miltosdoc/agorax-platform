"""
AgoraX Economy — Economy Engine

Single entry point that orchestrates the full flow.
Your API layer calls this, nothing else.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional, Protocol

from .config import EconomyConfig
from .models import (
    Citizen,
    CommunityPolicy,
    Deliberation,
    DeliberationParticipant,
    DeliberationStatus,
    DeliberationVisibility,
    DeliberationType,
    DividendResult,
    PaymentInbound,
    RevenueSplit,
)
from .points import PointsManager, PointsRepository
from .treasury import TreasuryManager, TreasuryRepository
from .sortition import InsufficientPoolError, select_panel
from .payments import PaymentGateway


class DeliberationRepository(Protocol):
    """Repository interface for deliberation data access."""

    async def get(self, deliberation_id: uuid.UUID) -> Deliberation | None: ...
    async def save(self, deliberation: Deliberation) -> None: ...
    async def save_participants(
        self, participants: list[DeliberationParticipant]
    ) -> None: ...
    async def get_participants(
        self, deliberation_id: uuid.UUID
    ) -> list[DeliberationParticipant]: ...
    async def get_all_verified_citizen_ids(self) -> list[uuid.UUID]: ...
    async def get_community_policy(self, key: str) -> CommunityPolicy | None: ...


class EconomyEngine:
    """
    Single entry point for the economy module.

    Orchestrates: funding → sortition → deliberation → points → dividends.

    All methods are async. The engine assumes an async runtime (asyncio).
    """

    def __init__(
        self,
        config: EconomyConfig,
        treasury: TreasuryManager,
        points: PointsManager,
        payments: PaymentGateway,
        deliberation_repo: DeliberationRepository,
    ):
        self.config = config
        self.treasury = treasury
        self.points = points
        self.payments = payments
        self.deliberation_repo = deliberation_repo

    # ── Flow 1: Fund and Launch a Deliberation ────────────────

    async def fund_and_launch_deliberation(
        self,
        payment: PaymentInbound,
        deliberation: Deliberation,
        citizen_pool: list[str],  # List of citizen ID strings
    ) -> "LaunchResult":
        """
        Full flow: fund → split → sortition → launch.

        1. treasury.process_payment() → split 70/30, record in ledger
        2. Set deliberation.funded_amount → from payment EUR value
        3. If EMBARGOED: set embargo_until → community-decided delay
        4. sortition.select_panel() → verifiable random selection
        5. Store sortition_seed + proof → on deliberation record
        6. Set status = SORTITION_COMPLETE
        7. Persist deliberation + participants
        """
        from .models import LaunchResult

        # 1. Process payment — split 70/30
        split = await self.treasury.process_payment(
            payment, deliberation_id=deliberation.id
        )

        # 2. Set funded amount
        deliberation.funded_amount = payment.eur_equivalent
        deliberation.funded_currency = payment.currency
        deliberation.status = DeliberationStatus.FUNDED

        # 3. Handle embargo
        if deliberation.visibility == DeliberationVisibility.EMBARGOED:
            delay_days = self.config.default_disclosure_delay_days
            deliberation.embargo_until = datetime.now(timezone.utc) + timedelta(
                days=delay_days
            )

        # 4. Verifiable random sortition
        panel, seed_hex, proof_hex = select_panel(
            pool=citizen_pool,
            panel_size=deliberation.panel_size,
            deliberation_id=str(deliberation.id),
        )

        # 5. Store sortition data
        deliberation.sortition_seed = seed_hex
        deliberation.sortition_proof = proof_hex
        deliberation.status = DeliberationStatus.SORTITION_COMPLETE

        # 6. Create participant records
        participants = []
        for citizen_id_str in panel:
            participant = DeliberationParticipant(
                deliberation_id=deliberation.id,
                citizen_id=uuid.UUID(citizen_id_str),
            )
            participants.append(participant)

        # 7. Persist
        await self.deliberation_repo.save(deliberation)
        await self.deliberation_repo.save_participants(participants)

        return LaunchResult(
            deliberation_id=deliberation.id,
            revenue_split=split,
            sortition_seed=seed_hex,
            sortition_proof=proof_hex,
            panel_size=len(panel),
            participant_ids=[uuid.UUID(cid) for cid in panel],
        )

    # ── Flow 2: Complete a Deliberation ───────────────────────

    async def complete_deliberation(
        self,
        deliberation_id: uuid.UUID,
    ) -> dict:
        """
        Complete a deliberation and award points.

        1. Load deliberation + participants
        2. Filter to participants where participated=True
        3. For each: points.award_deliberation_points()
        4. Set participant.points_awarded
        5. Set deliberation.status = COMPLETED
        """
        deliberation = await self.deliberation_repo.get(deliberation_id)
        if deliberation is None:
            raise ValueError(f"Deliberation {deliberation_id} not found")

        participants = await self.deliberation_repo.get_participants(deliberation_id)

        total_points = 0
        per_citizen: dict[str, int] = {}

        for participant in participants:
            if not participant.participated:
                continue

            txn = await self.points.award_deliberation_points(
                deliberation, participant.citizen_id
            )
            participant.points_awarded = txn.points
            total_points += txn.points
            per_citizen[str(participant.citizen_id)] = txn.points

        # Update deliberation status
        deliberation.status = DeliberationStatus.COMPLETED
        await self.deliberation_repo.save(deliberation)
        await self.deliberation_repo.save_participants(participants)

        return {
            "deliberation_id": str(deliberation_id),
            "total_points_awarded": total_points,
            "per_citizen": per_citizen,
            "participants_count": len(per_citizen),
        }

    # ── Flow 3: Distribute Civic Dividend ─────────────────────

    async def distribute_dividend(self, total_eur: Decimal) -> DividendResult:
        """
        Distribute civic dividend equally among all verified citizens.

        Unconditional — participation not required.
        """
        total_points = self.points.eur_to_points(total_eur)
        eligible_ids = await self.deliberation_repo.get_all_verified_citizen_ids()

        if not eligible_ids:
            return DividendResult(
                total_eur=total_eur,
                total_points=total_points,
                eligible_count=0,
                points_per_citizen=0,
                eur_per_citizen=Decimal("0.00"),
            )

        points_per_citizen = total_points // len(eligible_ids)
        eur_per_citizen = self.points.points_to_eur(points_per_citizen)

        await self.points.distribute_civic_dividend(
            total_points_pool=points_per_citizen * len(eligible_ids),
            eligible_citizen_ids=eligible_ids,
        )

        return DividendResult(
            total_eur=total_eur,
            total_points=total_points,
            eligible_count=len(eligible_ids),
            points_per_citizen=points_per_citizen,
            eur_per_citizen=eur_per_citizen,
        )

    # ── Flow 4: Embargo Disclosure Check ──────────────────────

    async def check_and_disclose(
        self,
        deliberation_id: uuid.UUID,
    ) -> bool:
        """
        Check if an embargoed deliberation should be disclosed.

        If EMBARGOED and now >= embargo_until:
            Set visibility = PUBLIC
            Set status = DISCLOSED
        Returns True if disclosed.
        """
        deliberation = await self.deliberation_repo.get(deliberation_id)
        if deliberation is None:
            return False

        if (
            deliberation.visibility == DeliberationVisibility.EMBARGOED
            and deliberation.embargo_until
            and datetime.now(timezone.utc) >= deliberation.embargo_until
        ):
            deliberation.visibility = DeliberationVisibility.PUBLIC
            deliberation.status = DeliberationStatus.DISCLOSED
            await self.deliberation_repo.save(deliberation)
            return True

        return False

    # ── Flow 5: Public Transparency Stats ─────────────────────

    async def get_public_stats(self) -> dict:
        """
        Public transparency stats.

        Returns total revenue, citizen payouts, operations, profit.
        """
        return await self.treasury.get_transparency_report()
