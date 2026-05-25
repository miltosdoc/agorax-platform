# Data Protection Impact Assessment (DPIA)

**Article 35 GDPR** — required because we process **special-category data** (political opinions of identifiable persons) at scale.

| Field | Value |
|---|---|
| Controller | AMKE "Restart Democracy" (Greece) |
| Controller representative | Miltos Triantafyllou |
| Supervisory authority | Hellenic Data Protection Authority (HDPA) |
| System | AgoraX — closed direct-democracy platform, ≤1000 verified members |
| Document version | 2026-05-25 |
| Status | Draft for controller review and sign-off |
| Inputs | [01_VOTE_LINKAGE_AUDIT.md](01_VOTE_LINKAGE_AUDIT.md), [02_DATA_MINIMIZATION_AUDIT.md](02_DATA_MINIMIZATION_AUDIT.md), [03_OPERATIONAL_AUDITS.md](03_OPERATIONAL_AUDITS.md) |

> **Operating principle:** every control cited below is verified in the codebase. Where a control does not exist, the DPIA states that plainly and records a residual-risk acceptance.

---

## 1. Processing description

AgoraX is a closed deliberation + voting platform serving members of the AMKE. Three services share one PostgreSQL database:

| Service | Purpose | Personal data touched |
|---|---|---|
| Node.js API (`server/`) | Member accounts, proposals, debate, votes, Democracy Points | Identity, votes, contributions, activity |
| Python ballot service (`ballot_service/`) | Gov.gr Solemn Declaration validation | PDF in transit only (in-memory, discarded post-extraction) |
| PostgreSQL | Single source of truth | All structured personal data |

**Processing operations:**

1. Member registration (local or Google OAuth) with explicit Art. 9(2)(a) consent capture.
2. Gov.gr identity verification (Υπεύθυνη Δήλωση PDF → extracted hashes + minimal demographics).
3. Proposal authorship + deliberation (questions, solutions, amendments, debate arguments).
4. Voting on proposals + amendments (hash-chained ledger).
5. Sortition selection and feedback.
6. Democracy Points participation ledger.
7. Activity logging for abuse defense (IP, device fingerprint, account status).

**Out of scope** for this DPIA: public/open-platform mode (not deployed in this instance), DPO-mediated processes (manual at this scale).

---

## 2. Data inventory

Verified against `shared/schema.ts` and migrations 0000–0016.

### 2.1 Identity (`users` table)

| Field | Special-category? | Why retained | Citation |
|---|---|---|---|
| `username`, `name`, `email` | No (Art. 6) | Account identification | `shared/schema.ts:7-12` |
| `password` (scrypt-hashed) | No | Local auth | `server/auth.ts:60-77` |
| `providerId`, `provider` | No | OAuth identifier | `shared/schema.ts:13-15` |
| `profilePicture` (URL) | No | Display | `shared/schema.ts:15` |
| `isAdmin` | No | RBAC for admin views | `server/routers/users.ts:16-24` |
| `deviceFingerprint` | No (Art. 6(1)(f)) | Duplicate-account / abuse defense | `server/auth.ts:285-286`, `server/storage/users.ts:checkDuplicateAccounts` |
| `registrationIp`, `lastLoginIp` | No (Art. 6(1)(f)) | Abuse defense, admin review | `server/auth.ts:285,306,368` |
| `accountFlags`, `accountStatus` | No | Moderation, ban enforcement | `server/auth.ts:361`, `client/src/pages/admin-accounts.tsx` |
| `requiresConsent` | No | Art. 9 gate state | `server/auth.ts:requireConsent middleware` |
| `govgrVerified`, `govgrVerifiedAt` | No | Verification audit | `server/routers/users.ts:117-119` |
| `govgrFirstName`, `govgrLastName` | No | Member roll | extracted by `ballot_service/validator.py:476-484` |
| `govgrMunicipality`, `govgrPostcode` | No | Currently decorative; product-fit decision pending | see [02 §3](02_DATA_MINIMIZATION_AUDIT.md) |
| `govgrVoterHash` | No (pseudonymous, see §6.2) | One-person-one-vote enforcement | `ballot_service/validator.py:434-436` |
| `govgrDocCodeHash` | No | Anti-replay on the Solemn Declaration | `ballot_service/validator.py:501-503` |

