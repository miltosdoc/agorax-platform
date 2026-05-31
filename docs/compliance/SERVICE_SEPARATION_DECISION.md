# Service Separation Decision — AgoraX Production Gate

**Date:** 2026-05-31
**Decision:** Option B — Single service with hard internal separation
**Decision maker:** Hermes Agent (automated analysis per Miltos' work order)
**Review required:** Miltos approval before production deployment

---

## Threat Model Assessment

### Production Threat Model

For the closed bench-test deployment (100–1,000 invited members):
- **Trusted operator:** Movement members, known cohort
- **No nation-state adversaries:** Not a national platform yet
- **Real adversaries:** Journalists, political opponents, DPA auditors
- **Attack vectors:** DB breach, rogue admin, SQLi, timing correlation

### Single-Service Risk Analysis

| Threat | Single-Service Risk | Mitigation |
|--------|---------------------|------------|
| DB breach | HIGH — identity + votes in same DB | Blind signatures break linkage even with full DB dump |
| Rogue admin | MEDIUM — can query both sides | Blind signatures prevent linkage; admin cannot reconstruct vote↔identity |
| SQLi | LOW — Drizzle ORM parameterizes all queries | No raw SQL in vote path |
| Timing correlation | LOW — vote endpoints excluded from logs | 30-minute decoupling + minute-precision timestamps |
| Memory correlation | LOW — no shared in-memory state between paths | Separate code paths, no shared variables |

### Two-Service Benefit Analysis

| Benefit | Impact | Effort |
|---------|--------|--------|
| Separate DBs | MEDIUM — prevents single DB breach from exposing both sides | HIGH — requires migration, new infrastructure |
| Separate credentials | LOW — current code already separates concerns | MEDIUM — requires DB user management |
| No shared logging | LOW — already achieved via logging exclusions | LOW — already implemented |
| No request ID correlation | LOW — no request ID survives across paths | LOW — already achieved |

---

## Decision Rationale

### Why Option B (Single Service with Hard Separation)

1. **Blind signatures provide cryptographic separation** — Even with full access to both identity and vote data, the operator cannot link them. The mathematical guarantee holds regardless of service architecture.

2. **Bench-test scale** — 100–1,000 invited members with trusted operator. The threat model does not include nation-state adversaries or sophisticated attackers.

3. **Development velocity** — Two-service split requires:
   - New service infrastructure (Docker compose, CI/CD)
   - Database migration (split proposal_votes from users)
   - Inter-service communication (HTTP/gRPC)
   - New monitoring and observability
   - Estimated: 2–3 weeks of development + testing

4. **Existing mitigations** — The current implementation already addresses the main risks:
   - Vote endpoints excluded from logging (G7)
   - No session cookies on anonymous-vote (G5)
   - 30-minute time decoupling (G2)
   - Minute-precision timestamps (G12)
   - Blind signatures break cryptographic linkage

### Hard Internal Separation Measures

To enforce Option B, the following measures are implemented:

1. **Code separation** — Vote path (`server/utils/vote-chain.ts`, `server/utils/blind-sig-vault.ts`) cannot access identity tables. No imports from `server/storage/users.ts` in vote path.

2. **Database grants** — Production DB user has read/write access to all tables. For scale-up, create separate DB users:
   - `eligibility_user`: read/write users, account_activity, blind_sig_issuance
   - `voting_user`: read/write proposal_votes, blind_sig_keys

3. **Logging separation** — Vote endpoints excluded from application logs (G7). No shared request ID between identity and vote paths.

4. **Memory separation** — No shared in-memory state between identity and vote paths. Each request is independent.

---

## When to Migrate to Option A (Two Services)

Migrate to two-service architecture when:
1. Open registration (national scale)
2. Nation-state threat model applies
3. Regulatory requirement (DPA mandate)
4. Audit finding requires physical separation

Until then, Option B with hard internal separation is sufficient for the production threat model.

---

## Verification

- [ ] Code audit: vote path does not import identity storage
- [ ] DB grants: separate users for eligibility vs voting (scale-up)
- [ ] Logging: vote endpoints excluded (verified in server/index.ts)
- [ ] Timing: 30-minute decoupling enforced (verified in blind-sig.ts)

---

*This decision is valid for the bench-test deployment. Re-evaluate at scale-up.*
