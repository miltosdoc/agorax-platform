# Identity & Vote-Anonymity Audit

**Date:** 2026-05-31
**Auditor:** Hermes (per design brief from Miltos, 2026-05-31)
**Scope:** Complete trace of identity↔vote linkage across all storage, logging, and in-memory structures. Gap analysis against target architecture (§2-§6 of design brief).
**Status:** AUDIT COMPLETE — implementation pending review.

---

## 0. Executive Summary

**The platform currently has THREE voting paths, none of which satisfy the design brief's acceptance test:** *"If I hand you the complete database dump and the entire codebase, can you reconstruct what AFM/member X voted?"*

- **Path A (default hash-chain, pseudonymous):** YES — direct FK from `proposal_votes.user_id` → `users.id`. Cleartext choice. Row hash binds userId into integrity proof.
- **Path B (anonymous mode, blind-signed tokens):** CONSTRUCTIVELY NO at the database level — `proposal_votes` stores `vote_token` with `user_id = NULL`. **HOWEVER** side channels exist: timing correlation between authenticated `/blind-sign` and unauthenticated `/anonymous-vote`, device fingerprinting on the authenticated path, and the `blind_sig_issuance` ledger recording `(user_id, proposal_id, issued_at)`.
- **Path C (legacy polls — `votes` table):** YES — `votes.user_id` → `users.id`, cleartext `option_id`. No anonymization.
- **Path D (ballot votes — PDF via gov.gr):** YES — `ballotVotes.voterHash` = SHA256(AFM + SALT). Deterministic function of AFM. Brute-forceable (~10^9 space = ~30 bits).

**Verdict:** The anonymous mode (Path B) has the right cryptographic foundation but fails the acceptance test due to metadata side channels. The default and legacy paths store votes in cleartext with preserved identity.

---

## 1. Identity↔Vote Linkage Map

### 1A. Default Backend — Hash Chain (Pseudonymous Mode)

**Linkage:** DIRECT — `proposal_votes.user_id` → `users.id`

| Storage | Column(s) | Joinable to identity? | Cleartext? |
|---|---|---|---|
| `proposal_votes` | `user_id`, `choice`, `cast_at` | Yes — FK to `users.id` | Yes — `choice` is plaintext ('yes'/'no'/'abstain') |
| `proposal_votes` | `row_hash` | Yes — computed over `user_id::text` (vote-chain.ts:52-56) | N/A — hash binds identity |
| `users` | `name`, `email`, `username`, `govgrFirstName`, `govgrLastName`, `govgrVoterHash` | — | Yes |

**Code path:**
- `server/routers/proposals.ts:270-282` — `POST /api/proposals/:id/vote` requires `requireAuth`, reads `req.user.id`, calls `castProposalVoteWithChain({ proposalId, userId, choice })`
- `server/utils/vote-chain.ts:89-161` — inserts `userId` into `proposal_votes`, computes row hash over `userId`
- `server/voting/hash-chain-backend.ts:46-63` — `castSignedBallot` passes `input.userId` directly
- `server/voting/hash-chain-backend.ts:122-144` — `getVoterView` queries `proposal_votes` by `userId` to reveal the voter's own choice

**Reconstruction:** `SELECT u.name, u.email, pv.choice, pv.cast_at FROM proposal_votes pv JOIN users u ON pv.user_id = u.id WHERE pv.proposal_id = ?`

### 1B. Anonymous Mode — Blind-Signed Tokens

**Linkage:** NO direct FK. Side channels exist.

| Storage | Column(s) | Joinable to identity? | Cleartext? |
|---|---|---|---|
| `proposal_votes` (anonymous rows) | `vote_token`, `choice`, `cast_at`, `user_id = NULL` | No — token is random 256-bit, independent of AFM | Yes — `choice` is plaintext |
| `blind_sig_issuance` | `user_id`, `proposal_id`, `issued_at` | Yes — records "user X got a token for proposal Y at time T" | N/A — no choice stored |
| `blind_sig_keys` | `public_n`, `public_e`, `secret_d_ciphertext` | No — per-proposal keypair, encrypted at rest | N/A |

**Side channels that defeat unlinkability:**

