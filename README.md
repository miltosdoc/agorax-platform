# AgoraX

[![CI](https://github.com/miltosdoc/agorax-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/miltosdoc/agorax-platform/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](tsconfig.json)
[![License](https://img.shields.io/badge/license-CC--BY--NC--4.0-yellow)](LICENSE)

**Structured deliberation, sortition, and verifiable voting for civic
decision-making.** Bilingual (Ελληνικά / English).

Instead of a comment section and a poll, a proposal moves through a defined
lifecycle: community amendments, a randomly selected citizen jury, and a
ratification vote whose count anyone can re-verify.

> ### Status: pilot
> AgoraX runs as a single self-hosted instance and is built for
> **consultative** deliberation — verifiable, but **not legally binding**
> under Greek electoral law.
>
> If you are considering hosting it, read **[docs/STATUS.md](docs/STATUS.md)**
> first: what is implemented, what the vote actually guarantees, what data you
> would be processing, and what the platform cannot do yet.

---

## What it does

- **Structured deliberation** — every proposal follows the same lifecycle;
  transitions are validated, not ad hoc.
- **Community amendments** — members propose changes; the community can
  override an author's rejection.
- **Sortition** — a randomly selected jury (Athenian-style) reviews and revises.
- **Verifiable voting** — a per-proposal SHA-256 hash chain; any later edit is
  detectable by re-running the count.
- **Anonymous mode** — blind-signed tokens (RFC 9474) make a ballot
  cryptographically unlinkable to the voter. Opt-in per proposal.
- **Identity** — one vote per real person, via a Gov.gr solemn declaration.
- **Deliberation rooms** — real-time audio/video (LiveKit), feed, notifications.

## The proposal lifecycle

Eight states, defined canonically in
[`shared/proposal-lifecycle.ts`](shared/proposal-lifecycle.ts):

```
draft ─▶ review ─▶ author_review ─▶ community_signal ─▶ sortition_synthesis ─▶ voting ─▶ decided
                                                                                   └────▶ archived
```

Progression is forward-only and each transition is validated at the API layer;
`archived` is reachable from any active state. Quality review at the `review`
step runs on a **self-hosted local LLM** — proposal text never leaves the
instance. See [docs/DELIBERATION.md](docs/DELIBERATION.md).

## Quick start

**Prerequisites:** Node.js 20+, PostgreSQL 14+ (Python 3.11+ for identity
verification).

```bash
git clone https://github.com/miltosdoc/agorax-platform.git
cd agorax-platform
npm install
createdb agorax
npm run db:push                   # create the schema
cp .env.example .env              # set DATABASE_URL and SESSION_SECRET
npm run dev                       # http://localhost:3001
```

`npm run db:seed` loads demo content.

Identity verification is a separate FastAPI service; the app runs without it,
only Gov.gr verification is then unavailable. Full runbook, Docker Compose, and
the three-process layout: **[docs/RUNNING.md](docs/RUNNING.md)**.

## Architecture

A React client, an Express API organised into domain repositories, and a Python
ballot service for Gov.gr PDF validation — all against one Postgres. The
anonymous vote path uses a separate database role that is denied access to
every identity table.

Details and the blind-signature flow: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentation

| | |
|---|---|
| **[Status & readiness](docs/STATUS.md)** | **Start here if you might host it** |
| [Running](docs/RUNNING.md) | Install, services, Docker, local runbook |
| [Architecture](docs/ARCHITECTURE.md) | Domain design, data flow |
| [Deliberation](docs/DELIBERATION.md) | Lifecycle, amendments, sortition |
| [API reference](docs/API.md) | Endpoints |
| [Security posture](docs/SECURITY_AUDIT.md) | What is implemented, and the gaps |
| [Verifiable voting](docs/VERIFIABLE_VOTING_SDK_PLAN.md) | Backends, threat model |
| [`docs/compliance/`](docs/compliance/) | DPIA, ROPA, vote-linkage and anonymity audits |

Conference rooms, push notifications, the Android wrapper, polling and the media
pipeline each have their own guide in [`docs/`](docs/).

## Contributing

See the [Contributing Guide](CONTRIBUTING.md). Before opening a pull request:

```bash
npx tsc --noEmit && npm test && npm run check:i18n && node scripts/check-modularity.cjs
```

Security issues: please report privately — see [SECURITY.md](SECURITY.md).

## License

[CC-BY-NC-4.0](LICENSE) — reuse with attribution; no commercial relicensing
without permission.

---

*Built in Sweden, inspired by Athens — digital democracy with engineering rigor.*
