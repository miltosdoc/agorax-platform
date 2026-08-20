# AgoraX Economy Module

The economic engine for democratic deliberation.

## Philosophy

- **70% to citizens, 30% to operations, 0% profit** — constitutional, enforced at initialization
- **Democracy Points** (μισθός εκκλησιαστικός) — digital compensation for civic participation
- **Verifiable sortition** — anyone can audit panel selection fairness
- **Transparent ledger** — public treasury report, append-only audit trail
- **No proprietary coin** — accepts EUR, SEK, BTC, ETH, USDC; no tokenomics, no whitepaper

## Module Structure

```
agorax_economy/
├── __init__.py          # Public API exports
├── config.py            # Economic parameters (constitutional enforcement)
├── models.py            # Data classes (ORM-agnostic)
├── engine.py            # Main orchestrator (single entry point)
├── sortition.py         # Verifiable random selection
├── points.py            # Democracy Points lifecycle
├── treasury.py          # Revenue split & transparent ledger
├── payments.py          # Payment gateway + adapters
└── README.md            # This file
```

Dependencies flow inward: `engine.py` depends on everything else; nothing depends on `engine.py` except the API layer.

## Quick Start

```python
from agorax_economy import (
    DEFAULT_CONFIG,
    EconomyEngine,
    PointsManager,
    PointsRepository,
    TreasuryManager,
    TreasuryRepository,
    PaymentGateway,
    StripeAdapter,
)

# Initialize components
config = DEFAULT_CONFIG
points_repo = MyPointsRepository()  # Implement for your ORM
treasury_repo = MyTreasuryRepository()  # Implement for your ORM

points = PointsManager(config, points_repo)
treasury = TreasuryManager(config, treasury_repo)
payments = PaymentGateway()
payments.register_adapter(StripeAdapter(api_key="sk_test_..."))

# Create engine
engine = EconomyEngine(config, treasury, points, payments, deliberation_repo)

# Fund and launch a deliberation
result = await engine.fund_and_launch_deliberation(payment, deliberation, citizen_pool)
print(f"Panel: {result.panel_size} citizens selected")
print(f"Revenue split: {result.revenue_split.citizen}€ to citizens, "
      f"{result.revenue_split.operations}€ to operations")
```

## Repository Interfaces

The module defines Protocol interfaces. Implement them for your ORM:

- **PointsRepository** — balance CRUD, transactions, redemptions
- **TreasuryRepository** — ledger entries, payment status, balances
- **DeliberationRepository** — deliberations, participants, citizen lookup

See each module's docstring for the exact interface.

## Points Calculation

```
base_points = lookup by deliberation_type:
    MICRO    → 500   (~€5)
    STANDARD → 2000  (~€20)
    EXPERT   → 5000  (~€50)
    POLL     → 250   (~€2.50)
    COMMUNITY_POLICY → 2000 (~€20)

multiplier = 1.0
if citizen.is_early_adopter:
    multiplier *= 1.5

if deliberation.funded_amount > €200:
    funding_ratio = funded_amount / 200, capped at 3.0
    multiplier *= funding_ratio

final_points = base_points × multiplier
```

## Phase Transitions

- **PRE_REVENUE → EARLY_REVENUE**: First confirmed payment. Points become redeemable.
- **EARLY_REVENUE → SCALED**: Manual/community decision. Civic dividends begin.
- One-way only. Cannot go backwards.

## Testing

```bash
# Run tests
python -m pytest tests/ -v

# Property-based tests (recommended)
python -m pytest tests/ -v --hypothesis
```

## Dependencies

Core module: **stdlib only** (hashlib, hmac, secrets, decimal, uuid, datetime, dataclasses, enum, typing).

Adapters:
- `stripe` — Stripe payment adapter
- `httpx` or `aiohttp` — BTCPay Server API
- `web3` — Ethereum/ERC-20 adapter (Phase 2)

## Out of Scope

- Citizen verification / identity (separate module)
- Deliberation content / UI (handled by main platform)
- Notifications (call your notification service)
- Client onboarding / invoicing (business ops)
- Analytics dashboards (build on top of ledger data)
- Mobile app / frontend (backend only)

---

Ο μισθός εκκλησιαστικός σε κώδικα.