**Deliberately NOT stored** (Art. 5(1)(c) minimisation):
- Raw AFM (Tax ID) — only the salted hash.
- Raw Gov.gr declaration PDF — processed in memory, discarded post-extraction (audited [03 §2](03_OPERATIONAL_AUDITS.md)).
- ID-card number, parents' names, phone, street address — never extracted from the PDF (`ballot_service/validator.py:476-494`).
- Date of birth, place of birth — dropped in migration 0014 ([02 §1](02_DATA_MINIMIZATION_AUDIT.md)).
- Precise GPS coordinates — dropped in migration 0014.

### 2.2 Special-category processing (Art. 9)

| Table | What's stored | Linkability to identity |
|---|---|---|
| `proposal_votes` | `user_id`, `choice`, `weight`, `cast_at`, hash chain | **Direct FK** — see [01](01_VOTE_LINKAGE_AUDIT.md) |
| `eg_ballots` | `user_id`, encrypted ballot | **Direct FK** even after encryption ships |
| `proposal_amendments` | `author_id`, `text` | Direct |
| `debate_arguments` | `author_id`, `content` | Direct |
| `comments` | `author_id`, `content` | Direct |
| `proposals` | `creator_id`, `question`, `solution` | Direct |

### 2.3 Consent + rights records

| Table | Purpose |
|---|---|
| `user_consents` (migration 0015) | Append-only Art. 7 + 9(2)(a) audit log |
| `erasure_requests` (migration 0016) | Art. 17 pending-request queue |

### 2.4 Activity / operational

- `account_activity` — login attempts, IP, device fingerprint, user-agent. Art. 6(1)(f).
- `sortition_attendance`, `sortition_feedback` — internal governance.
- `democracy_points`, `points_ledger` — internal incentive economy (append-only — Art. 17 tension, see §6.4).
- Job queue (`jobs`) — operational, no member content.

---

## 3. Lawful basis

| Activity | Basis |
|---|---|
| Account registration, authentication | Art. 6(1)(b) — contract performance |
| Abuse defense (IP, device fingerprint) | Art. 6(1)(f) — legitimate interest |
| Processing political opinions (votes, proposals, debate) | **Art. 9(2)(a) explicit consent** (primary) + **Art. 9(2)(d) not-for-profit political/association processing** (backstop) |
| Gov.gr identity verification | Art. 6(1)(c) — legal obligation (one-person-one-vote integrity) + 9(2)(a) consent for processing the declaration |
| Democracy Points participation ledger | Art. 6(1)(f) — legitimate interest in incentive design |

The two-pronged Art. 9 basis (consent + 9(2)(d) carve-out) is recorded so that consent withdrawal does not by itself collapse the lawfulness of historical processing — but does block any further processing of that member's political-opinion data.

---

## 4. Gov.gr Solemn Declaration handling — high-risk control verified

The uploaded PDF contains everything we claim not to store (ID-card number, parents, phone, street). The control: **never write the bytes to disk or DB**.

- `client/src/components/user/verify-govgr-modal.tsx` posts `multipart/form-data` to Node.
- `server/routers/users.ts:34` — `verifyIdentity(file.buffer)` passes the in-memory `Buffer` to the ballot service.
- `server/utils/ballot-client.ts:140-152` — POSTs the buffer as `FormData` over the Docker-internal network.
- `ballot_service/main.py:207` — `pdf_bytes = await file.read()` into a local variable.
- `ballot_service/validator.py` extracts text → hashes → returns hashes. Never writes the bytes.
- Verified by grep: no `open(...)` for write, no `tempfile`, no DB blob column for raw PDFs.

