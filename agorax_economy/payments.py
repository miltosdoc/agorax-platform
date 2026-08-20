"""
AgoraX Economy — Payment Gateway

The "socket" — accepts any currency through pluggable adapters.
Normalizes everything to EUR for the treasury.
"""

from __future__ import annotations

import abc
import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Protocol

from .models import PaymentInbound, PaymentStatus


# ── Payment Adapter Protocol ─────────────────────────────────

class PaymentAdapter(abc.ABC):
    """
    Pluggable payment method adapter.

    Each adapter handles a specific payment rail (Stripe, BTCPay, etc.)
    and normalizes to EUR for the treasury.
    """

    @abc.abstractmethod
    async def create_payment_intent(
        self,
        amount: Decimal,
        currency: str,
        description: str = "",
    ) -> dict[str, Any]:
        """Start a payment on the external system. Returns intent data."""
        ...

    @abc.abstractmethod
    async def verify_payment(
        self,
        external_reference: str,
    ) -> tuple[bool, Decimal]:
        """
        Check if payment is confirmed.

        Returns (is_confirmed, eur_equivalent).
        """
        ...

    @abc.abstractmethod
    def supported_currencies(self) -> list[str]:
        """What currencies this adapter handles."""
        ...

    @property
    @abc.abstractmethod
    def name(self) -> str:
        """Human-readable adapter name."""
        ...


# ── Exchange Rate Provider ───────────────────────────────────

class ExchangeRateProvider(abc.ABC):
    """Convert any currency to EUR."""

    @abc.abstractmethod
    async def get_rate(self, currency: str) -> Decimal:
        """Get EUR conversion rate for a currency."""
        ...


class CoinGeckoProvider(ExchangeRateProvider):
    """
    Exchange rates via CoinGecko free API.

    For launch — replace with ECB + CoinGecko combo in production.
    """

    def __init__(self, api_url: str = "https://api.coingecko.com/api/v3"):
        self.api_url = api_url
        self._cache: dict[str, tuple[Decimal, datetime]] = {}
        self._cache_ttl_seconds = 300  # 5 minutes

    async def get_rate(self, currency: str) -> Decimal:
        """
        Get EUR conversion rate.

        Returns how many EUR = 1 unit of the given currency.
        EUR → EUR returns 1.00.
        """
        if currency.upper() == "EUR":
            return Decimal("1.00")

        # Check cache
        now = datetime.utcnow()
        if currency in self._cache:
            rate, cached_at = self._cache[currency]
            if (now - cached_at).total_seconds() < self._cache_ttl_seconds:
                return rate

        # Fetch from CoinGecko
        # TODO: Implement actual HTTP call
        # For now, return a stub rate
        return Decimal("1.00")  # Placeholder — implement with httpx/aiohttp


# ── Stripe Adapter ───────────────────────────────────────────

class StripeAdapter(PaymentAdapter):
    """
    Stripe payment adapter.

    Handles: EUR, SEK
    Methods: Card, SEPA Direct Debit, Klarna
    """

    def __init__(self, api_key: str = ""):
        self.api_key = api_key
        # TODO: Initialize stripe client when api_key is set

    @property
    def name(self) -> str:
        return "stripe"

    async def create_payment_intent(
        self, amount: Decimal, currency: str, description: str = ""
    ) -> dict[str, Any]:
        """
        Create a Stripe PaymentIntent.

        Returns dict with client_secret and payment_intent_id.
        TODO: Implement with stripe Python SDK.
        """
        # Stub — implement with stripe.PaymentIntent.create()
        return {
            "client_secret": "stub_secret",
            "payment_intent_id": str(uuid.uuid4()),
        }

    async def verify_payment(self, external_reference: str) -> tuple[bool, Decimal]:
        """
        Verify Stripe payment completion.

        TODO: Implement with stripe.PaymentIntent.retrieve()
        """
        return True, Decimal("0.00")  # Stub

    def supported_currencies(self) -> list[str]:
        return ["EUR", "SEK"]


# ── BTCPay Adapter (Stub) ────────────────────────────────────

class BTCPayAdapter(PaymentAdapter):
    """
    BTCPay Server adapter for Bitcoin payments.

    Self-hosted — no third party. Uses BTCPay Server API.
    """

    def __init__(self, server_url: str = "", api_key: str = ""):
        self.server_url = server_url
        self.api_key = api_key

    @property
    def name(self) -> str:
        return "btcpay"

    async def create_payment_intent(
        self, amount: Decimal, currency: str, description: str = ""
    ) -> dict[str, Any]:
        """Create a BTCPay invoice. TODO: Implement with httpx."""
        return {"invoice_id": str(uuid.uuid4()), "btc_address": "stub"}

    async def verify_payment(self, external_reference: str) -> tuple[bool, Decimal]:
        """Check BTCPay invoice status. TODO: Implement."""
        return False, Decimal("0.00")

    def supported_currencies(self) -> list[str]:
        return ["BTC"]


# ── Payment Gateway ──────────────────────────────────────────

class PaymentGateway:
    """
    Central payment gateway. Accepts any currency through pluggable adapters.

    Usage:
        gateway = PaymentGateway(exchange_rate_provider)
        gateway.register_adapter(StripeAdapter(api_key))
        gateway.register_adapter(BTCPayAdapter(server_url, api_key))

        intent = await gateway.initiate_payment(amount, "EUR", "stripe")
        confirmed, eur = await gateway.confirm_payment("stripe", external_ref)
    """

    def __init__(self, exchange_rate: ExchangeRateProvider | None = None):
        self.adapters: dict[str, PaymentAdapter] = {}
        self.exchange_rate = exchange_rate or CoinGeckoProvider()

    def register_adapter(self, adapter: PaymentAdapter) -> None:
        """Plug in a payment method."""
        self.adapters[adapter.name] = adapter

    def available_methods(self) -> list[str]:
        """What can clients pay with?"""
        return list(self.adapters.keys())

    def get_adapter(self, method: str) -> PaymentAdapter:
        """Get adapter by name. Raises if not found."""
        if method not in self.adapters:
            raise ValueError(
                f"Payment method '{method}' not available. "
                f"Available: {', '.join(self.available_methods())}"
            )
        return self.adapters[method]

    async def initiate_payment(
        self,
        amount: Decimal,
        currency: str,
        method: str,
        description: str = "",
    ) -> tuple[dict[str, Any], PaymentInbound]:
        """
        Start a payment flow.

        Returns (intent_data, payment_record).
        """
        adapter = self.get_adapter(method)

        if currency not in adapter.supported_currencies():
            raise ValueError(
                f"Currency '{currency}' not supported by adapter '{method}'. "
                f"Supported: {', '.join(adapter.supported_currencies())}"
            )

        # Get EUR equivalent
        eur_rate = await self.exchange_rate.get_rate(currency)
        eur_equivalent = (amount * eur_rate).quantize(Decimal("0.01"))

        # Create payment intent on external system
        intent = await adapter.create_payment_intent(amount, currency, description)

        # Create inbound payment record
        payment = PaymentInbound(
            amount=amount,
            currency=currency,
            eur_equivalent=eur_equivalent,
            payment_method=method,
            status=PaymentStatus.PENDING,
            external_reference=intent.get("payment_intent_id") or intent.get("invoice_id"),
        )

        return intent, payment

    async def confirm_payment(
        self,
        method: str,
        external_reference: str,
    ) -> tuple[bool, Decimal]:
        """
        Verify payment completion.

        Returns (is_confirmed, eur_equivalent).
        """
        adapter = self.get_adapter(method)
        return await adapter.verify_payment(external_reference)
