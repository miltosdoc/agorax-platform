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
| Breached-password rejection | Passwords found in known breach corpora are refused at registration and reset (HIBP range API, k-anonymity — the password never leaves the server; fails open) | `server/utils/password-breach.ts` |
| Per-account login throttling | Failed logins counted per username, not just per IP; a success clears the counter | `server/utils/login-throttle.ts` |
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

## Response headers

`helmet` sets HSTS (production only), `X-Content-Type-Options`,
`X-Frame-Options`, and `Referrer-Policy: strict-origin-when-cross-origin`.
See `server/utils/security-headers.ts`.

A Content-Security-Policy is defined and ships **Report-Only** by default:
`script-src 'self'` with no `unsafe-inline` or `unsafe-eval` — the app carries
no inline scripts and loads nothing from a CDN. `style-src` does allow
`'unsafe-inline'`, which React inline style props make unavoidable.

Operators: watch the violation reports on a real deployment (conference rooms
especially — `connect-src` must cover the LiveKit socket, which is derived from
`LIVEKIT_URL`), then set `CSP_ENFORCE=true`. Shipping it enforcing by default
would risk silently breaking a live deliberation.

## Known gaps

Listed because an accurate short list is worth more than a long list of ticks.

- **CSP is not enforced by default.** It ships Report-Only; each deployment
  has to confirm its reports and flip `CSP_ENFORCE=true`.
- **No hard account lockout**, by choice — lockout is a denial-of-service
  primitive against voters. Per-account throttling is used instead, which
  slows guessing without letting an attacker freeze a member out permanently.
- **Login throttle state is per-process and in memory.** A restart clears it,
  and a multi-process deployment throttles per process.
- **HSTS and TLS termination are left to the reverse proxy** and are not
  asserted by the application.
- **Dependency and container scanning are not wired into CI.**

## Scope

This describes the application. It says nothing about the security of any
particular deployment — host hardening, backups, network policy, and key
custody are the operator's responsibility.
