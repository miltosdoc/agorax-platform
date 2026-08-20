"""
AgoraX Economy — Treasury Manager

Splits every incoming payment: 70% citizen pool, 30% operations.
Maintains a transparent double-entry ledger. Constitutional.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN
from typing import Protocol

from .config import EconomyConfig
from .models import (
    LedgerEntryType,
    PaymentInbound,
    PaymentStatus,
    RevenueSplit,
    TreasuryLedger,
)


class TreasuryRepository(Protocol):
    """Repository interface for treasury data access."""

    async def create_ledger_entry(self, entry: TreasuryLedger) -> None: ...
    async def get_total_by_type(self, entry_type: LedgerEntryType) -> Decimal: ...
    async def update_payment_status(
        self, payment_id: uuid.UUID, status: PaymentStatus
    ) -> None: ...
    async def get_operations_balance(self) -> Decimal: ...
    async def get_citizen_pool_balance(self) -> Decimal: ...


class TreasuryManager:
    """
    Manages the 70/30 revenue split and transparent ledger.

    TreasuryLedger is append-only. Never update or delete entries.
    The transparency report is constitutional — not optional.
    """

    def __init__(
        self,
        config: EconomyConfig,
        repo: TreasuryRepository,
    ):
        self.config = config
        self.repo = repo

    async def process_payment(
        self,
        payment: PaymentInbound,
        deliberation_id: uuid.UUID | None = None,
    ) -> RevenueSplit:
        """
        Process an incoming payment: split 70/30, record in ledger.

        1. Take payment.amount_eur (already normalized)
        2. citizen_amount = amount × 0.70 (round DOWN)
        3. operations_amount = amount - citizen_amount (remainder — no rounding loss)
        4. Create three TreasuryLedger entries
        5. Mark payment as CONFIRMED
        """
        amount = payment.eur_equivalent

        # Split: 70% citizens, 30% operations
        citizen_amount = (amount * self.config.citizen_share).quantize(
            Decimal("0.01"), rounding=ROUND_DOWN
        )
        operations_amount = amount - citizen_amount  # Remainder — no rounding loss

        # Create ledger entries
        now = datetime.now(timezone.utc)

        # 1. Inbound payment (full amount)
        inbound = TreasuryLedger(
            entry_type=LedgerEntryType.INBOUND_PAYMENT,
            amount_eur=amount,
            original_amount=payment.amount,
            original_currency=payment.currency,
            deliberation_id=deliberation_id,
            payment_id=payment.id,
            created_at=now,
        )
        await self.repo.create_ledger_entry(inbound)

        # 2. Citizen payout (70%)
        citizen_entry = TreasuryLedger(
            entry_type=LedgerEntryType.CITIZEN_PAYOUT,
            amount_eur=citizen_amount,
            original_amount=citizen_amount,
            original_currency="EUR",
            deliberation_id=deliberation_id,
            payment_id=payment.id,
            created_at=now,
        )
        await self.repo.create_ledger_entry(citizen_entry)

        # 3. Operations expense (30%)
        ops_entry = TreasuryLedger(
            entry_type=LedgerEntryType.OPERATIONS_EXPENSE,
            amount_eur=operations_amount,
            original_amount=operations_amount,
            original_currency="EUR",
            deliberation_id=deliberation_id,
            payment_id=payment.id,
            created_at=now,
        )
        await self.repo.create_ledger_entry(ops_entry)

        # Mark payment as confirmed
        await self.repo.update_payment_status(payment.id, PaymentStatus.CONFIRMED)

        return RevenueSplit(
            total=amount,
            citizen=citizen_amount,
            operations=operations_amount,
            profit=Decimal("0.00"),
        )

    async def get_transparency_report(self) -> dict[str, str]:
        """
        Aggregate all ledger entries by type.

        Public endpoint — anyone can see where every euro went.
        Constitutional to the platform.
        """
        total_revenue = await self.repo.get_total_by_type(
            LedgerEntryType.INBOUND_PAYMENT
        )
        total_citizen = await self.repo.get_total_by_type(
            LedgerEntryType.CITIZEN_PAYOUT
        )
        total_operations = await self.repo.get_total_by_type(
            LedgerEntryType.OPERATIONS_EXPENSE
        )
        total_dividends = await self.repo.get_total_by_type(
            LedgerEntryType.DIVIDEND_DISTRIBUTION
        )

        return {
            "total_revenue_eur": str(total_revenue),
            "total_paid_to_citizens_eur": str(total_citizen),
            "total_operations_eur": str(total_operations),
            "total_dividends_eur": str(total_dividends),
            "profit_eur": "0.00",
            "citizen_share": f"{self.config.citizen_share * 100:.0f}%",
            "operations_share": f"{self.config.operations_share * 100:.0f}%",
        }

    async def get_operations_balance(self) -> Decimal:
        """Get available operations funds."""
        return await self.repo.get_operations_balance()

    async def get_citizen_pool_balance(self) -> Decimal:
        """Get available citizen pool funds."""
        return await self.repo.get_citizen_pool_balance()
