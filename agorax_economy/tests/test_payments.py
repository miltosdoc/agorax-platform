"""Tests for Payment Gateway — adapter registration, currency routing."""

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from agorax_economy.payments import (
    PaymentGateway,
    StripeAdapter,
    BTCPayAdapter,
    CoinGeckoProvider,
)


def test_register_adapter():
    """Adapter registration works."""
    gateway = PaymentGateway()
    adapter = StripeAdapter(api_key="sk_test_123")
    gateway.register_adapter(adapter)

    assert "stripe" in gateway.available_methods()


def test_available_methods():
    """available_methods returns registered adapters."""
    gateway = PaymentGateway()
    gateway.register_adapter(StripeAdapter())
    gateway.register_adapter(BTCPayAdapter())

    methods = gateway.available_methods()
    assert "stripe" in methods
    assert "btcpay" in methods


def test_unsupported_method_raises():
    """Unknown payment method raises ValueError."""
    gateway = PaymentGateway()

    with pytest.raises(ValueError, match="not available"):
        gateway.get_adapter("paypal")


async def test_initiate_payment_creates_record():
    """initiate_payment creates a PaymentInbound record."""
    gateway = PaymentGateway()
    adapter = StripeAdapter()
    gateway.register_adapter(adapter)

    # Mock the adapter's create_payment_intent
    adapter.create_payment_intent = AsyncMock(return_value={
        "client_secret": "test_secret",
        "payment_intent_id": "pi_test_123",
    })

    intent, payment = await gateway.initiate_payment(
        amount=Decimal("500.00"),
        currency="EUR",
        method="stripe",
        description="Test deliberation",
    )

    assert payment.amount == Decimal("500.00")
    assert payment.currency == "EUR"
    assert payment.payment_method == "stripe"


async def test_unsupported_currency_raises():
    """Unsupported currency for adapter raises ValueError."""
    gateway = PaymentGateway()
    gateway.register_adapter(StripeAdapter())

    with pytest.raises(ValueError, match="not supported"):
        await gateway.initiate_payment(
            amount=Decimal("1.0"),
            currency="BTC",
            method="stripe",
        )


def test_coin_gecko_eur_rate():
    """EUR → EUR returns 1.00."""
    provider = CoinGeckoProvider()
    # Synchronous check — EUR is handled without API call
    import asyncio
    rate = asyncio.run(provider.get_rate("EUR"))
    assert rate == Decimal("1.00")