1. **Timing correlation (CRITICAL):** The blind-sign request (`POST /api/proposals/:id/blind-sign`, line 319) is authenticated — the server knows `req.user.id`. The anonymous-vote request (`POST /api/proposals/:id/anonymous-vote`, line 391) is unauthenticated. Both happen in the same browser session, typically within seconds. The application log (`server/index.ts:60-71`) records `METHOD PATH STATUS_CODE DURATION` for all `/api/` requests. An operator can correlate:
   - `POST /api/proposals/:id/blind-sign 200 in Xms` at time T₁ (authenticated → user_id known)
   - `POST /api/proposals/:id/anonymous-vote 201 in Yms` at time T₂ (unauthenticated → token only)
   - If |T₂ - T₁| < threshold, the operator can link user_id → token → choice with high confidence.

2. **Device fingerprinting:** `users.device_fingerprint` is stored (schema.ts:21). The registration and login flows capture `req.body.deviceFingerprint` (auth.ts:311, 402). The `account_activity` table stores `device_fingerprint` per action (schema.ts:150). If the browser sends the same fingerprint on both the authenticated blind-sign request and the unauthenticated anonymous-vote request (via cookies or session), the operator can correlate.

3. **IP address correlation:** `users.registration_ip` and `users.last_login_ip` are stored. `account_activity.ip_address` is logged per action. The application log doesn't include IP, but the `account_activity` table does. If the blind-sign and anonymous-vote requests originate from the same IP (likely for residential users), the operator can correlate via `account_activity` timestamps.

4. **Issuance ledger participation inference:** `blind_sig_issuance` records `(user_id, proposal_id, issued_at)`. While it doesn't record the choice, it records participation. Combined with the tally, an operator can infer: if user X issued a token and the tally shows exactly N yes votes, removing user X changes the ratio — enabling probabilistic inference in small electorates (100-1,000 members).

**Code path:**
- `server/routers/proposals.ts:319-385` — `POST /api/proposals/:id/blind-sign` requires `requireAuth` + `requireConsent`. Records `blind_sig_issuance` row with `userId: req.user.id` (line 367).
- `server/routers/proposals.ts:391-447` — `POST /api/proposals/:id/anonymous-vote` — NO auth. Verifies blind signature, calls `castAnonymousVoteWithChain({ proposalId, voteToken, choice })`.
- `server/utils/vote-chain.ts:173-232` — inserts `userId: null, voteToken, votingMode: 'anonymous'` into `proposal_votes`.
- `client/src/lib/anonymous-vote.ts:69-121` — client-side flow: fetch key → blind → POST blind-sign → unblind → POST anonymous-vote (via raw `fetch()`, no auth headers).

### 1C. Legacy Polls — `votes` Table

**Linkage:** DIRECT — `votes.user_id` → `users.id`

| Storage | Column(s) | Joinable to identity? | Cleartext? |
|---|---|---|---|
| `votes` | `user_id`, `option_id`, `created_at` | Yes — FK to `users.id` | Yes — `option_id` → `poll_options.text` |

**Code path:**
- `server/storage/voting.ts:189-195` — `createVote` inserts `userId` + `optionId` into `votes`
- `server/storage/voting.ts:198-207` — `hasUserVoted` queries by `(pollId, userId)`

### 1D. Ballot Votes — PDF via Gov.gr

**Linkage:** DETERMINISTIC PSEUDONYM — `ballotVotes.voterHash` = SHA256(AFM + SALT)

| Storage | Column(s) | Joinable to identity? | Cleartext? |
|---|---|---|---|
| `ballot_votes` | `voter_hash`, `vote_choice`, `file_hash`, `signer_name`, `created_at` | Yes — `voter_hash` is deterministic function of AFM. Brute-force: enumerate all 10^9 AFMs, hash each, match. ~30 bits entropy. | Yes — `vote_choice` is plaintext |
| `users` | `govgrVoterHash` | Yes — same hash function. Joinable via `voter_hash = govgr_voter_hash`. | N/A |

**Code path:**
- `server/routers/ballot.ts:54-114` — `POST /api/ballot/validate` — uploads PDF, validates via Python ballot service, stores `voter_hash` + `vote_choice` in `ballot_votes`
- `server/utils/ballot-client.ts` — HTTP client to Python ballot service. The Python service extracts AFM from the PDF, computes SHA256(AFM + SALT), returns `voter_hash`.

