# §3 Data Minimization Audit — Findings & Drops

**Date:** 2026-05-25
**Auditor:** Hermes (per `GDPR_FORMALIZATION_BRIEF.md` §3.1 "Necessity & proportionality")
**Legal basis:** GDPR Art. 5(1)(c) — personal data shall be "adequate, relevant and limited to what is necessary in relation to the purposes for which they are processed."

---

## TL;DR

Six personal-data columns and the entire user-location vertical were dropped because their collection could not be justified against any working feature. Five sensitive columns (IPs, device fingerprint, account flags) are retained with code-cited Art. 6(1)(f) justification. Three architectural decisions remain open for the controller (electionguard backend, LLM external API, Democracy Points scope).

---

## 1. Dropped — `users` columns

Migration: [`migrations/0014_minimise_personal_data.sql`](../../migrations/0014_minimise_personal_data.sql).

| Column | Why dropped | Evidence |
|---|---|---|
| `latitude` | Orphaned vertical — no working feature reads or writes it. | `LocationDetector` component defined at `client/src/components/user/location-detector.tsx` but never imported anywhere; `isUserEligibleForPoll()` in the old `server/utils/location-validator.ts` was exported but never called — geofencing had **zero server-side enforcement**. |
| `longitude` | Same as above. | Same. |
| `location_confirmed` | Same. | Same. |
| `location_verified` | Same. | Same. |
| `govgr_dob` | Only consumers were the profile-page display block; no age gate, no eligibility logic, no audit trail uses DOB. | Pre-drop refs: `client/src/pages/profile-page.tsx:159-164` (decorative), `server/auth.ts:51` (session serialization), `server/routers/users.ts:124` (write-only on verify). All removed. |
| `govgr_place_of_birth` | Decorative-only and high-sensitivity — known proxy for ethnic origin (Art. 9 adjacency). | Pre-drop refs: `client/src/pages/profile-page.tsx:165-170`, `server/auth.ts:52`, `server/routers/users.ts:125`, `ballot_service/validator.py:485-487`. All removed. |

### Also removed (code/feature deletions, no data implications)

- `server/utils/location-validator.ts` — entirely dead, deleted.
- `client/src/components/user/location-detector.tsx` — orphaned, deleted.
- `server/storage/users.ts` — `updateUserLocation`, `verifyUserLocation` methods removed.
- `server/storage/types.ts` / `server/storage/legacy.ts` — corresponding interface entries and wrappers removed.
- `server/routers/users.ts` — `PATCH /api/user/verify-location` and `PATCH /api/user/location` routes removed.
- `server/auth.ts` — dropped fields removed from `sanitizeUser` and the demo-mode user.
- `client/src/pages/profile-page.tsx` — DOB / place-of-birth display blocks removed, dead "Participation Settings" card (which only contained a no-op "Update Location" button) removed.
- `ballot_service/validator.py` — stopped extracting `date_of_birth` and `place_of_birth` from the Solemn Declaration PDF text. Comment added citing the migration.
- `shared/schema.ts` — `SafeUser` type narrowed to match.

**Typecheck:** `npm run check` passes clean post-drop.

---

## 2. Kept — with Art. 6(1)(f) legitimate-interest justification

These columns survive because they are load-bearing for a real, code-verifiable feature. The DPIA must list each one under processing activity "Account integrity / fraud prevention," lawful basis Art. 6(1)(f), purpose narrowly scoped to abuse defense.

| Column | Working feature that consumes it | Code citation |
|---|---|---|
| `users.device_fingerprint` | Duplicate-account check on signup. | `server/auth.ts:285-286` — `storage.checkDuplicateAccounts(deviceFingerprint, clientIp)` |
| `users.registration_ip` | Same duplicate-account check; admin-panel display. | `server/auth.ts:285,306`; `client/src/pages/admin-accounts.tsx:194,210` |
| `users.last_login_ip` | Login activity audit; admin-panel display. | `server/auth.ts:368` (`updateUserLoginInfo`); `client/src/pages/admin-accounts.tsx:195,213` |
| `users.account_status` | Ban enforcement at login. | `server/auth.ts:361` — `if (user.accountStatus === 'banned')` |
| `users.account_flags` | Reserved for admin moderation actions (`jsonb`). | `client/src/pages/admin-accounts.tsx` reads them for the admin view. |

