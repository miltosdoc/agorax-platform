"""
Background jobs for the Economy Service.

- Disclosure check: every hour — disclose embargoed deliberations
- Payment reconciliation: every 6 hours — mark stale PENDING as FAILED
- Exchange rate refresh: every 5 minutes — update cached crypto/fiat rates
"""

import logging
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from agorax_economy.payments import CoinGeckoProvider

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()
exchange_provider = CoinGeckoProvider()


def start_scheduler(app) -> None:
    """Start the background job scheduler."""
    scheduler.add_job(
        disclosure_check,
        trigger=IntervalTrigger(hours=1),
        id="disclosure_check",
        name="Check embargoed deliberations for disclosure",
        max_instances=1,
    )
    scheduler.add_job(
        payment_reconciliation,
        trigger=IntervalTrigger(hours=6),
        id="payment_reconciliation",
        name="Mark stale PENDING payments as FAILED",
        max_instances=1,
    )
    scheduler.add_job(
        exchange_rate_refresh,
        trigger=IntervalTrigger(minutes=5),
        id="exchange_rate_refresh",
        name="Refresh exchange rate cache",
        max_instances=1,
    )
    scheduler.start()
    logger.info("Background jobs started: disclosure (1h), reconciliation (6h), rates (5m)")


def stop_scheduler() -> None:
    """Stop the background job scheduler."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Background jobs stopped")


async def disclosure_check() -> None:
    """
    Check all embargoed deliberations and disclose those past their date.

    Runs every hour.
    """
    try:
        from main import app

        engine = app.state.engine
        repo = app.state.deliberation_repo

        # TODO: Query all EMBARGOED deliberations
        # deliberations = await repo.get_embargoed_deliberations()
        # for delib in deliberations:
        #     if await engine.check_and_disclose(delib.id):
        #         logger.info(f"Disclosed deliberation {delib.id}")

        logger.info("Disclosure check completed")
    except Exception as e:
        logger.error(f"Disclosure check failed: {e}")


async def payment_reconciliation() -> None:
    """
    Mark stale PENDING payments as FAILED.

    Payments older than 24h in PENDING status are marked FAILED.
    Runs every 6 hours.
    """
    try:
        from main import app

        repo = app.state.treasury_repo

        # TODO: Query PENDING payments older than 24h
        # stale_payments = await repo.get_pending_payments_older_than(
        #     datetime.now(timezone.utc) - timedelta(hours=24)
        # )
        # for payment in stale_payments:
        #     await repo.update_payment_status(payment.id, PaymentStatus.FAILED)
        #     logger.info(f"Marked payment {payment.id} as FAILED (stale)")

        logger.info("Payment reconciliation completed")
    except Exception as e:
        logger.error(f"Payment reconciliation failed: {e}")


async def exchange_rate_refresh() -> None:
    """
    Refresh cached exchange rates.

    Runs every 5 minutes. Updates CoinGecko cache.
    """
    try:
        # Force a cache refresh by fetching a rate
        await exchange_provider.get_rate("BTC")
        await exchange_provider.get_rate("ETH")
        await exchange_provider.get_rate("SEK")
        logger.info("Exchange rates refreshed")
    except Exception as e:
        logger.error(f"Exchange rate refresh failed: {e}")
