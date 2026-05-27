# Internal Policies — Access, Retention, Breach, Erasure

**Audience:** AMKE staff with access to the AgoraX systems.
**Version:** 2026-05-25
**Status:** Draft for controller review and sign-off.
**Inputs:** [DPIA.md](DPIA.md), [ROPA.md](ROPA.md), audits [01](01_VOTE_LINKAGE_AUDIT.md), [02](02_DATA_MINIMIZATION_AUDIT.md), [03](03_OPERATIONAL_AUDITS.md).

> The brief permits short, ≤1000-member-appropriate policies. These are not enterprise manuals; they are the smallest set of decisions an admin needs to act lawfully.

---

## 1. Access control

### 1.1 Who has what

| Role | Holders | Database read | Database write | Server SSH | Vote↔identity join |
|---|---|---|---|---|---|
| Controller representative | Miltos Triantafyllou | ✅ | ✅ | ✅ | ✅ (with audit log) |
| Technical admin | TBD (named, ≤2 people) | ✅ | ✅ | ✅ | ✅ (with audit log) |
| Application service (Node) | service user | ✅ (scoped) | ✅ (scoped) | ❌ | implicit via app code |
| Application service (Python ballot) | service user | ✅ (own tables) | ✅ (own tables) | ❌ | ❌ |
| Member (logged-in user) | each user themselves | own row + own activity | n/a | ❌ | only own choice |
| Member (admin role) | `users.isAdmin = true`, named set | reads `admin-accounts` view | sets `accountStatus` | ❌ | ❌ in this UI |

### 1.2 Operating rules

- **No shared admin accounts.** Each technical admin has their own DB user and SSH key. List of holders is kept in the repo at `.claude/ADMINS.md` (private branch) — re-issued on any join/leave.
- **MFA mandatory** for any admin who can read the `proposal_votes` table or run schema migrations.
- **Audit log:** every join across `proposal_votes` and `users` performed manually (not via the application) must be logged in `docs/compliance/audit-log.md` with date, admin, purpose, and member-IDs touched. This is *the* control that turns "the host can read votes" into "we know when they did and why."
- **Postgres role separation:** the application service role does NOT have `SELECT` on `account_activity` or `erasure_requests` beyond what the app needs. Admins use a separate role.

### 1.3 Logging

The deployment must NOT capture request bodies on:

- `POST /api/proposals/:id/vote`
- `POST /api/amendments/:id/vote`
- `POST /api/amendments/:id/rejection-vote`
- `POST /api/proposals/:id/arguments`
- `POST /api/proposals/:id/amendments`
- `POST /api/user/consent/*`
- `POST /api/user/erasure-request`
- `POST /api/user/verify-govgr` (multipart with PDF)

Postgres `log_statement` must NOT be set to `all` or `mod`. Application logger must redact `req.body` on these routes.

---

## 2. Retention & deletion

### 2.1 Retention schedule

See [ROPA.md §6 (English) / §6 (Greek)](PRIVACY_NOTICE.md) for the member-facing version. Internal expanded version:

| Data | Retention | Deletion mechanism |
|---|---|---|
| `users` row | Until account closure + 30 days, then anonymise (see §2.3) | Member-initiated via Art. 17, or admin closure |
| `user_consents` | Indefinite | Append-only; never deleted, even after account closure |
| `account_activity` (IP, fingerprint) | 12 months rolling | Scheduled job (TBD — `scripts/retention-cleanup.ts`) |
| `proposal_votes` | Indefinite (with chain integrity) | Crypto-shred on Art. 17 (see §2.4) |
| `eg_ballots` | Indefinite | Same |
| `proposals`, `proposal_amendments`, `comments`, `debate_arguments` | Indefinite | Pseudonymise author on Art. 17 (see §2.4) |
| `democracy_points` ledger | Indefinite | Pseudonymise on Art. 17 |
| `erasure_requests` | Indefinite | Compliance record |
| Gov.gr PDF | **Zero** — never persisted | Validated in `ballot_service/main.py:207`; not in DB |
| Database backups | 30 days rolling | Encryption at rest; access-restricted; backup window short enough that an erasure propagates within 30 days |

### 2.2 Backup retention vs. erasure

The 30-day backup window means an Art. 17 erasure is not complete until the last backup older than the erasure rolls off. Members are informed of this in the Privacy Notice §6.

### 2.3 Account closure (member-initiated)

When a member closes their account (Art. 17 or self-service in profile):

1. Record an `erasure_requests` row.
2. Admin processes within **30 days** (Art. 12(3) deadline).
3. Set `users.email = 'erased-<id>@example.invalid'`, `users.username = 'erased-<id>'`, `users.name = 'Erased Member'`, null out `govgrFirstName`, `govgrLastName`, `govgrMunicipality`, `govgrPostcode`, `profilePicture`. Keep `govgrVoterHash` and `govgrDocCodeHash` — these are the controls that prevent re-registration with the same identity.
4. Pseudonymise author refs (see §2.4).
5. Crypto-shred the vote chain (see §2.4).
6. Mark `erasure_requests.processed_at` and `processed_by`.

### 2.4 Erasure vs. append-only structures — the resolution

**The tension:** `proposal_votes` row hash is `sha256(prev_hash | proposal_id | user_id | choice | weight | cast_at)` (migration `0010_vote_hash_chain.sql:48-54`). Changing `user_id` post-hoc breaks tamper-evidence.

**The resolution — three-part (implemented):**

