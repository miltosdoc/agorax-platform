# §1 Vote-Linkage Audit — Findings

**Status:** Resolved to **Option B (pseudonymity, honestly labelled) with a hard gate against binding votes**.
**Date:** 2026-05-25
**Auditor:** Hermes (per `GDPR_FORMALIZATION_BRIEF.md` §1)
**Scope:** What can the host actually reconstruct about "member X cast vote Y on proposal Z" in the current code?

---

## TL;DR

In every shipping configuration today, the host can reconstruct the (member → choice → proposal) tuple. Therefore:

1. **Binding votes must not run on the current stack.** This is a hard gate, not a soft preference.
2. **The DPIA must describe ballots as pseudonymous, not anonymous**, list the re-link paths plainly, and record an explicit residual-risk acceptance.
3. **Option A (architectural fix) is a multi-phase project**, not a config flip — even after the planned SDK Phase 6 ships, the current schema still binds `user_id` directly to each ballot row.

---

## Evidence

### Default backend is `hash-chain` (cleartext votes)

- `server/voting/index.ts:25` — `const name = (process.env.VOTING_BACKEND ?? 'hash-chain') as BackendName;`
- `server/voting/hash-chain-backend.ts:9-15` — the backend's own docstring is explicit: it does **not** "Hide individual votes (votes are stored in cleartext in the DB)," **not** defend against host-side ballot stuffing, and **not** defend against the server rewriting the chain.
- `migrations/0010_vote_hash_chain.sql:48-54` — the row hash is computed over `user_id::text || choice` (among other fields). Identity is not just stored beside the vote; it is *bound into* the integrity proof. Removing it after the fact breaks every chain.
- `server/voting/hash-chain-backend.ts:118-140` — `getVoterView` reads `proposal_votes.choice` directly by `userId`. Any operator with DB read can run the same query.

### `electionguard` backend also leaks plaintext to the host

- `server/voting/electionguard-backend.ts:10-19` — the backend's own docstring labels it **"DEVELOPMENT-ONLY, NOT FOR BINDING ELECTIONS"** for two reasons:
  1. *"Ballots are encrypted on the server — the host briefly sees the plaintext choice."* (line 13-14)
  2. *"The guardian secret key shares are stored server-side, in `eg_elections.dev_guardian_secrets`. With the shares on the server the host can decrypt at will."* (line 16-19)
- `server/voting/electionguard-backend.ts:63-70` — defaults: `EG_GUARDIANS=1`, `EG_THRESHOLD=1`. 1-of-1 = no trust separation.
- `migrations/0011_electionguard_voting.sql:32-41` — `eg_ballots` has `user_id integer NOT NULL REFERENCES users(id)`. **Even after Phase 6 (browser-side encryption) ships, this column still links a verified identity to each ciphertext row.**
- `migrations/0011_electionguard_voting.sql:6-12` — the migration is honest: "Real vote privacy needs client-side encryption and off-server trustees."
- `docs/VERIFIABLE_VOTING_SDK_PLAN.md:208-211` — Phase 6 is explicitly *"the phase where the privacy property becomes real — before this, encryption is server-side and the host can still see votes."*
- `docs/VERIFIABLE_VOTING_SDK_PLAN.md:222-225` (Privacy Checklist) requires: *"Voter roll stored separately from the ballot list; no identity stored beside a ciphertext; no ordering or timestamp that lets ballots be correlated to voters."* — the current `eg_ballots` schema fails this requirement even with future SDK phases.

### Identity surface joined to the ballot

`shared/schema.ts:7-50` — the `users` row joined by `user_id` carries:

- `name`, `email`, `username` (NOT NULL)
- `latitude`, `longitude`, `registrationIp`, `lastLoginIp`, `deviceFingerprint`
- Gov.gr verification block: `govgrFirstName`, `govgrLastName`, `govgrDob`, `govgrPlaceOfBirth`, `govgrMunicipality`, `govgrPostcode`, `govgrVoterHash` (salted AFM hash)

A single SQL join (`proposal_votes` ⋈ `users`, or `eg_ballots` ⋈ `eg_elections` ⋈ `users`) reconstructs a verified-real-name → choice → proposal record. No additional access is required — only DB read.

---

## Why Option A is not achievable today

Option A (unlinkable ballots at rest) requires **all** of the following, none of which are shipped:

