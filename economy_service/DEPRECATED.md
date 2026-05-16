# DEPRECATED — Python economy service

This FastAPI service and the `agorax_economy/` library it wraps are **retired**.
They are no longer built or run (removed from `docker-compose.yml`).

## Why

The economy was reimplemented natively in the Node/TypeScript app so AgoraX
runs as one codebase against one database, with no cross-service hop. The
replacement lives in:

- `server/economy/` — `config.ts`, `schedule.ts`, `points.ts`, `redemption.ts`
- `shared/schema.ts` — `point_transactions`, `point_balances`,
  `point_redemptions`, `treasury_ledger`
- `server/routers/economy.ts` — the API surface
- migration `migrations/0012_democracy_points.sql`

The Node implementation covers what AgoraX uses today: **participation →
Democracy Points** (accrual, the published schedule, idempotent awards) and
the **redemption path** (phase- and verification-gated).

## What was NOT carried over

The Python service also modelled a **client-funded deliberation revenue
stream** (a paying client funds a panel; Stripe / BTCPay adapters; the 70/30/0
treasury split). That is a separate product concern and was deliberately left
out of the Node port. These files are kept here as the reference design if
that revenue stream is built later — they are not wired into anything.