1. **Active deliberation period (proposal status not yet `decided` / `archived`):** documented lawful refusal under Art. 17(3)(d) — audit integrity during an active vote is a legitimate interest. Member is informed that erasure of votes in active proposals is deferred until the proposal reaches a terminal state; all other personal data is erased immediately. Implemented in `server/storage/users.ts:processErasureRequest`, which returns the deferred row ids.
2. **Post-close crypto-shredding:** once a proposal transitions to `decided` or `archived`, the close-handler in `server/utils/proposal-state-machine.ts:triggerSideEffects` calls `processDeferredErasuresForProposal(proposalId)` which sets `proposal_votes.user_id = NULL, erased_at = NOW()` for any row whose user has a processed erasure_request. The chain `row_hash` stays opaque; verifier in `server/utils/vote-chain.ts` recognises `erasedAt !== null` and accepts the stored hash, walking the prev_hash linkage only. Same treatment for `eg_ballots` joined to `eg_elections.status='closed'`.

   - **Schema shipped:** migration `0017_vote_erasure.sql` — `user_id` is now nullable, `erased_at` column added. `NULL` is the stable erased sentinel (no FK violation).
   - **Side effect:** tally-by-choice survives (the `choice` column remains); the (member → choice) link is gone for that row.
3. **Democracy Points ledger:** same approach — null the FK on erasure. Pending: the points ledger schema currently constrains `user_id NOT NULL`; this needs a follow-up migration once the ledger is decided to be in MVP scope (audit `02 §4.3` decision).

**For the `electionguard` backend (`eg_ballots`):** same crypto-shred — null/sentinel `user_id`, ciphertext remains. The encrypted ballot still tallies into the result; the member is no longer linked to it.

**The text of the deferral notice the member must see when filing Art. 17 during an active vote:**

> Your erasure request has been recorded. Because removing your votes from currently-active proposals would damage the audit chain that protects every member's vote, your political-opinion data in active proposals will be erased automatically when those proposals close. All other personal data is erased now. Active proposals affecting you: [LIST]. Estimated close date: [DATE].

---

## 3. Breach response runbook (Art. 33 — 72-hour clock)

### 3.1 What counts as a breach

Any unauthorised access to, disclosure of, loss of, or destruction of personal data in our systems. Including:

- Server compromise (SSH key leak, app vulnerability exploited).
- DB credential leak.
- Backup leak.
- Disclosure of `SALT_KEY` (worst case — re-identifies every AFM hash).
- Mis-sent email containing member personal data.
- Lost / stolen laptop with admin credentials.
- Insider unauthorised access (admin reads vote↔identity beyond their role).

A near-miss (e.g., port-scan probe with no successful intrusion) is not a breach but should be logged.

### 3.2 The 72-hour clock

Starts when **any AMKE staff member becomes aware** of the breach (not when it's confirmed). Notification to the HDPA is mandatory unless the breach is unlikely to result in risk to data subjects.

### 3.3 Decision tree

```
breach detected
  │
  ├── contain (within 1 hour)
  │     • revoke compromised credentials
  │     • rotate SALT_KEY if affected (this re-pseudonymises everything)
  │     • take affected service offline if needed
  │
  ├── assess (within 24 hours)
  │     • what data: identity / votes / Art. 9?
  │     • how many subjects?
  │     • likely consequences?
  │
  ├── notify HDPA (within 72 hours of awareness)
  │     • via https://www.dpa.gr — breach notification form
  │     • include: nature, categories + approx number of subjects,
  │       categories + approx number of records, likely consequences,
  │       measures taken / proposed
  │
  ├── notify members (only if "high risk" — Art. 34)
  │     • via email, in-app banner, public statement
  │     • plain language, what happened + what they should do
  │
  └── document (regardless of HDPA notification)
        • write up in docs/compliance/incidents/YYYY-MM-DD-slug.md
        • root-cause analysis
        • policy / code change to prevent recurrence
        • re-issue DPIA if scope changed
```

### 3.4 Who decides

| Decision | Who |
|---|---|
| Containment (immediate) | Whichever admin is online — act first, ask later |
| HDPA notification | Controller representative (Miltos) — within the 72-hour window |
| Member notification | Controller representative + technical admin agreement |
| Public statement | Controller representative |

If the controller representative is unreachable within 24 hours of detection, the named technical admin (TBD) is delegated authority to notify HDPA.

### 3.5 Tabletop exercise

Run once a year, even at this scale. Pick a realistic scenario (e.g., "admin laptop stolen, `psql` history file readable"). Walk the runbook. Update where it broke down.

---

## 4. Subject-rights SLA

| Right | SLA from request | Mechanism |
|---|---|---|
| Art. 15 — Access | Immediate (self-service) | `GET /api/user/data-export` |
| Art. 16 — Rectify | 7 days | Manual admin via DB; no public endpoint |
| Art. 17 — Erasure | 30 days (Art. 12(3)) | Manual admin via `erasure_requests` queue, per §2.3–2.4 |
| Art. 18 — Restrict processing | 7 days | Set `accountStatus = 'restricted'` (existing column) + flag in `accountFlags` |
| Art. 20 — Portability | Immediate | Same as Art. 15 — JSON export |
| Art. 21 — Object | 30 days | Manual review by controller |
| Art. 7(3) — Withdraw consent | Immediate | `POST /api/user/consent/withdraw` |

**Failure to meet SLA** must be communicated to the member with a reason (Art. 12(3) allows up to 3-month extension for complex cases). Log the delay in the `erasure_requests.notes` field.

---

## 5. Re-review triggers

This policy must be re-issued (and a new version logged in [README.md](README.md)) on any of:

- A new processor relationship.
- Any change to the AFM hashing or SALT_KEY rotation policy.
- A schema change touching tables in [DPIA §2](DPIA.md).
- A breach (after-action review).
- Moving from consultative to binding votes.
- Annually, on the anniversary of the previous sign-off.

---

## 6. Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Controller representative | Miltos Triantafyllou | TBD | |
| Technical admin | TBD | TBD | |