**Residual risk:** reverse-proxy / load-balancer access logs may record the *fact* of an upload (URL, size, IP, timestamp). They must not capture request bodies. Deployment must verify this in nginx / Caddy config.

---

## 5. Necessity & proportionality

Per the audit, six fields were dropped and the dead user-location vertical was removed (migration 0014) because they could not be justified against any working feature. The remaining identity fields all map to a code-cited working feature ([02 §2](02_DATA_MINIMIZATION_AUDIT.md)).

Two fields remain *kept-with-uncertainty* — `govgr_municipality` and `govgr_postcode` — pending a controller decision on whether a near-term feature will use them ([02 §3](02_DATA_MINIMIZATION_AUDIT.md)). If no plan within the next compliance review they should be dropped.

---

## 6. Risk assessment

### 6.1 Member de-anonymisation (vote linkage) — **CRITICAL, accepted as residual**

The primary risk in any direct-democracy platform: linking a verified member to their political choices.

- `proposal_votes.user_id` is a direct FK to `users.id`; the hash chain row hash is computed *over* `user_id` so removing it later breaks tamper-evidence.
- `eg_ballots.user_id` (electionguard backend) has the same FK; even after browser-side encryption ships, the linkage from identity row to ciphertext row survives.
- The SDK plan's privacy checklist (`docs/VERIFIABLE_VOTING_SDK_PLAN.md:222-225`) requires "voter roll stored separately from the ballot list; no identity stored beside a ciphertext" — the current schema fails this.

**Mitigation status:** None at the architectural level. Real Option A (unlinkable ballots) requires SDK Phase 6 + 7 + a ballot-schema refactor not in any current plan.

**Residual risk acceptance** — see [01_VOTE_LINKAGE_AUDIT.md](01_VOTE_LINKAGE_AUDIT.md) "Option B".

**Hard gate:** binding votes do NOT run on this stack. All votes are consultative.

### 6.2 AFM hash reversal

`govgr_voter_hash = SHA256(AFM ‖ SALT_KEY)`. AFM is 9 digits — 10⁹ keyspace. Anyone with the salt can brute-force every Greek tax ID in seconds.

**Mitigation:**
- Salt is a single server-side secret loaded from env, `ballot_service/config.py:20` — `Field(..., min_length=16)`. No in-code default; deployment without the env var fails to start.
- Salt is never logged, never sent to a client, never included in the data export.
- Salt rotation policy: not implemented. If the salt leaks, all hashes are permanently re-identifiable.

**Residual risk:** the salted hash is **pseudonymous, not anonymous**. Documented plainly in the Privacy Notice.

### 6.3 Cleartext votes / hash chain

Default `VOTING_BACKEND=hash-chain` stores votes in cleartext. Any DB-read access reconstructs the (member → choice → proposal) tuple.

**Mitigation:**
- RBAC on database access — restrict to a small named admin set (Internal Policy).
- No request-body logging on `POST /api/proposals/:id/vote` and similar — deployment must verify in middleware config.
- Postgres statement logging off for ballot inserts — deployment must verify.
- DB backups carry the same linkage — must be encrypted-at-rest and access-restricted.

### 6.4 Right to erasure vs. append-only ledgers

Two conflicting append-only structures:

1. **`proposal_votes` hash chain** — modifying any column breaks the chain hash (`migrations/0010_vote_hash_chain.sql:48-54`).
2. **`points_ledger`** (Democracy Points) — append-only by design.

**Resolution** (in [INTERNAL_POLICIES.md](INTERNAL_POLICIES.md), pending decision):
- For pre-close consultative votes: documented lawful refusal under Art. 17(3)(d) (legitimate interest in audit integrity until close).
- After proposal close: crypto-shred — replace `user_id` with a stable "erased" sentinel; verify endpoint skips erased rows. This preserves the chain for non-erased rows while honouring the erasure.
- For the Democracy Points ledger: same — erase the `users` row, nullify the ledger user FK, retain the ledger entries as anonymous transactions.