1. **SDK Phase 6** — browser-side encryption. Not built (`docs/VERIFIABLE_VOTING_SDK_PLAN.md:208`).
2. **SDK Phase 7** — voter-side signatures (`castSignedBallot.signature` currently accepted-and-ignored in both backends — `hash-chain-backend.ts:46-49`, `electionguard-backend.ts:170-172`).
3. **Off-server independent guardians**, threshold ≥ 2-of-3, with shares not stored on the host. Currently shares live in `eg_elections.dev_guardian_secrets` (migration `0011:23`).
4. **Schema change**: drop `user_id` from the ballot row, replace with a per-election unlinkable token (blind-signature / anonymous credential / mix-net pseudonym). Not in the SDK plan as written — the plan even reserves `castSignedBallot` to *bind* device identity to ballots, which is the opposite direction. This is the largest missing piece.

Items 1-3 are scoped in `VERIFIABLE_VOTING_SDK_PLAN.md`. Item 4 is **new scope** not currently in any plan. Without it, the privacy checklist line "no identity stored beside a ciphertext" cannot be met regardless of how good the crypto becomes.

Realistic timeline: months of engineering plus independent cryptographer review (a hard gate per the SDK plan §10). Not deliverable on the schedule for any current proposal.

---

## Option B — what the DPIA must say

Per `GDPR_FORMALIZATION_BRIEF.md` §1B, the DPIA must record the following verbatim or equivalent:

> **Ballot pseudonymity, not anonymity.** AgoraX ballots are pseudonymous: each ballot row carries a direct foreign key to the verified member who cast it. Combined with the identity record (Gov.gr verified name, DOB, place of birth, residence, salted AFM hash), the (member → choice → proposal) linkage is reconstructable by anyone with database read access. This is processing of Article 9 special-category data (political opinions of identifiable persons) and is recorded as a known residual risk.
>
> **Re-link paths in this deployment:**
> - Direct SQL join: `proposal_votes.user_id → users.id` (default `hash-chain` backend).
> - Direct SQL join: `eg_ballots.user_id → eg_elections → users` (`electionguard` backend; ciphertext does not protect against linkage, only against choice disclosure on read).
> - Postgres statement logs (if enabled) capture `INSERT INTO proposal_votes (...)` rows verbatim.
> - Application server logs, if configured to capture request bodies on `POST /api/proposals/:id/vote`.
> - Reverse-proxy / load-balancer access logs (per-request timing enables traffic analysis even against future ciphertext).
> - Database backups carry the same linkage.
>
> **Compensating controls (each must be verified in code before being cited in the DPIA):**
> - RBAC on database access (verify in `server/db.ts` and infra config).
> - Encryption at rest on the database volume (verify in deployment config — not in repo).
> - No request-body logging on vote routes (verify in `server/routes/` and middleware).
> - Audit log of admin actions (verify schema and write paths).
> - Append-only ledger gives tamper-evidence for after-the-fact rewrites of *which* vote a member cast.
>
> **Risk acceptance:** the controller (AMKE "Restart Democracy") accepts this residual risk for non-binding, consultative voting in the closed-member instance, on the basis of explicit Article 9(2)(a) consent at onboarding plus Article 9(2)(d) association-processing carve-out. **Binding ratification votes do not run on this stack** until Option A is delivered and reviewed.

---

## Acceptance gate before any binding vote

The following must all be true before a vote on this platform can be described as "binding" or "secret":

- [ ] SDK Phase 6 shipped (browser-side encryption) and audited.
- [ ] SDK Phase 7 shipped (voter signatures verified).
- [ ] ≥3 independent off-server guardians, threshold ≥2; `dev_guardian_secrets` removed in production.
- [ ] Ballot schema refactor — no direct FK from ballot to user; voter roll separated from ballot list per `VERIFIABLE_VOTING_SDK_PLAN.md:223`.
- [ ] No request-body or DB-statement logging on vote paths (verified in code + infra).
- [ ] Independent cryptographer review (per SDK plan §10).
- [ ] Release labels removed from "not for binding elections" only after the above.

Until then: votes are **consultative**, consent text says so, and UI surfaces this honestly.

---

## Downstream impact on other compliance tasks

- **DPIA** — the Risk Assessment and Mitigations sections must use the language above; the Residual Risk section records the controller sign-off.
- **Privacy Notice + Consent** — must distinguish consultative voting from binding voting and obtain explicit Art. 9(2)(a) consent for processing political opinions in pseudonymous (not anonymous) form.
- **ROPA** — list `proposal_votes` and `eg_ballots` as Art. 9 special-category processing.
- **Internal Policies — Retention/Deletion** — feeds directly into the right-to-erasure tension (Task #7 in the README). Crypto-shredding the user row while keeping `proposal_votes.user_id` orphaned is one viable design; document it there.
- **README** — Open Task #1 marked resolved; binding-vote gate added.
