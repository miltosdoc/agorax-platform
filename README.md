# AgoraX

[![CI](https://github.com/miltosdoc/agoraxdemocracy/actions/workflows/ci.yml/badge.svg)](https://github.com/miltosdoc/agoraxdemocracy/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](tsconfig.json)
[![License](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

**A deliberative-democracy platform — structured deliberation, sortition, and
verifiable voting for civic decision-making.**

AgoraX implements the *Demopolis* framework: instead of a comment section and a
poll, a proposal moves through a defined eight-state lifecycle — AI quality
validation, community amendments, a randomly selected citizen jury, and a
binding ratification vote whose count anyone can re-verify. It is built for
Greek civic communities, bilingual (Ελληνικά / English) throughout.

---

## What AgoraX does

- **Structured deliberation** — every proposal follows the same eight-state
  lifecycle; transitions are validated, not ad hoc.
- **AI quality gate** — proposals are scored by an LLM before they reach the
  community, filtering noise without human moderators.
- **Community amendments** — members propose improvements and counter-proposals;
  the author reviews them, and the community can override an author's rejection.
- **Sortition** — a randomly selected citizen jury (Athenian-style) reviews and
  revises the proposal. Selection uses a CSPRNG with rejection sampling, so it
  is statistically unbiased and auditable.
- **Verifiable ratification voting** — the binding yes/no/abstain vote runs
  through a pluggable `VotingBackend`; every ballot lands in a tamper-evident
  record anyone can re-check.
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
- **review** — automated LLM quality validation.
- **author_review** — the author accepts or rejects community amendments.
- **community_signal** — the community votes on the author's rejections.
- **sortition_synthesis** — a sortition jury scores the proposal and revises it.
- **voting** — the binding ratification vote.
- **decided / archived** — terminal: a decision was reached, or it was closed
  without one.

Progression is forward-only and each transition is validated at the API layer.
A high LLM score can fast-path `review → voting`; `archived` is reachable from
any active state.

---

## Architecture

```
┌──────────────┐   ┌───────────────────┐   ┌──────────────────────┐
│  Web client  │   │  Application API  │   │  Ballot service      │
│  React + TS  │◀─▶│  Express + TS     │◀─▶│  FastAPI (Python)    │
└──────────────┘   └─────────┬─────────┘   │  Gov.gr PDF validation│
                             │             └──────────────────────┘
                   ┌─────────▼─────────┐
                   │ Domain repositories│  users · communities · proposals
                   │ + server/economy  │  amendments · sortition · voting
                   │ + server/voting   │  debate · platform · economy
                   └─────────┬─────────┘
                             │
                   ┌─────────▼─────────┐   ┌──────────────────────┐
                   │ PostgreSQL        │   │ @agorax/voting        │
                   │ + Drizzle ORM     │   │ ElectionGuard 2.1 SDK │
                   └───────────────────┘   │ (packages/voting-sdk) │
                                           └──────────────────────┘
```

The server is organised by domain — one router and one repository per domain,
with an enforced module boundary (`scripts/check-modularity.cjs`). The
deliberation layer is independent of the voting backend: swapping how votes are
secured never touches proposals, sortition, amendments, or debate.

---

## Verifiable voting

The binding ratification vote is routed through a `VotingBackend` interface
(`server/voting/`), selected by the `VOTING_BACKEND` environment variable:

| Backend | Status | Guarantees |
|---|---|---|
| `hash-chain` *(default)* | Shipping | Tamper-evident inclusion — a per-proposal SHA-256 chain; any post-hoc edit is detected by `/api/proposals/:id/election/verify`. Votes are cleartext. |
| `electionguard` | Development | ElGamal-encrypted ballots, zero-knowledge ballot-validity proofs, homomorphic tally, threshold-trustee decryption, public verifier. Verifiable integrity today; client-side encryption (full vote privacy) is a later phase — not for binding elections yet. |
| `mobile-signed` | Planned | Voter-side signing in a device secure element — the server never holds the key. |

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
migrations/        Ordered SQL migrations (0000 … 0013)
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

See [LICENSE](LICENSE). *(Note: the `LICENSE` file is MIT while `package.json`
declares `CC-BY-NC-4.0` — these should be reconciled.)*

---

*Built in Sweden, inspired by Athens — digital democracy with engineering rigor.*