### 6.5 External processor disclosures

| Processor | What flows out | Decision |
|---|---|---|
| **OpenRouter → NVIDIA Nemotron** (LLM quality gate) | Was: full proposal text on every submission. | **Removed.** External API calls deleted in `server/utils/llm-validation.ts` and `server/utils/ai-merger.ts`. Proposal text never leaves the instance until a local model is wired. See [02 §4.2](02_DATA_MINIMIZATION_AUDIT.md). |
| Email provider (TBD) | Account confirmation / notifications | Not yet integrated. Must sign DPA before use. |
| VPS host | All of the database | Standard hosting agreement; document in ROPA. |

### 6.6 Member account abuse / takeover

- Password hashing: scrypt with per-record salt (`server/auth.ts:60-77`).
- Session management: PostgreSQL-backed sessions (`pool` in `server/db.ts`).
- Rate limiting on auth routes: `authLimiter` middleware (`express-rate-limit`).
- Device fingerprint + IP duplicate check on registration (`server/auth.ts:285-286`).

---

## 7. Mitigations summary — each cited control verified in code

| Risk | Control | Implementation |
|---|---|---|
| Vote linkage | Documented + binding-vote hard gate | [01 audit](01_VOTE_LINKAGE_AUDIT.md) |
| AFM hash reversal | Server-side salt, fail-loud config | `ballot_service/config.py:20` |
| PDF retention | In-memory only | `ballot_service/main.py:207`, `validator.py` (no disk writes) |
| Cleartext votes | Operational controls (deployment) | RBAC, log suppression — see INTERNAL_POLICIES |
| Consent not evidenced | `user_consents` append-only log | migration 0015, `shared/consent.ts`, `requireConsent` middleware |
| OAuth gate bypass | `users.requires_consent` default-true | migration 0016, `server/auth.ts:requireConsent` |
| No subject-access path | `GET /api/user/data-export` | `server/routers/users.ts` |
| No erasure path | `POST /api/user/erasure-request` + manual processing | `server/routers/users.ts` + Internal Policies |
| External LLM disclosure | Removed | `server/utils/llm-validation.ts`, `server/utils/ai-merger.ts` |
| Data minimisation | 6 columns + dead vertical dropped | migration 0014 |

---

## 8. Residual risks — controller acceptance required

The following residual risks remain after the controls above. By signing this DPIA, the controller representative acknowledges them.

1. **Vote pseudonymity, not anonymity.** Per [01](01_VOTE_LINKAGE_AUDIT.md), the (member → vote) link is reconstructable from DB read. Binding votes will not run on this stack; consultative votes accept this with explicit consent.
2. **AFM-hash re-identifiability if the salt leaks.** No rotation. Single point of failure.
3. **Append-only-vs-erasure trade-off.** Crypto-shredding (post-close) preserves the chain but loses the ability to attribute the erased vote. The pre-close interval lacks an automated erasure path.
4. **Operational dependencies on deployment hygiene.** RBAC scope, log-body suppression, backup encryption, reverse-proxy log scope — all enforced by the controller's hosting configuration, not by code.
5. **OAuth interstitial frontend not yet shipped.** Backend gate blocks Art. 9 actions correctly; UI flow that prompts OAuth-created members to accept is the next frontend task.
6. **Manual subject-rights processing.** Art. 15 is automated; Art. 17 records a request only — manual admin action follows. Acceptable at ≤1000-member scale per the brief; document SLA in Internal Policies.

---

## 9. Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Controller representative | Miltos Triantafyllou | TBD | |
| Technical lead | Miltos Triantafyllou | TBD | |

**Re-review trigger:** any of (a) introduction of a new external processor; (b) move from consultative to binding votes; (c) consent text version bump beyond patch level; (d) DB schema change touching any table flagged in §2.2; (e) annually.
