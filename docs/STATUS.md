<!-- Moved out of README.md to keep the front page short. This is the
     detail a host community, pilot partner, or auditor needs. -->

# Status & readiness

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