**Brute-force attack:** Given the `ballot_votes` table and the salt (which is either hardcoded or derivable from source), an attacker can:
1. Generate all 10^9 possible AFMs (9-digit Greek tax numbers)
2. Hash each with the known salt
3. Match against `voter_hash` values
4. Reconstruct the full AFM → vote_choice mapping

This is REJECTED-A from the design brief — deterministic derivation from low-entropy input.

### 1E. ElectionGuard Backend (Development Only)

**Linkage:** DIRECT — `eg_ballots.user_id` → `users.id`

| Storage | Column(s) | Joinable to identity? | Cleartext? |
|---|---|---|---|
| `eg_ballots` | `user_id`, `ciphertext_ballot`, `cast_at` | Yes — FK to `users.id` | No — ElGamal encrypted. BUT: server encrypts (sees plaintext briefly), and `dev_guardian_secrets` stored server-side means host can decrypt. |

**Code path:**
- `server/voting/electionguard-backend.ts` — server-side encryption, server-side guardian secrets
- `eg_elections.dev_guardian_secrets` — JSONB column with trustee secret shares

**Note:** This backend is blocked in production (`server/voting/index.ts:43-48`). Documented as "DEVELOPMENT-ONLY, NOT FOR BINDING ELECTIONS."

---

## 2. Is Any Vote Stored in Cleartext Alongside an Identifier?

| Storage | Yes/No | Detail |
|---|---|---|
| `proposal_votes` (pseudonymous) | **YES** | `user_id` + `choice` in same row |
| `proposal_votes` (anonymous) | **YES** — `choice` is cleartext. `vote_token` is not an identifier, but side channels (see §1B) can link token → user |
| `votes` (legacy polls) | **YES** | `user_id` + `option_id` in same row |
| `ballot_votes` | **YES** | `voter_hash` (deterministic AFM function) + `vote_choice` in same row |
| `eg_ballots` | **NO** — ciphertext. But server sees plaintext during encryption and can decrypt via `dev_guardian_secrets` |
| `account_activity` | **INDIRECT** | No vote choice, but `ip_address` + `user_agent` + `timestamp` per `user_id` enables temporal correlation |

---

## 3. Is AFM Persisted Anywhere?

**Raw AFM:** NOT persisted in the Node.js application database. The Python ballot service receives AFM from the PDF during validation but the `ballot-client.ts` proxy does not store it — it stores `voter_hash` (SHA256(AFM + SALT)).

**AFM-derived values that ARE persisted:**
- `users.govgrVoterHash` — SHA256(AFM + SALT). Stored once during gov.gr verification.
- `ballot_votes.voter_hash` — SHA256(AFM + SALT). Stored per ballot vote.

**Write paths that touch AFM:**
1. `server/routers/users.ts` — gov.gr verification flow. Python ballot service validates the Solemn Declaration PDF, extracts AFM, returns `voter_hash`. Node.js app stores `govgrVoterHash` in `users` table. Raw AFM is NOT written to the Node.js DB.
2. `server/routers/ballot.ts:54-114` — ballot validation. Python service extracts AFM from PDF, computes `voter_hash`, returns it. Node.js stores `voter_hash` in `ballot_votes`. Raw AFM is NOT written to the Node.js DB.
3. **Python ballot service** — the AFM is parsed from the PDF and used to compute the hash. Whether the Python service persists AFM in its own storage (SQLite/JSON) needs verification in the ballot_service code.

**Verdict:** Raw AFM is not persisted in the Node.js database. However, the deterministic hash (SHA256(AFM + SALT)) IS persisted and is brute-forceable. Per the design brief invariant I1 ("AFM is never persisted"), the hash technically satisfies the letter but violates the spirit — it's a reversible pseudonym at 30 bits of entropy.

---

## 4. Does Identity Verification Happen Once or Per Vote?

**Current flow:**
- **Onboarding (once):** Gov.gr authentication via Solemn Declaration PDF. Python ballot service validates signature, extracts AFM, returns `voter_hash`. Node.js stores `govgrVoterHash` in `users` table, sets `govgrVerified = true`.
- **Per vote (no gov.gr re-auth):** The vote route checks `requireAuth` (session-based) and `requireConsent` (GDPR gate). For anonymous mode, the `/blind-sign` route checks community membership (`communityRepo.isCommunityMember`). No gov.gr re-authentication per vote.

