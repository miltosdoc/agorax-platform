# Deployment Hardening — Vote Anonymity

**Date:** 2026-05-31
**Scope:** Closed bench-test deployment (100–1,000 invited members)
**Reference:** `docs/compliance/AUDIT_IDENTITY_VOTE_ANONYMITY.md` §G10

---

## Nginx / Reverse Proxy — Access Log Exclusion

The application-level logging has been hardened (vote endpoints excluded from `server/index.ts`). The reverse proxy (nginx, Caddy, etc.) must also exclude vote endpoints from access logs.

**Why:** If the reverse proxy logs all requests, it creates a timing correlation vector between the authenticated `/blind-sign` request and the unauthenticated `/anonymous-vote` request. Even though the application doesn't log these, the proxy does.

### Nginx Configuration

```nginx
# Map to exclude vote endpoints from access logs
map $request_uri $log_vote_endpoint {
    default 0;
    ~* /api/proposals/[^/]+/blind-sign 1;
    ~* /api/proposals/[^/]+/anonymous-vote 1;
    ~* /api/proposals/[^/]+/verify-receipt 1;
    ~* /api/proposals/[^/]+/blind-key 1;
}

# Conditional access log
access_log /var/log/nginx/agorax_access.log main if=$log_vote_endpoint;

# Or use a separate log format that omits vote endpoints
access_log /var/log/nginx/agorax_access.log main;
access_log /var/log/nginx/agorax_vote.log main if=$log_vote_endpoint;
# Then ensure agorax_vote.log is not retained (rotate/delete immediately)
```

### Caddy Configuration

```caddy
# Use the log directive with a matcher to exclude vote endpoints
log {
    exclude /api/proposals/*/blind-sign
    exclude /api/proposals/*/anonymous-vote
    exclude /api/proposals/*/verify-receipt
    exclude /api/proposals/*/blind-key
}
```

### Cloudflare / CDN

If using Cloudflare or similar, ensure that:
1. Worker logs don't capture vote endpoint requests
2. Cache rules don't store vote responses (they shouldn't be cacheable anyway)
3. Analytics don't correlate vote endpoint access with user identity

### Verification Checklist

- [ ] Reverse proxy access logs exclude vote endpoints
- [ ] No other logging layer (WAF, load balancer, CDN) captures vote requests
- [ ] Log rotation policy ensures any accidental vote logs are deleted within 24 hours
- [ ] Deployment documentation includes this configuration

---

## Known Limitations — Bench Test Scope

### Ballot Votes (G3)

The ballot voting flow (`/api/ballot/validate`) uses a Python service that extracts AFM from the Solemn Declaration PDF and computes `SHA256(AFM + SALT)` as the voter hash. This is a deterministic function of AFM — brute-forceable at ~30 bits of entropy.

**Status:** Deprecated for binding votes. Use the blind-signature anonymous voting flow (`/blind-sign` + `/anonymous-vote`) for binding votes. Ballot voting is retained for consultative purposes only.

**Remediation:** Replace the ballot voting flow with the same blind-signature scheme used for proposal votes. This requires modifying the Python ballot service to generate random tokens instead of deterministic hashes.

### Legacy Polls (G4)

The legacy polls system (`votes` table) stores `user_id` + `option_id` in cleartext. This is a pseudonymous voting mechanism — the operator can see who voted for what.

**Status:** Deprecated for binding votes. Legacy polls are retained for consultative purposes only (surveys, preference gathering, non-binding opinions).

**Remediation:** Either (a) apply blind-signature scheme to legacy polls or (b) deprecate legacy polls for binding votes entirely. For the bench test, option (b) is sufficient — label legacy polls as "consultative only".

### Two-Service Split (G8)

The current architecture runs eligibility and voting in a single Express process sharing a single Postgres database. The design brief calls for two strictly separated services with separate datastores.

**Status:** Not implemented for bench test. The single-service architecture is acceptable for the closed bench-test deployment (100–1,000 invited members) because:
1. The operator is trusted (movement members)
2. The blind-signature crypto provides unlinkability even within a single service
3. The metadata side channels have been closed (logging, cookies, timing)

**Remediation:** For scale-up (open registration, national deployment), split into two services:
- Eligibility Service: onboarding, gov.gr verification, token issuance
- Voting Service: vote casting, tally, receipt verification

### Hand-Rolled Crypto (G11)

The blind-signature implementation (`shared/blind-sig.ts`) uses pure BigInt arithmetic with no external dependency. It passes test vectors but has not received independent cryptographic review.

**Status:** Documented as a known risk. For binding elections, replace with a reviewed library and obtain independent cryptographic review.

---

## Acceptance Test — Current State

**Question:** "If I hand you the complete database dump and the entire codebase, can you reconstruct what AFM/member X voted?"

**Answer for anonymous mode (after all fixes):**

- **Database-only:** NO — `proposal_votes` stores `vote_token` (40 bytes: 32 random + 8 expiry) with `user_id = NULL`.
- **Database + application logs:** NO — vote endpoints excluded from logging.
- **Database + logs + session cookies:** NO — `credentials: 'omit'` on anonymous-vote fetch.
- **Database + logs + timing:** NO — 30-minute time decoupling enforced. Timestamps coarsened to minute precision.
- **Database + logs + device fingerprint:** NO — device fingerprint not captured on anonymous-vote path.
- **Database + logs + IP:** NO — no IP logging on vote endpoints. `account_activity` only logs login/registration.
- **Reverse proxy logs:** DEPENDS — must be configured per the nginx/caddy instructions above.

**The system is constructively incapable of answering the question** — provided the reverse proxy is configured correctly.

---

*Update this document when deployment infrastructure changes.*
