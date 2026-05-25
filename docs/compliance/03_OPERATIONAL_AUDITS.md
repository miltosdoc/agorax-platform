# Operational Audits — AFM Salt, PDF Retention, Consent Logging, License

**Date:** 2026-05-25
**Auditor:** Hermes (per `GDPR_FORMALIZATION_BRIEF.md` §5 acceptance criteria & §4 tensions)
**Scope:** Brief tasks #2, #4, #5, #6 from the compliance README.

---

## 1. AFM salt handling — partial pass, one fix applied

**Brief §4.2:** *"AFM salted hash = pseudonymous, not anonymous. Confirm the salt is a server-side secret (`SALT_KEY`), not per-record and exposed."*

### Findings

- ✅ `SALT_KEY` is a **single server-side secret**, not per-record.
- ✅ Loaded from env via Pydantic settings (`ballot_service/config.py`).
- ✅ Production deployment via Docker enforces presence: `docker-compose.yml:70` uses the `${SALT_KEY:?SALT_KEY is required}` form (container fails to start if unset).
- ✅ AFM hashing uses SHA-256(AFM ‖ salt) — `ballot_service/validator.py:434-436`.
- ❌ **Before this audit:** `config.py:20` declared a default value `"CHANGE_ME_IN_PRODUCTION_abc123xyz"`. Any non-Docker deploy path (systemd / pm2 / local) silently used the default if the env var was missing.

### Remediation applied this PR

- `ballot_service/config.py:20` — `SALT_KEY: str = Field(..., min_length=16)`. No default. `Settings()` instantiation raises if env var is unset or shorter than 16 chars. Fail-loud regardless of deployment path.
- `ballot_service/conftest.py` — sets a test-only salt before `config` is imported, so the test suite still runs.

### Open residual risk for the DPIA

- **AFM keyspace is small** (9-digit Tax ID = 10⁹ values). Anyone who obtains the salt can brute-force candidate AFMs against `users.govgr_voter_hash` in seconds. The DPIA must state plainly that the salted hash is **pseudonymous, not anonymous**, and that the salt is therefore a high-value secret.
- **No salt rotation strategy.** If the salt leaks, all member hashes are re-identifiable forever. For the closed ≤1000-member instance the residual risk is acceptable but must be documented as an explicit acceptance.

---

## 2. Gov.gr Solemn Declaration PDF retention — pass

**Brief §3.1:** *"Does the uploaded Υπεύθυνη Δήλωση PDF get deleted after validation, or retained? This is a high-risk item — the raw PDF contains everything we claim not to store."*

### Findings — confirmed not retained

The PDF is **in-memory only across the entire processing pipeline**. No disk write, no DB blob, no tempfile.

- `client/src/components/user/verify-govgr-modal.tsx` — uploads `multipart/form-data` to Node.
- `server/routers/users.ts:34` — `verifyIdentity(file.buffer)` passes the in-memory buffer to the ballot client.
- `server/utils/ballot-client.ts:140-152` — POSTs the buffer to the Python service via `FormData`.
- `ballot_service/main.py:207` — `pdf_bytes = await file.read()`. Bytes live in a local `pdf_bytes` variable.
- `ballot_service/validator.py` — extracts text + AFM + doc code from the bytes, hashes them with the salt, and returns the hashes. The original bytes go out of scope.
- Verified by grep: `ballot_service/*.py` contains no `open(...)` write, no `tempfile`, no `write_bytes`, no DB blob column for raw PDFs.

This is the correct design and meets the brief's high-risk item.

### Required for the DPIA / ROPA

- State plainly: "Solemn Declaration PDFs are processed in-memory and discarded after extraction. No copy of the PDF is retained on disk or in the database."
- Reverse-proxy / load-balancer access logs may capture the *fact* of an upload (URL, size, IP, timestamp) but not its content. Confirm in deployment config that no body-capture middleware is enabled on the verification path.
- For the Privacy Notice: tell the member explicitly that the document is discarded post-verification and only hashes are retained.

---

## 3. Consent logging — fail, remediation required

**Brief §3.3:** *"Consent artifact: the exact text a member agrees to at onboarding for processing of political opinions. Must be explicit, specific, freely given, and the consent event must be logged (timestamp + version). Verify the onboarding flow stores this; if not, open a task."*

### Findings — gap