**Verdict:** Identity verification happens once at onboarding. Per the design brief §4, this is correct — "Eligibility identity is verified once at onboarding, not on every vote."

---

## 5. Token Model

| Voting Path | Token Type | Persistent? | Per-vote? | Deterministic from AFM? |
|---|---|---|---|---|
| Legacy polls (`votes`) | None — direct `user_id` | N/A | N/A | N/A |
| Ballot votes (`ballot_votes`) | `voter_hash` = SHA256(AFM + SALT) | Yes — same hash for all votes by same user | No — reused across all ballot votes | **YES** — REJECTED-A violation |
| Proposal votes (pseudonymous) | None — direct `user_id` | N/A | N/A | N/A |
| Proposal votes (anonymous) | Random 256-bit token, blind-signed | No — fresh per proposal | Yes — one token per (user, proposal) | **NO** — token is CSPRNG-generated, independent of AFM |

**Verdict:** The anonymous mode satisfies I3 (token not deterministic from AFM) and I4 (fresh token per vote). The ballot votes path violates both I3 and I4.

---

## 6. Gap List — Ranked by GDPR Severity

### CRITICAL (violates non-negotiable invariants)

**G1. Default backend stores cleartext votes with identity (I1, I2 violation)**
- **Current:** `proposal_votes.user_id` + `choice` in same row. Row hash binds userId.
- **Target:** Two separated services. Voting service sees only token + choice. No identity in vote store.
- **Delta:** Schema change — `proposal_votes.user_id` must be nullable (already is per migration 0021). Default `voting_mode` must be `'anonymous'` (already is per schema.ts:280). The hash-chain backend must be modified to support anonymous casting OR replaced. The row hash computation must NOT include userId for anonymous votes (already handled — vote-chain.ts:52-56 uses mode-based identity).
- **Effort:** Medium — the schema and crypto plumbing exist. The gap is that the default pseudonymous path is still the primary code path. Need to make anonymous the default and close the pseudonymous path for binding votes.

**G2. Timing correlation between blind-sign and anonymous-vote (I2 violation — side channel)**
- **Current:** Client calls `/blind-sign` (authenticated) then immediately calls `/anonymous-vote` (unauthenticated). Application log records both with timestamps. No enforced delay.
- **Target:** "Time decoupling: votes must not be submittable in the same session or close in time to token issuance" (§6 of design brief).
- **Delta:** Enforce a mandatory delay window between token issuance and vote casting. The design brief says "use a voting window that opens after registration/issuance completes." Implementation options:
  - Server-side: reject `/anonymous-vote` if `blind_sig_issuance.issued_at` for that (user, proposal) is within N minutes. But the anonymous-vote endpoint doesn't know the user_id — it only has the token. This requires either (a) embedding an expiry in the token or (b) a separate issuance timestamp table keyed by token.
  - Client-side: enforce delay in the browser. Weaker — a determined voter (or coerced voter) can bypass it.
  - Architectural: separate the token issuance into a distinct session/endpoint that doesn't share the application log context.
- **Effort:** Medium — requires design decision on enforcement mechanism.

**G3. Ballot votes use deterministic AFM hash (I3 violation — REJECTED-A)**
- **Current:** `ballot_votes.voter_hash` = SHA256(AFM + SALT). Brute-forceable.
- **Target:** Random token independent of AFM, blind-signed.
- **Delta:** Replace the ballot voting flow with the same blind-signature scheme used for proposal votes. Or deprecate ballot voting entirely for the bench test.
- **Effort:** High — the ballot flow is a separate Python service with PDF parsing. Would need to redesign the entire ballot validation pipeline.

**G4. Legacy poll votes store cleartext identity + choice (I2 violation)**
- **Current:** `votes.user_id` + `option_id` in same row.
- **Target:** No identity in vote store.
- **Delta:** Either (a) apply blind-signature scheme to legacy polls or (b) deprecate legacy polls for the bench test. The design brief scope is "closed bench-test deployment (100-1,000 invited members)" — if legacy polls aren't used for binding votes, this is lower priority.
- **Effort:** High for (a), Low for (b) — just disable/label as non-binding.

### HIGH (metadata leaks that enable correlation)

