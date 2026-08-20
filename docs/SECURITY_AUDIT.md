# Security Posture

Verified against the codebase, not aspirational. Every implemented control below
cites the file that implements it, so a reviewer can check the claim rather than
trust it. Gaps are listed as gaps.

For reporting a vulnerability, see [SECURITY.md](../SECURITY.md).

Last verified: 2026-08-20.

## Authentication & sessions

| Control | Status | Where |
|---|---|---|
| Password hashing | **scrypt**, 64-byte derived key, per-user random salt | `server/auth.ts` |
| Password comparison | `timingSafeEqual` — constant-time, no early exit | `server/auth.ts` |
| Session cookie flags | `httpOnly`, `sameSite: lax`, `secure` in production | `server/auth.ts` |
| Login rate limiting | `express-rate-limit`, 10 attempts / 15 min per client | `server/auth.ts` |
| Password minimum length | 8 characters, enforced by Zod at the schema | `shared/schema.ts` |
| Boot-time secret strength | `SESSION_SECRET` and `SIGNING_MASTER_KEY` required; rejected if short or a known default | `server/config.ts` |

> Note: scrypt is used rather than bcrypt. Both are acceptable memory-hard
> choices; the parameters live in `server/auth.ts` and are the thing to review,
> not the algorithm name.

## Input handling & data access

| Control | Status | Where |
|---|---|---|
| SQL injection | Drizzle ORM — parameterised queries throughout, no string-built SQL | `server/`, `shared/schema.ts` |
| Request validation | Zod schemas shared between client and server | `shared/schema.ts`, `server/routers/` |
| CSRF protection | Token checked on state-changing requests | `server/utils/csrf.ts`, wired in `server/index.ts` |
| Admin action audit trail | Admin actions recorded with actor and timestamp | `server/utils/admin-audit.ts` |

## Voting & anonymity

The anonymous-voting design, its threat model, and its explicit limits are
documented separately and in more depth:

- [`docs/compliance/04_ANONYMOUS_VOTING_DESIGN.md`](compliance/04_ANONYMOUS_VOTING_DESIGN.md)
- [`docs/compliance/01_VOTE_LINKAGE_AUDIT.md`](compliance/01_VOTE_LINKAGE_AUDIT.md)
- [`docs/compliance/CRYPTO_AUDIT.md`](compliance/CRYPTO_AUDIT.md)

Per-proposal blind-signature keys are AES-GCM encrypted at rest, with the
encryption key derived via HKDF from a `SIGNING_MASTER_KEY` environment variable
that the operator holds. **The design does not defend against a malicious
operator**: whoever holds the master key can undermine ballot anonymity. That
limitation is stated deliberately rather than papered over — see the design
document for what it does and does not guarantee.

## Deployment

`server/config.ts` refuses to boot on unsafe production configuration. **These
checks are armed only when `APP_ENV=production` is set** — setting `NODE_ENV`
alone does not arm them. When armed, the process fails fast on:

- a weak, short, or default `SESSION_SECRET` / `SIGNING_MASTER_KEY`
- a `DATABASE_URL` that does not enforce TLS (override: `ALLOW_INSECURE_DB=1`)
- `DEMO_MODE=true` — the demo auth bypass cannot run in production
- `OPENROUTER_API_KEY` present, or `LLM_API_KEY` without `LLM_GATE_AUDITED=true`

Operators: set `APP_ENV=production`. See
[`docs/compliance/DEPLOYMENT_HARDENING.md`](compliance/DEPLOYMENT_HARDENING.md).

## Known gaps

Listed because an accurate short list is worth more than a long list of ticks.

- **No CSP / security headers.** `helmet` is not installed and no
  Content-Security-Policy is set. This is the most significant open item.
- **No account lockout.** Rate limiting slows credential stuffing but repeated
  attempts against one account are not locked out.
- **Password policy is length-only** (8 characters, no complexity or
  breach-list check).
- **HSTS and TLS termination are left to the reverse proxy** and are not
  asserted by the application.
- **Dependency and container scanning are not wired into CI.**

## Scope

This describes the application. It says nothing about the security of any
particular deployment — host hardening, backups, network policy, and key
custody are the operator's responsibility.