- **No consent storage exists.** Zero references to `consent`, `acceptedTerms`, `tos_accept`, `terms_accepted`, `privacyAccepted`, `gdpr_accept` in `shared/schema.ts`, any `migrations/*.sql`, or any router.
- The onboarding flow (`server/auth.ts` register path, lines 282-318) captures `username`, `password`, `email`, `name`, `deviceFingerprint`, IP — but **does not capture or record consent** to processing of special-category data.
- Article 9(2)(a) explicit consent is one of the two lawful bases the README claims (alongside Art. 9(2)(d)). Without a logged consent event, the 9(2)(a) basis is not actually evidenced — only documented in the brief.

### Recommended remediation (NOT applied in this PR — needs design decision)

Two viable shapes; controller chooses:

**Option A — minimal (column on users):**
```sql
ALTER TABLE users
  ADD COLUMN consent_version text,
  ADD COLUMN consent_accepted_at timestamp;
```
Simple. Records the current consent state. Loses history if the member ever re-consents.

**Option B — auditable (separate table) — recommended:**
```sql
CREATE TABLE user_consents (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_version text NOT NULL,
  consent_text_hash text NOT NULL,  -- sha256 of the exact text shown
  accepted_at timestamp NOT NULL DEFAULT now(),
  withdrawn_at timestamp,
  locale text NOT NULL              -- 'el' | 'en'
);
CREATE INDEX user_consents_user_idx ON user_consents (user_id);
```
Append-only, preserves consent history, supports withdrawal (Art. 7(3) right to withdraw). The `consent_text_hash` lets you prove later *what text* the member agreed to.

### Acceptance criteria for the consent remediation

- [ ] Migration shipped (Option A or B).
- [ ] Bilingual el/en consent text added (`PRIVACY_NOTICE.md` + `CONSENT.md` deliverables from the brief).
- [ ] Onboarding flow updated: registration cannot complete without explicit consent acceptance. Write event to `user_consents` (or columns).
- [ ] Consent withdrawal endpoint added (Art. 7(3)).
- [ ] Privacy Notice surfaces the consent text + version + withdrawal route to the member.

---

## 4. LICENSE inconsistency — controller decision required

**Brief §4.4:** *"LICENSE inconsistency (MIT vs CC-BY-NC-4.0 in package.json) — not GDPR, but flag it; legal coherence of the entity matters for the AMKE."*

### Findings

| Source | Declared license |
|---|---|
| `LICENSE` (root file, the legally canonical artifact) | **MIT** (Copyright 2024-2026 Demopolis Working Group & Miltos Triantafyllou) |
| `package.json:8` | **CC-BY-NC-4.0** |

The repo currently grants two contradictory rights regimes. MIT is a permissive software license; CC-BY-NC-4.0 is a Creative Commons license intended for creative works, with a **non-commercial** restriction. A downstream consumer reading either can claim they relied on the more permissive interpretation.

### Options (pick one — not auto-resolved)

1. **MIT everywhere** — align `package.json` to match the LICENSE file. Maximum adoption; AMKE keeps copyright but anyone can fork commercially.
2. **CC-BY-NC-4.0 everywhere** — replace the LICENSE file. Prevents commercial appropriation of the AgoraX platform. Note: CC-BY-NC-4.0 is **not OSI-approved** and is generally a poor fit for software (license-compatibility friction with most open-source ecosystems).
3. **Dual: AGPL-3.0 for software + CC-BY-NC-4.0 for docs** — common civic-tech pattern. AGPL prevents commercial forks from going closed-source while staying OSI-approved.

**Recommendation:** Option 3 if the AMKE wants to prevent commercial enclosure; Option 1 if the AMKE wants maximum adoption. The status quo is the worst of all worlds.

---

## 5. Status summary against brief acceptance criteria

| Brief §5 criterion | Status |
|---|---|
| Every personal-data field maps to a real column, verified against schema + migrations | ✅ Done in [02_DATA_MINIMIZATION_AUDIT.md](02_DATA_MINIMIZATION_AUDIT.md) |
| §1 vote-linkage resolved with code citations | ✅ Resolved to Option B in [01_VOTE_LINKAGE_AUDIT.md](01_VOTE_LINKAGE_AUDIT.md) |
| Gov.gr raw-PDF retention confirmed | ✅ This doc §2 — in-memory only, not retained |
| LLM quality-gate data flow confirmed | ✅ Confirmed external in [02_DATA_MINIMIZATION_AUDIT.md §4.2](02_DATA_MINIMIZATION_AUDIT.md); controller decision pending |
| DPIA, ROPA, Privacy Notice, Consent, Internal Policies exist | ⏳ Pending — all audit inputs now ready |
| No document asserts a control that you have not located in the codebase | ✅ Every claim cites file + line |
| `docs/compliance/README.md` indexes all of the above and lists open remediation tasks | ✅ Being updated |