**G5. Device fingerprinting on authenticated path enables correlation**
- **Current:** `users.device_fingerprint` stored. `account_activity.device_fingerprint` logged per action. If the browser sends the same fingerprint on both blind-sign and anonymous-vote requests, correlation is possible.
- **Target:** No device fingerprint on the vote path.
- **Delta:** Strip device fingerprint from the anonymous-vote request context. Ensure the anonymous-vote endpoint doesn't have access to session cookies or device fingerprint. Currently the anonymous-vote endpoint uses raw `fetch()` without auth headers — but if the browser auto-sends cookies, the session middleware could still associate the request.
- **Effort:** Low — verify that the anonymous-vote endpoint doesn't read session/cookies. Add `credentials: 'omit'` to the client-side fetch.

**G6. IP address logging on account_activity enables temporal correlation**
- **Current:** `account_activity.ip_address` logged for login, registration, and every action. `users.last_login_ip` updated on login.
- **Target:** "No IP logging anywhere in the vote path — application and reverse proxy / nginx access logs" (§6).
- **Delta:** Stop logging IP on the `/blind-sign` and `/anonymous-vote` endpoints. The `account_activity` table is written by `auth.ts` for login/registration — not for voting. But if any middleware logs IP on the vote path, it's a leak.
- **Effort:** Low — verify no IP logging on vote endpoints. The current `account_activity` writes are only in auth.ts (login/registration), not in voting routes.

**G7. Application log records vote requests with timestamps**
- **Current:** `server/index.ts:60-71` — middleware logs `METHOD PATH STATUS_CODE DURATION` for all `/api/` requests. This includes `/api/proposals/:id/blind-sign` and `/api/proposals/:id/anonymous-vote`.
- **Target:** No logging on the vote path.
- **Delta:** Exclude vote endpoints from the request logging middleware. Or route them through a separate service that doesn't share the log context.
- **Effort:** Low — add exclusion pattern to the logging middleware.

### MEDIUM (architectural gaps)

**G8. Single service, single datastore — no service separation**
- **Current:** Eligibility service and voting service are the same Express app sharing the same Postgres database.
- **Target:** "Two services, separate processes, separate datastores, no shared logging context, no shared request id" (§2).
- **Delta:** Split into two processes with separate databases. The eligibility service handles onboarding + token issuance. The voting service handles vote casting + tally. No shared logs, no shared request IDs.
- **Effort:** High — architectural change. Requires deployment infrastructure (Docker compose with two services, separate DBs).

**G9. blind_sig_issuance ledger enables participation inference**
- **Current:** `blind_sig_issuance` records `(user_id, proposal_id, issued_at)`. Operator knows who participated.
- **Target:** The design brief acknowledges this — "Operator sees 'user X participated in proposal Y.' Operator does NOT learn the unblinded token or the choice." (§7 retention table).
- **Delta:** This is an accepted trade-off. The issuance ledger is necessary for one-token-per-user enforcement. Participation inference is a known residual risk, not a gap.
- **Effort:** N/A — by design.

**G10. No nginx/reverse-proxy config in repo — access logs unknown**
- **Current:** No nginx config in the repository. Deployment is external.
- **Target:** "No IP logging anywhere in the vote path — application and reverse proxy / nginx access logs" (§6).
- **Delta:** Document in deployment config that nginx access logs must exclude vote endpoints, or use a separate upstream for vote endpoints with disabled access logging.
- **Effort:** Low — deployment documentation, not code change.

### LOW (nice-to-have)

**G11. Hand-rolled blind signature implementation**
- **Current:** `shared/blind-sig.ts` — pure BigInt arithmetic, no external dependency. Passes test vectors in `tests/integration/blind-sig.test.ts`.
- **Target:** "Use a maintained library (e.g. a reviewed RSA blind-signature or a blind variant of a modern scheme). Do not implement modular arithmetic by hand." (§3 of design brief).
- **Delta:** Replace with a reviewed library. The current implementation has test coverage but no independent cryptographic review.
- **Effort:** Medium — find a suitable library, migrate, retest.

