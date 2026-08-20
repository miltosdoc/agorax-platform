"""Tests for EconomyConfig — constitutional enforcement."""

import pytest
from decimal import Decimal

from agorax_economy.config import EconomyConfig, Phase


def test_default_config_valid():
    """Default config should be valid."""
    config = EconomyConfig()
    assert config.citizen_share == Decimal("0.70")
    assert config.operations_share == Decimal("0.30")
    assert config.profit_share == Decimal("0.00")


def test_profit_share_enforcement():
    """profit_share != 0.00 must raise ValueError."""
    with pytest.raises(ValueError, match="non-profit"):
        EconomyConfig(profit_share=Decimal("0.01"))


def test_shares_must_sum_to_one():
    """Shares must sum to 1.0."""
    with pytest.raises(ValueError, match="sum to 1.0"):
        EconomyConfig(citizen_share=Decimal("0.50"), operations_share=Decimal("0.20"))


def test_points_to_eur_rounds_down():
    """points_to_eur rounds DOWN (never overpay)."""
    config = EconomyConfig()
    # 150 points = €1.50
    assert config.points_to_eur(150) == Decimal("1.50")
    # 101 points = €1.01
    assert config.points_to_eur(101) == Decimal("1.01")
    # 99 points = €0.99
    assert config.points_to_eur(99) == Decimal("0.99")


def test_eur_to_points_truncates():
    """eur_to_points truncates to int."""
    config = EconomyConfig()
    assert config.eur_to_points(Decimal("1.50")) == 150
    assert config.eur_to_points(Decimal("0.99")) == 99


def test_base_points_lookup():
    """base_points_for_type returns correct values."""
    config = EconomyConfig()
    assert config.base_points_for_type("MICRO") == 500
    assert config.base_points_for_type("STANDARD") == 2000
    assert config.base_points_for_type("EXPERT") == 5000
    assert config.base_points_for_type("POLL") == 250
    assert config.base_points_for_type("COMMUNITY_POLICY") == 2000


def test_disclosure_delay_bounds():
    """Disclosure delay bounds are enforced."""
    with pytest.raises(ValueError):
        EconomyConfig(
            minimum_disclosure_delay_days=100,
            maximum_disclosure_delay_days=50,
        )


def test_config_to_dict():
    """to_dict serializes correctly."""
    config = EconomyConfig()
    d = config.to_dict()
    assert d["citizen_share"] == "0.70"
    assert d["profit_share"] == "0.00"
    assert d["current_phase"] == "pre_revenue"
