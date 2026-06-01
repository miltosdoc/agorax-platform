# AgoraX

[![CI](https://github.com/miltosdoc/agoraxdemocracy/actions/workflows/ci.yml/badge.svg)](https://github.com/miltosdoc/agoraxdemocracy/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](tsconfig.json)
[![License](https://img.shields.io/badge/license-CC--BY--NC--4.0-yellow)](LICENSE)

**A deliberative-democracy platform — structured deliberation, sortition, and
verifiable voting for civic decision-making.**

AgoraX implements the *Demopolis* framework: instead of a comment section and a
poll, a proposal moves through a defined eight-state lifecycle — community
amendments, a randomly selected citizen jury, and a ratification vote whose
count anyone can re-verify. It is built for Greek civic communities, bilingual
(Ελληνικά / English) throughout.

> **Status: pilot.** AgoraX runs as a single self-hosted instance and is
> intended for **consultative** deliberation — verifiable but not yet
> binding under Greek electoral law. See [§ Status & readiness](#status--readiness)
> below for what is shipping, what is gated off in production, and what
> a host community needs to know before adopting it.

---

## What AgoraX does

- **Structured deliberation** — every proposal follows the same eight-state
  lifecycle; transitions are validated, not ad hoc.
- **Community amendments** — members propose improvements and counter-proposals;
  the author reviews them, and the community can override an author's rejection.
- **Sortition** — a randomly selected citizen jury (Athenian-style) reviews and
  revises the proposal. Selection uses a CSPRNG with rejection sampling, so it
  is statistically unbiased and auditable.
- **Verifiable ratification voting** — the yes/no/abstain vote runs through a
  pluggable `VotingBackend`; every ballot lands in a tamper-evident record
  anyone can re-check. Two modes are available: *pseudonymous* (cleartext
  votes linked to verified identity) and *anonymous* (blind-signed tokens
  via RFC 9474, zero linkage between voter identity and vote choice).
  See [§ Verifiable voting](#verifiable-voting) for the trust model.
- **Communities, managed or autonomous** — every community is either
  *managed* (admins/founders can edit settings directly) or *autonomous*
  (every governable setting is a liquid majority vote; the value tracks
  the plurality choice and ties keep the current value). Apply-to-join is
  per-community: open, approval-gated, or invite-only.
- **Gov.gr identity verification** — citizens verify with a digitally signed
  Responsible Declaration, giving one account per real person.
- **Democracy Points** — civic participation is recorded as contribution
  credit (*ο μισθός εκκλησιαστικός*), honestly phase-gated and never a token.

---

## The proposal lifecycle

Eight states, defined canonically in [`shared/proposal-lifecycle.ts`](shared/proposal-lifecycle.ts):

```
draft ─▶ review ─▶ author_review ─▶ community_signal ─▶ sortition_synthesis ─▶ voting ─▶ decided
                                                                                   └────▶ archived
```

- **draft** — the author drafts the proposal.
- **review** — quality validation. A local-only stub today (every proposal
  routes to the sortition body for human review); an external LLM gate was
  removed by a GDPR audit decision and will only return as a local model.
- **author_review** — the author accepts or rejects community amendments.
- **community_signal** — the community votes on the author's rejections.
- **sortition_synthesis** — a sortition jury scores the proposal and revises it.
- **voting** — the ratification vote (consultative in the current pilot).
- **decided / archived** — terminal: a decision was reached, or it was closed
  without one.

Progression is forward-only and each transition is validated at the API layer.
`archived` is reachable from any active state.

---

## Architecture

```
┌──────────────┐   ┌───────────────────┐   ┌──────────────────────┐
│  Web client  │   │  Application API  │   │  Ballot service      │
│  React + TS  │◀─▶│  Express + TS     │◀─▶│  FastAPI (Python)    │
└──────┬───────┘   └─────────┬─────────┘   │  Gov.gr PDF validation│
       │                     │             └──────────────────────┘
       │  Anonymous voting:  │
       │  1. Browser generates token
       │  2. Browser blinds token
       │  3. Server signs blindly
       │  4. Browser unblinds token
       │  5. Browser casts vote with token
       │     (server cannot link token to identity)
       │
                   ┌─────────▼─────────┐
                   │ Domain repositories│  users · communities · proposals
                   │ + server/economy  │  amendments · sortition · voting
                   │ + server/voting   │  debate · platform · economy
                   └─────────┬─────────┘
                             │
                   ┌─────────▼─────────┐   ┌──────────────────────┐
                   │ PostgreSQL        │   │ @agorax/voting        │
                   │ + Drizzle ORM     │   │ ElectionGuard 2.1 SDK │
                   │  (agorax_vote     │   │ (packages/voting-sdk) │
                   │   role for anon   │   │  [DEV-ONLY, blocked]  │
                   │   vote path)      │   └──────────────────────┘
                   └───────────────────┘
```

The server is organised by domain — one router and one repository per domain,
with an enforced module boundary (`scripts/check-modularity.cjs`). The
deliberation layer is independent of the voting backend: swapping how votes are
secured never touches proposals, sortition, amendments, or debate.

---

## Verifiable voting

The ratification vote is routed through a `VotingBackend` interface
(`server/voting/`), selected by the `VOTING_BACKEND` environment variable.
**The current pilot deployment runs `hash-chain` (default) and supports an
anonymous voting mode.** ElectionGuard ships in the codebase but is
hard-blocked in production — see below.

### Voting backends

- **`hash-chain` *(default, shipping)*** — Tamper-evident per-proposal SHA-256
  chain. Votes are pseudonymous cleartext (linked to verified identity). Any
  post-hoc edit is detected by `/api/proposals/:id/election/verify`.

- **`anonymous` *(shipping)*** — Blind-signed tokens via
  `@cloudflare/blindrsa-ts` (RFC 9474, RSABSSA.SHA384.PSS.Randomized). The
  browser generates a token, blinds it, the server signs blindly, the browser
  unblinds, then casts the vote. **Zero linkage** between voter identity and
  vote choice — the server never sees the unblinded token before the vote is
  cast. A 30-minute minimum time decoupling between token issuance and vote
  casting prevents real-time correlation. Anonymous votes use minute-precision
  timestamps. Vote endpoints (blind-sign, anonymous-vote, verify-receipt,
  blind-key) are excluded from application logging. A dedicated database role
  (`agorax_vote`) handles the anonymous vote path with revoked access to
  identity tables.

- **`electionguard` *(development-only, blocked in production)*** — ElGamal-encrypted
  ballots, zero-knowledge ballot-validity proofs, homomorphic tally,
  threshold-trustee decryption, public verifier. **Blocked because:** guardian
  secrets are stored server-side, the ballot row still binds `user_id`, and
  encryption happens server-side (not client-side). Self-labeled
  *"DEVELOPMENT-ONLY, NOT FOR BINDING ELECTIONS"*. Re-enable gates are
  documented in `docs/01_VOTE_LINKAGE_AUDIT.md` (SDK Phase 6+7, ballot-schema
  refactor, independent crypto review).

- **`mobile-signed` *(planned)*** — Voter-side signing in a device secure
  element — the server never holds the key.

The `electionguard` backend is powered by **`@agorax/voting`**, an in-house
TypeScript implementation of the [ElectionGuard 2.1](https://www.electionguard.vote/)
protocol built on audited primitives (`@noble/curves`, `@noble/hashes`) — see
[`packages/voting-sdk`](packages/voting-sdk) and the build plan in
[`docs/VERIFIABLE_VOTING_SDK_PLAN.md`](docs/VERIFIABLE_VOTING_SDK_PLAN.md).

The trust model — *what can the host do?* — is set entirely by the chosen
backend, while the deliberation experience stays identical. Public endpoints
(`/api/proposals/:id/vote`, `/election/proof`, `/election/verify`) are the same
for every backend.

---

## Identity verification

Citizens verify their identity by uploading a **Gov.gr Responsible Declaration**
(Υπεύθυνη Δήλωση). The Python ballot service validates the document's PAdES
digital signature offline — it never contacts Gov.gr — and extracts a minimal
verified-identity set (name, date of birth, place of birth, residence). The Tax
ID (ΑΦΜ) is stored only as a salted hash, which guarantees **one account per
real person**. ID-card number, parents' names, phone and street address are
deliberately not stored.

This verification is a **one-time registration step**, not a per-vote check.
In anonymous voting mode, the verified identity is used only to confirm the
voter is eligible; the actual vote is cast with a blind-signed token that is
cryptographically unlinkable to the voter's identity.

## Democracy Points

Civic participation — a validated proposal, a sortition-jury term, a
ratification vote — earns **Democracy Points**, an append-only record of
contribution. Points are not a token or cryptocurrency and carry no monetary
value until the platform reaches a revenue phase; redemption is gated on that
phase and on identity verification. The earning schedule is fixed and public.

---

## Getting started

**Prerequisites:** Node.js 20+, Python 3.11+, PostgreSQL 14+.

```bash
git clone https://github.com/miltosdoc/agoraxdemocracy.git
cd agoraxdemocracy
npm install                       # Node app + the @agorax/voting workspace
createdb agorax
npm run db:push                   # create the schema
cp .env.example .env              # then set DATABASE_URL and SESSION_SECRET
```

AgoraX runs as **three processes**:

| Service | Command | Port |
|---|---|---|
| PostgreSQL | your system service | 5432 |
| AgoraX app (Node) | `npm run dev` | 3001 |
| Ballot service (Python) | see below | 8000 |

```bash
# Ballot service — Gov.gr PDF validation (a separate FastAPI app):
cd ballot_service
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
DATABASE_URL="postgresql://USER@localhost:5432/agorax" SALT_KEY="<stable secret>" \
  .venv/bin/uvicorn main:app --port 8000
```

The app runs without the ballot service — only Gov.gr identity verification is
then unavailable. `npm run db:seed` loads demo content. The full runbook,
including Docker (`docker compose up`), is in [docs/RUNNING.md](docs/RUNNING.md).

---

## Project structure

```
client/            React + TypeScript web client (bilingual el/en)
server/            Express API — domain routers, repositories, economy, voting
shared/            Drizzle schema + types shared by client and server
packages/
  voting-sdk/      @agorax/voting — ElectionGuard 2.1 protocol implementation
ballot_service/    FastAPI service — Gov.gr declaration validation
migrations/        Ordered SQL migrations (0000 … 0024)
docs/              Architecture, API, runbook, and design documents
```

## Quality

- TypeScript strict mode across client, server, and the SDK.
- Enforced module boundaries (`scripts/check-modularity.cjs`).
- Unit and integration tests (Vitest) plus an end-to-end suite (Playwright).
- Bilingual translation-key parity checked in CI (`npm run check:i18n`).
- CI runs lint, typecheck, tests, the modularity check, and the build.

## Documentation

- [Running AgoraX](docs/RUNNING.md) — install, services, local runbook
- [API Reference](docs/API.md) — endpoint documentation
- [Architecture Guide](docs/ARCHITECTURE.md) — domain-driven design
- [Verifiable Voting SDK Plan](docs/VERIFIABLE_VOTING_SDK_PLAN.md) — the
  ElectionGuard build plan, threat model, and privacy checklist
- [Migration Strategy](docs/MIGRATION_STRATEGY.md) · [Security Audit](docs/SECURITY_AUDIT.md) · [Tests](docs/TESTS.md)

## Contributing

Contributions are welcome — please read the [Contributing Guide](CONTRIBUTING.md)
and [Code of Conduct](CODE_OF_CONDUCT.md). Before opening a pull request, run
`npx tsc --noEmit`, `npm test`, `npm run check:i18n`, and
`node scripts/check-modularity.cjs`.

## License

See [LICENSE](LICENSE) — CC-BY-NC-4.0. Reuse with attribution; no commercial
relicensing without permission.

---

## Status & readiness

This is the section a host community, a pilot partner, or a Greek political
party reading this repo should look at first.

**Technology readiness.** AgoraX is a **pilot** today, not a turnkey
production platform. The deliberation layer (proposals, amendments,
sortition, community settings, identity verification) is feature-complete
and exercised end-to-end. The voting layer is feature-complete on the
hash-chain backend and the anonymous voting mode.

**GDPR compliance.** The following rights and safeguards are implemented:

- **Art. 15 data export** — `GET /api/user/data-export` returns all personal
  data in a structured JSON bundle.
- **Art. 17 erasure request** — `POST /api/user/erasure-request` initiates
  account deletion. Vote rows undergo *crypto-shred* (user_id nulled, chain
  integrity preserved). Democracy Points balance is deleted and transactions
  anonymized (migration 0019).
- **Consent gate** — `requires_consent` middleware blocks Art. 9 actions
  (voting, proposal creation) until the member accepts the privacy text.
- **Deferred erasure** — votes on active proposals are deferred until the
  proposal closes, preserving tally integrity.
- **Rate limits** — consent (10/15 min), data export (5/hour), erasure
  (3/day) to prevent abuse.

**Production hardening.**

- **CORS allowlist** — controlled via `CORS_ALLOWED_ORIGINS` env var.
- **CSRF protection** — double-submit cookie tokens on all state-changing
  endpoints.
- **Sentry error monitoring** — optional, gated on `SENTRY_DSN`; PII is
  redacted before transmission.
- **DB TLS check** — boot-time validation requires `sslmode=require` (or
  `verify-ca` / `verify-full`) in production.
- **Admin audit log** — migration 0018 tracks privileged admin actions.

**Service separation.** The anonymous vote path uses a dedicated database
role (`agorax_vote`) with `REVOKE` on all identity tables and `GRANT` only
on vote tables. Verified: the `agorax_vote` role receives permission denied
when attempting to read identity tables.

**What current votes give you.**

- *Tamper-evidence:* the hash-chain backend writes a per-proposal SHA-256
  chain. Any post-hoc edit is detected by `/api/proposals/:id/election/verify`.
- *One vote per real person:* the salted-AFM hash from a Gov.gr Solemn
  Declaration (Υπεύθυνη Δήλωση) enforces this.
- *Anonymous mode:* blind-signed tokens (RFC 9474) provide zero linkage
  between voter identity and vote choice. Opt-in per proposal.
- *Consultative outcome:* the result is a reliable expression of the
  participating community's will, **not** a legally binding electoral count
  under Greek law.

**Data flow you are accepting.** Identity verification stores the
verified-identity set (first/last name, DOB, municipality, postcode) and a
salted AFM hash; ID-card number, parents' names, phone and street address
are deliberately not collected. In pseudonymous mode, ballot choices are
linkable to the verified identity — GDPR Art. 9 special-category processing
requiring explicit consent at onboarding. In anonymous mode, the vote is
cryptographically unlinkable to identity. Proposal text is treated as Art. 9
data and **does not leave the instance**: the previous external LLM
quality-gate was removed by a documented audit decision.

**What a partner community has to provide.**

- A small Linux host (1 vCPU, 2 GB RAM is enough for ≤1000 members), a
  Postgres they own, TLS, backups, and someone to be on call.
- An onboarding flow that captures explicit GDPR Art. 9 consent.
- A clear public statement to the community that the current pilot is
  consultative, not binding.

**What it cannot do yet.** Real-time network-traffic correlation defense,
voter-device compromise, coercion or vote-selling defense, multi-host
federation, or serving as the system-of-record for a legally binding
election under Greek law.

See `docs/compliance/` for the full audit set (vote linkage, data
minimization, identity & vote anonymity, anonymous voting design) and
`server/voting/index.ts` for the production gates that enforce the
trust-model boundary at runtime.

---

*Built in Sweden, inspired by Athens — digital democracy with engineering rigor.*