**Required follow-ups for these fields:**
- DPIA must document the retention period for each (currently unbounded — propose 12 months for IP rows after the related activity).
- Internal Policies must record who in the AMKE can read the admin-accounts view (RBAC: `isAdmin` flag — verify the admin set is small and named).
- Consent / Privacy Notice must disclose these to members at sign-up.

---

## 3. Kept (lower confidence) — verify product fit before next compliance review

| Column | Status | Question for the controller |
|---|---|---|
| `users.govgr_municipality` | Currently decorative-only (profile display). | Will a future feature use it (e.g., per-municipality scope of votes)? If no, drop in the next pass. |
| `users.govgr_postcode` | Same. | Same. |

If you confirm no near-term feature plan, drop these too — same Art. 5(1)(c) reasoning. Trivial follow-up migration.

---

## 4. Open architectural decisions (NOT auto-dropped)

These need a controller decision before action. Each maps to a brief-listed remediation task.

### 4.1 `electionguard` voting backend — recommend hard-gate or remove

- The backend is self-labeled "DEVELOPMENT-ONLY, NOT FOR BINDING ELECTIONS" (`server/voting/electionguard-backend.ts:10-19`).
- Its mere presence implies a privacy property the code does not deliver (host has guardian secrets; server encrypts → host sees plaintext).
- Per the §1 audit ([`01_VOTE_LINKAGE_AUDIT.md`](01_VOTE_LINKAGE_AUDIT.md)), binding votes cannot run on this stack regardless of which backend is selected.
- **Options:** (a) remove the backend until SDK Phase 6+7 ship + ballot-schema refactor is done; (b) hard-gate `VOTING_BACKEND=electionguard` to throw when `NODE_ENV === 'production'`. Recommend (b) — keeps the dev/demo path alive without misleading production behaviour.

### 4.2 LLM quality gate — confirmed external API

- `server/utils/llm-validation.ts:25-26` — default endpoint is **`https://openrouter.ai/api/v1`**, default model `nvidia/nemotron-3-nano-30b-a3b:free`.
- `server/utils/ai-merger.ts` — same external transport (`node-fetch`).
- **Data flow:** proposal text (which may contain political opinions of identifiable members) is sent to OpenRouter, which routes to NVIDIA-hosted inference. This is the system's largest external Art. 9 disclosure.
- **Options:**
  1. Swap to a local model (Ollama / llama.cpp) — best privacy answer, real infra work.
  2. Remove the LLM gate entirely until a local option exists — simplest GDPR answer.
  3. Document OpenRouter as a processor in ROPA, sign a DPA, surface the disclosure to members in the consent text. Defensible but adds processor surface.
- Recommend (2) until a local model is wired — the quality gate is a nice-to-have, not load-bearing for democratic function.

### 4.3 Democracy Points economy — defer decision

- Per the `MEMORY.md` notes, this is the native Node economy (Python economy retired). It introduces an append-only points ledger that creates a fresh Art. 17 (right to erasure) tension orthogonal to the vote chain.
- Not auto-dropped: it has product value (incentive design) the controller may want to keep.
- DPIA must address the append-only-vs-erasure tension specifically for the points ledger (same answer space as for the vote chain: crypto-shred, pseudonymise-in-place, or documented lawful refusal).

### 4.4 Wider poll-geofencing surface — recommend follow-up drop

- Removed: user-side GPS columns + the dead `isUserEligibleForPoll` enforcement path.
- Still present in `polls`: `locationScope`, `centerLat`, `centerLng`, `radiusKm`, `city`, `region`, `country`, `locationCity*`, `locationRegion*`, `locationCountry*` columns + client-side filters in `client/src/lib/geofencing.ts` and `client/src/lib/dynamic-locations.ts`.
- Since server enforcement is gone, the remaining surface is **display/filtering theatre** — a poll labeled "geofenced" doesn't actually exclude anyone.
- Next pass: either reintroduce real server-side eligibility (and re-add minimal user location with explicit consent), or drop the rest of the geofencing columns and client code. Recommend the latter for the closed ≤1000-member instance.

---

## 5. Acceptance criteria for this audit

- [x] Every dropped field had its usage greppped before deletion.
- [x] Every retained field has a cited working feature.
- [x] `npm run check` (TypeScript) passes after drops.
- [x] Migration 0014 added, schema updated, server + client + Python all consistent.
- [x] Brief's open-task #4 (AFM salt) and #6 (consent logging) still pending — separate audits.
- [ ] Controller confirms or overrides the three open architectural decisions (§4.1–4.3).
- [ ] Wider poll-geofencing decision (§4.4) — drop or rebuild with consent.
