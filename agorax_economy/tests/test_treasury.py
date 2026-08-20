"""Tests for Treasury Manager — 70/30 split, ledger entries."""

import asyncio
import uuid
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from agorax_economy.config import EconomyConfig
from agorax_economy.models import (
    LedgerEntryType,
    PaymentInbound,
    PaymentStatus,
    TreasuryLedger,
)
from agorax_economy.treasury import TreasuryManager


@pytest.fixture
def mock_repo():
    repo = AsyncMock()
    repo.create_ledger_entry = AsyncMock()
    repo.get_total_by_type = AsyncMock(return_value=Decimal("0"))
    repo.update_payment_status = AsyncMock()
    repo.get_operations_balance = AsyncMock(return_value=Decimal("0"))
    repo.get_citizen_pool_balance = AsyncMock(return_value=Decimal("0"))
    return repo


@pytest.fixture
def treasury(mock_repo):
    return TreasuryManager(EconomyConfig(), mock_repo)


async def test_seventy_thirty_split(treasury, mock_repo):
    """70% to citizens, 30% to operations."""
    payment = PaymentInbound(
        amount=Decimal("1000.00"),
        currency="EUR",
        eur_equivalent=Decimal("1000.00"),
    )

    split = await treasury.process_payment(payment)

    assert split.citizen == Decimal("700.00")
    assert split.operations == Decimal("300.00")
    assert split.profit == Decimal("0.00")
    assert split.total == Decimal("1000.00")


async def test_split_creates_three_ledger_entries(treasury, mock_repo):
    """Three ledger entries: inbound, citizen, operations."""
    payment = PaymentInbound(
        amount=Decimal("1000.00"),
        currency="EUR",
        eur_equivalent=Decimal("1000.00"),
    )

    await treasury.process_payment(payment)

    assert mock_repo.create_ledger_entry.call_count == 3

    calls = mock_repo.create_ledger_entry.call_args_list
    types = [c[0][0].entry_type for c in calls]

    assert LedgerEntryType.INBOUND_PAYMENT in types
    assert LedgerEntryType.CITIZEN_PAYOUT in types
    assert LedgerEntryType.OPERATIONS_EXPENSE in types


async def test_payment_marked_confirmed(treasury, mock_repo):
    """Payment status set to CONFIRMED after processing."""
    payment = PaymentInbound(
        amount=Decimal("1000.00"),
        currency="EUR",
        eur_equivalent=Decimal("1000.00"),
    )

    await treasury.process_payment(payment)

    mock_repo.update_payment_status.assert_called_once_with(
        payment.id, PaymentStatus.CONFIRMED
    )


async def test_rounding_no_loss(treasury, mock_repo):
    """citizen + operations = total (no rounding loss)."""
    # Amount that causes rounding: €100.01 × 0.70 = €70.007
    payment = PaymentInbound(
        amount=Decimal("100.01"),
        currency="EUR",
        eur_equivalent=Decimal("100.01"),
    )

    split = await treasury.process_payment(payment)

    # citizen_amount is rounded DOWN
    # operations_amount is the remainder
    assert split.citizen + split.operations == split.total


async def test_transparency_report(treasury, mock_repo):
    """Transparency report aggregates ledger totals."""
    mock_repo.get_total_by_type.side_effect = [
        Decimal("10000.00"),  # INBOUND_PAYMENT
        Decimal("7000.00"),   # CITIZEN_PAYOUT
        Decimal("3000.00"),   # OPERATIONS_EXPENSE
        Decimal("0.00"),      # DIVIDEND_DISTRIBUTION
    ]

    report = await treasury.get_transparency_report()

    assert report["total_revenue_eur"] == "10000.00"
    assert report["total_paid_to_citizens_eur"] == "7000.00"
    assert report["profit_eur"] == "0.00"
    assert report["citizen_share"] == "70%"


async def test_various_amounts(treasury, mock_repo):
    """Split works correctly for various amounts."""
    for amount in [Decimal("200"), Decimal("5000"), Decimal("15000.50")]:
        payment = PaymentInbound(
            amount=amount,
            currency="EUR",
            eur_equivalent=amount,
        )
        split = await treasury.process_payment(payment)
        assert split.citizen + split.operations == split.total
        assert split.profit == Decimal("0.00")
