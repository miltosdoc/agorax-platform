"""Tests for Points Manager — accrual, multipliers, redemption."""

import asyncio
import uuid
from datetime import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from agorax_economy.config import EconomyConfig
from agorax_economy.models import (
    Citizen,
    Deliberation,
    DeliberationType,
    PointsBalance,
    TransactionType,
    VerificationStatus,
)
from agorax_economy.points import (
    PointsManager,
    InsufficientPointsError,
    RedemptionBlockedError,
)


@pytest.fixture
def mock_repo():
    repo = AsyncMock()
    repo.get_balance = AsyncMock(return_value=PointsBalance(
        citizen_id=uuid.uuid4(),
        balance=10000,
        lifetime_earned=10000,
    ))
    repo.get_citizen = AsyncMock(return_value=Citizen(
        is_early_adopter=False,
        verification_status=VerificationStatus.VERIFIED,
    ))
    repo.upsert_balance = AsyncMock()
    repo.create_transaction = AsyncMock()
    repo.create_redemption = AsyncMock()
    return repo


@pytest.fixture
def config():
    return EconomyConfig()


@pytest.fixture
def manager(config, mock_repo):
    return PointsManager(config, mock_repo)


def test_calculate_micro_points(manager):
    """MICRO deliberation → 500 base points."""
    deliberation = Deliberation(
        deliberation_type=DeliberationType.MICRO,
        funded_amount=Decimal("200"),
    )
    citizen = Citizen(is_early_adopter=False)

    points = manager.calculate_deliberation_points(deliberation, citizen)
    assert points == 500


def test_calculate_expert_points(manager):
    """EXPERT deliberation → 5000 base points."""
    deliberation = Deliberation(
        deliberation_type=DeliberationType.EXPERT,
        funded_amount=Decimal("200"),
    )
    citizen = Citizen(is_early_adopter=False)

    points = manager.calculate_deliberation_points(deliberation, citizen)
    assert points == 5000


def test_early_adopter_multiplier(manager):
    """Early adopter earns 1.5x."""
    deliberation = Deliberation(
        deliberation_type=DeliberationType.MICRO,
        funded_amount=Decimal("200"),
    )
    citizen = Citizen(is_early_adopter=True)

    points = manager.calculate_deliberation_points(deliberation, citizen)
    assert points == 750  # 500 × 1.5


def test_funding_ratio_scaling(manager):
    """Well-funded deliberations pay more."""
    # €1000 funding → ratio = 1000/200 = 5.0, capped at 3.0
    deliberation = Deliberation(
        deliberation_type=DeliberationType.MICRO,
        funded_amount=Decimal("1000"),
    )
    citizen = Citizen(is_early_adopter=False)

    points = manager.calculate_deliberation_points(deliberation, citizen)
    # 500 × 3.0 (capped) = 1500
    assert points == 1500


def test_combined_multipliers(manager):
    """Early adopter + high funding → combined multiplier."""
    deliberation = Deliberation(
        deliberation_type=DeliberationType.MICRO,
        funded_amount=Decimal("600"),  # ratio = 3.0 (capped)
    )
    citizen = Citizen(is_early_adopter=True)

    points = manager.calculate_deliberation_points(deliberation, citizen)
    # 500 × 1.5 × 3.0 = 2250
    assert points == 2250


def test_points_to_eur(manager):
    """100 points = €1.00."""
    assert manager.points_to_eur(100) == Decimal("1.00")
    assert manager.points_to_eur(500) == Decimal("5.00")
    assert manager.points_to_eur(1500) == Decimal("15.00")


def test_eur_to_points(manager):
    """€1.00 = 100 points."""
    assert manager.eur_to_points(Decimal("1.00")) == 100
    assert manager.eur_to_points(Decimal("5.00")) == 500


async def test_redemption_blocked_pre_revenue(manager):
    """Redemption blocked during PRE_REVENUE phase."""
    with pytest.raises(RedemptionBlockedError):
        await manager.request_redemption(uuid.uuid4(), 100)


async def test_insufficient_points(mock_repo):
    """Insufficient points raises error."""
    from agorax_economy.config import Phase
    mock_repo.get_balance = AsyncMock(return_value=PointsBalance(
        balance=50,
        lifetime_earned=50,
    ))
    config = EconomyConfig(current_phase=Phase.EARLY_REVENUE)
    manager = PointsManager(config, mock_repo)

    with pytest.raises(InsufficientPointsError):
        await manager.request_redemption(uuid.uuid4(), 100)
