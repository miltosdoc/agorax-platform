# Compliance Status — Identity & Vote Anonymity

**Date:** 2026-05-31
**Reference:** `docs/compliance/AUDIT_IDENTITY_VOTE_ANONYMITY.md`
**Scope:** Closed bench-test deployment (100–1,000 invited members)

---

## Gap Remediation Summary

| Gap | Description | Status | Fix |
|-----|-------------|--------|-----|
| G1 | Default backend stores cleartext user_id + choice | ✅ CLOSED | Schema default `votingMode='anonymous'`. Pseudonymous route has guard (409 error). |
| G2 | Token issuance and casting in same session | ✅ CLOSED | 30-minute time decoupling via embedded `minCastTime` (40-byte token). |
| G3 | Ballot votes use deterministic AFM hash | ⚠️ DEPRECATED | Deprecation warning added. Retained for consultative use only. |
| G4 | Legacy polls store user_id + option_id | ⚠️ DEPRECATED | Deprecation warning added. Retained for consultative use only. |
| G5 | Session cookie leaks on anonymous-vote | ✅ CLOSED | `credentials: 'omit'` on anonymous-vote fetch. |
| G6 | IP logging on account_activity | ✅ CLOSED | Only logs login/registration, not voting. Verified in code. |
| G7 | Application logs capture vote endpoints | ✅ CLOSED | Vote endpoints excluded from logging middleware. |
| G8 | Single service, single datastore | ⚠️ KNOWN LIMITATION | Acceptable for bench test. Two-service split for scale-up. |
| G10 | Nginx access log exclusion | ⚠️ DEPLOYMENT TASK | Documented in `DEPLOYMENT_HARDENING.md`. Operator responsibility. |
| G11 | Hand-rolled blind signature | ⚠️ KNOWN LIMITATION | Documented in `THREAT_MODEL_IDENTITY_VOTE.md`. Independent review for scale-up. |
| G12 | Timestamp precision on vote rows | ✅ CLOSED | Anonymous votes use minute-precision timestamps. |

---

## Acceptance Test — Current State

**Question:** "If I hand you the complete database dump and the entire codebase, can you reconstruct what AFM/member X voted?"

**Answer for anonymous mode (after all fixes):**

- **Database-only:** NO — `proposal_votes` stores `vote_token` (40 bytes: 256-bit random + 8 bytes expiry) with `user_id = NULL`.
- **Database + application logs:** NO — vote endpoints excluded from logging.
- **Database + logs + session cookies:** NO — `credentials: 'omit'` on anonymous-vote fetch.
- **Database + logs + timing:** NO — 30-minute time decoupling enforced. Timestamps coarsened to minute precision.
- **Database + logs + device fingerprint:** NO — device fingerprint not captured on anonymous-vote path.
- **Database + logs + IP:** NO — no IP logging on vote endpoints. `account_activity` only logs login/registration.
- **Reverse proxy logs:** DEPENDS — must be configured per `DEPLOYMENT_HARDENING.md`.

**The system is constructively incapable of answering the question** — provided the reverse proxy is configured correctly.

---

## Non-Negotiable Invariants — Verified

| Invariant | Status | Verification |
|-----------|--------|--------------|
| I1. AFM never persisted | ✅ | Ballot service extracts AFM transiently, computes hash, discards AFM. |
| I2. No identifier↔vote linkage | ✅ | Anonymous votes store `vote_token` with `user_id = NULL`. |
| I3. Token not deterministic function of AFM | ✅ | 256-bit CSPRNG token, independent of AFM. |
| I4. Fresh token per vote | ✅ | New 40-byte token generated per vote. |
| I5. Eligibility verified once at onboarding | ✅ | gov.gr verification at registration. Token issuance checks `has_token_for_vote_N` boolean. |

---

## Known Residual Risks

1. **Reverse proxy logs** — If nginx/caddy logs vote endpoints, timing correlation is possible. Mitigated by `DEPLOYMENT_HARDENING.md` configuration.

2. **Hand-rolled crypto** — Blind signature implementation uses pure BigInt arithmetic. Passes test vectors but lacks independent review. Acceptable for bench test; requires review for scale-up.

3. **Ballot voting (consultative only)** — Deterministic AFM hash is brute-forceable. Not used for binding votes.

4. **Legacy polls (consultative only)** — Cleartext user_id + option_id. Not used for binding votes.

5. **Single service architecture** — Eligibility and voting share a process/database. Acceptable for trusted operator at bench scale.

---

## Deployment Checklist

- [ ] Set `SIGNING_MASTER_KEY` env var (32 bytes base64)
- [ ] Configure nginx/caddy to exclude vote endpoints from access logs
- [ ] Verify `VOTING_BACKEND` env var (default: `hash-chain`)
- [ ] Ensure `credentials: 'omit'` is active on anonymous-vote fetch (verified in code)
- [ ] Verify logging exclusions are active (verified in code)
- [ ] Test blind-signature flow end-to-end with test vectors
- [ ] Document retention policy for vote data (per proposal lifecycle)

---

*This document is a living record. Update when code or deployment changes.*
