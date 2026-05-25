# AgoraX — Compliance Documentation

**Purpose:** GDPR compliance evidence for the closed direct-democracy instance (≤1000 verified members).

**Controller:** AMKE "Restart Democracy" (Greece)
**Supervisory Authority:** Greek HDPA (Hellenic Data Protection Authority)
**Lawful Basis:** Art. 9(2)(d) — not-for-profit political/association processing; Art. 9(2)(a) — explicit consent as backstop.

---

## Document Index

| Document | Status | Description |
|----------|--------|-------------|
| [GDPR_FORMALIZATION_BRIEF.md](GDPR_FORMALIZATION_BRIEF.md) | ✅ Complete | Audit brief — defines scope, operating principles, acceptance criteria |
| [01_VOTE_LINKAGE_AUDIT.md](01_VOTE_LINKAGE_AUDIT.md) | ✅ Complete | §1 finding — resolved to Option B (pseudonymity) with hard gate against binding votes |
| [02_DATA_MINIMIZATION_AUDIT.md](02_DATA_MINIMIZATION_AUDIT.md) | ✅ Complete | Art. 5(1)(c) drop list — 6 columns + dead location vertical removed; 3 open architectural decisions for controller |
| [03_OPERATIONAL_AUDITS.md](03_OPERATIONAL_AUDITS.md) | ✅ Complete | AFM salt (fixed), Gov.gr PDF retention (pass), consent logging (gap), LICENSE (decision needed) |
| [DPIA.md](DPIA.md) | ⏳ Pending | Data Protection Impact Assessment — all audit inputs ready |
| [ROPA.md](ROPA.md) | ⏳ Pending | Record of Processing Activities (Art. 30) |
| [PRIVACY_NOTICE.md](PRIVACY_NOTICE.md) | ⏳ Pending | Privacy Notice (Art. 13) — bilingual el/en |
| [CONSENT.md](CONSENT.md) | ⏳ Pending | Consent artifact (Art. 9(2)(a)) — bilingual el/en |
| [INTERNAL_POLICIES.md](INTERNAL_POLICIES.md) | ⏳ Pending | Access control, retention/deletion, breach response |

---

## Open Remediation Tasks

*(Populated during audit — each item must cite code location or be a formal risk acceptance)*

1. ~~**§1 Vote-linkage decision**~~ — **Resolved to Option B** (pseudonymity, honestly labelled) with hard gate against binding votes. See [01_VOTE_LINKAGE_AUDIT.md](01_VOTE_LINKAGE_AUDIT.md). Option A is multi-phase (SDK Phase 6+7, off-server guardians, ballot-schema refactor to remove `user_id` FK) and not deliverable on current timeline.
2. ~~**Gov.gr PDF retention**~~ — **Pass**: PDFs are in-memory only, never written to disk or DB. See [03_OPERATIONAL_AUDITS.md §2](03_OPERATIONAL_AUDITS.md).
3. **LLM quality gate data flow** — **Confirmed external** (`server/utils/llm-validation.ts` → OpenRouter → NVIDIA Nemotron; `server/utils/ai-merger.ts` same transport). Controller decision pending: swap to local model, remove until local, or document as processor with DPA. See [02_DATA_MINIMIZATION_AUDIT.md §4.2](02_DATA_MINIMIZATION_AUDIT.md).
4. ~~**AFM salt verification**~~ — **Pass + remediation applied**: `SALT_KEY` is server-side, env-loaded. Removed unsafe default in `ballot_service/config.py` so deployments fail-loud if env is missing. Residual risk (small AFM keyspace) documented for DPIA. See [03_OPERATIONAL_AUDITS.md §1](03_OPERATIONAL_AUDITS.md).
5. **LICENSE inconsistency** — **Decision required**: LICENSE file says MIT, `package.json` says CC-BY-NC-4.0. See [03_OPERATIONAL_AUDITS.md §4](03_OPERATIONAL_AUDITS.md) for options.
6. ~~**Consent logging**~~ — **Closed.** `user_consents` append-only table (migration 0015) + `users.requires_consent` gate (migration 0016) + bilingual canonical text (`shared/consent.ts`) + register gate + `POST /api/user/consent/accept` for OAuth/re-consent + `POST /api/user/consent/withdraw` (Art. 7(3)) + `requireConsent` middleware applied to vote/proposal/amendment/debate routes.

### Additional GDPR rights infrastructure (this PR set)

- **Art. 15 (right of access)** — `GET /api/user/data-export` returns the member's profile + consent history + activity + erasure requests as a downloadable JSON.
- **Art. 17 (right to be forgotten)** — `POST /api/user/erasure-request` records a pending request; manual admin processing per the brief's ≤1000-member scope. Hash-chain-vs-erasure resolution still pending (Internal Policies decision).
- **OAuth consent gap** — `users.requires_consent` defaults TRUE for OAuth-created members; the gate blocks Art. 9 routes until they accept via `/api/user/consent/accept`. Frontend interstitial UI is the remaining piece.
- **Existing-member backfill** — migration 0016 sets `requires_consent=true` for every pre-existing user; they will be gated until they re-accept.
7. **Right to erasure vs hash-chain** — Decide approach: crypto-shredding, pseudonymise-in-place, or documented lawful refusal.

---

## Operating Principle

> A document that asserts a control the code does not implement is worse than no document — it is evidence of negligence. Verify, then write.

Every control cited in these documents must be located in the codebase with a file path and symbol name. If a control does not exist, either implement it or record an explicit residual-risk acceptance.

---

## Out of Scope

- Formal DPO appointment
- Automated breach notification
- Consent-management platform
- Public/open-platform identity model

At ≤1000 members, manual processes for subject-access and deletion are acceptable and documented as such.