**G12. Row hash includes cast_at timestamp (joinable metadata)**
- **Current:** `vote-chain.ts:40-48` — `canonicalizeCastAt` includes millisecond precision. The row hash binds the timestamp.
- **Target:** "No joinable timestamps stored on vote records (coarsen or omit)." (§6).
- **Delta:** Coarsen timestamps to minute/hour granularity, or omit from the row hash. Note: the row hash is a tamper-evidence mechanism — changing what it binds to affects the integrity guarantee.
- **Effort:** Low — but requires careful consideration of the integrity trade-off.

---

## 7. Retention Table Verification (§7 of design brief)

| Datum | Lives in | Retained? | Lifetime | Matches brief? |
|---|---|---|---|---|
| Raw AFM | Transient (Python ballot service) | No | Seconds during validation | ✅ |
| gov.gr signed proof | Transient (Python ballot service) | No | Verify signature, then discard | ✅ |
| account_hash (salted hash of AFM) / account_id | `users.govgrVoterHash` | Yes | Account lifetime | ✅ — but hash is brute-forceable |
| registered = true | `users.govgrVerified` | Yes | Account lifetime | ✅ |
| has_token_for_vote_N (boolean) | `blind_sig_issuance` (user_id + proposal_id) | Yes | Per vote epoch | ✅ — stores more than boolean (issued_at timestamp) |
| Blinded value m' | — | No | Never stored | ✅ |
| Issued token (m, s) | — | No (client-side only) | Client-side until cast | ✅ |
| Blinding factor r | Client only | No (server) | Destroyed client-side | ✅ |
| Spent-token set | `proposal_votes.vote_token` (anonymous rows) | Yes | Per proposal | ✅ — unique index prevents double-spend |
| vote_choice | `proposal_votes.choice` | Yes | Per platform policy | ⚠️ — stored in cleartext, no identity for anonymous mode |
| IP address (vote path) | `account_activity` (login/registration only, NOT voting) | No (on vote path) | — | ✅ — no IP logging on vote endpoints currently |

---

## 8. Summary of Required Actions

**Before the bench test can claim vote anonymity:**

1. **Close timing correlation (G2):** Enforce a delay between token issuance and vote casting. Either server-side (embed expiry in token) or client-side (enforce delay in browser).
2. **Strip device fingerprint from vote path (G5):** Ensure anonymous-vote endpoint doesn't receive session cookies or device fingerprint. Add `credentials: 'omit'` to client fetch.
3. **Exclude vote endpoints from application logging (G7):** Modify the logging middleware in `server/index.ts` to skip `/blind-sign`, `/anonymous-vote`, `/verify-receipt`.
4. **Document nginx access log exclusion (G10):** Add to deployment documentation that reverse proxy must not log vote endpoints.
5. **Replace hand-rolled crypto (G11):** Use a reviewed blind-signature library. Get independent cryptographic review.
6. **Coarsen or omit timestamps (G12):** Reduce timestamp precision in row hash to prevent temporal correlation.

**For binding votes (full two-service architecture):**

7. **Split into two services (G8):** Separate eligibility and voting into distinct processes with separate databases.
8. **Replace default backend (G1):** Make anonymous mode the default for binding votes. Deprecate pseudonymous mode.
9. **Fix ballot voting (G3):** Replace deterministic AFM hash with blind-signed tokens, or deprecate ballot voting for binding votes.
10. **Deprecate legacy polls for binding votes (G4):** Label as consultative-only, or implement blind-signature scheme.

---

## 9. Acceptance Test Result

**Question:** "If I hand you the complete database dump and the entire codebase, can you reconstruct what AFM/member X voted?"

**Answer for anonymous mode (Path B):**
- **Database-only:** NO — `proposal_votes` stores `vote_token` with `user_id = NULL`. The token is a random 256-bit value with no derivable relationship to AFM.
- **Database + application logs:** YES — timing correlation between `/blind-sign` (authenticated, user_id known) and `/anonymous-vote` (unauthenticated, token only) with millisecond-precision timestamps enables linkage with high confidence.
- **Database + logs + device fingerprint:** YES — device fingerprint correlation across authenticated and unauthenticated requests.
- **Database + logs + IP correlation:** YES — IP address in `account_activity` enables temporal correlation.

**The system is NOT constructively incapable of answering the question.** The cryptographic foundation (blind signatures) is sound, but the metadata side channels defeat the property. The gaps listed above must be closed before the acceptance test passes.

---

*End of audit. Awaiting review before proceeding to implementation.*
