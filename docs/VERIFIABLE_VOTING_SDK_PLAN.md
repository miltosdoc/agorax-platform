# Verifiable Voting SDK — Build Plan

**Status:** Planning. No implementation code exists yet. This document is the
complete brief for the implementation session. A new session should be able to
start from here with no other context.

**Last updated:** 2026-05-16

---

## 1. Context & Motivation

AgoraX already has a tamper-evident hash chain on `proposal_votes` (migration
`0010_vote_hash_chain.sql`). It provides **integrity**: the vote table is
append-only and any post-hoc edit breaks a per-proposal SHA-256 chain, detectable
via `GET /api/proposals/:id/election/verify`.

It does **not** provide **privacy**: votes are stored in cleartext. The host can
read every individual vote.

The goal of this project is binding ratification votes that are **end-to-end
verifiable AND private**:

- ballots encrypted on the voter's device,
- a homomorphic tally (only the aggregate is ever decrypted, never an individual
  ballot),
- threshold trustee decryption (no single party — including the host — can
  decrypt),
- a public verifier anyone can run to confirm the announced tally.

### The integrity / privacy distinction (important — do not lose this)

- **Integrity** is *verifiable*. ZK proofs + a public verifier let anyone confirm
  the announced tally is honest. A miscount or a cheating server is caught.
- **Privacy** is *not verifiable after the fact*. There is no function that
  confirms "the server never saw how Maria voted." A privacy failure — weak RNG,
  server-side plaintext logging, a metadata leak — is silent: the tally still
  verifies, every trustee still signs off, the verifier still says OK.

This is why privacy must be engineered deliberately across crypto, architecture,
ops, and governance — and reviewed — rather than assumed.

---

## 2. The Decision

Build an in-house TypeScript SDK — working name **`@agorax/voting`** — that
implements the verifiable-voting protocol of the Helios / ElectionGuard family.

Three non-negotiable constraints:

1. **Implement a published spec; do not invent a protocol.** Target the
   **ElectionGuard 2.1 specification** (published, versioned, August 2024). A
   spec-conforming implementation can be checked against published test vectors
   and other implementations. "We invented our own scheme" cannot be checked
   against anything. (The Helios paper is a fine conceptual basis, but it is a
   paper, not a machine-checkable spec — use ElectionGuard 2.1 as the
   implementation target. Same crypto family.)

2. **Build on audited primitives.** Use `@noble/curves` and `@noble/hashes`
   (actively maintained, independently audited) for all elliptic-curve and hash
   math. The SDK implements only the *protocol layer* — encoding, ZK proofs,
   Fiat-Shamir, tally aggregation, threshold combination. The SDK must never
   implement raw curve arithmetic or hash functions itself.

3. **Prove it inside AgoraX before publishing.** Develop as a workspace package
   inside the AgoraX repo. AgoraX is the first consumer, via the existing
   `VotingBackend` interface. Extract to its own repo and publish to npm only
   *after* it is proven in AgoraX **and** has had an independent cryptographer
   review.

### Why not the alternatives

- **electionguard-python:** bitrotted. Installs from PyPI but fails to import on
  Python 3.11 (a dataclass pattern modern Python rejects). Last release October
  2022. Using it would mean pinning Python 3.9 or maintaining a fork of an
  unmaintained crypto library.
- **Belenios:** actively maintained and credible (INRIA), but designed as a
  complete voting platform, not an embeddable SDK. Integrating it forces a UX
  seam — voters redirected to a Belenios-branded voting page.
- **Helios as a Python sidecar:** same embeddability problem as Belenios.
- **In-house TS SDK on audited primitives, conforming to a published spec:**
  most maintainable, stays in one stack, no sidecar, and fills a real gap — there
  is currently no good modern, maintained, embeddable TypeScript verifiable-voting
  library. This is the chosen path.

---

## 3. Architecture & Responsibility Split

The SDK is **not** "integrity" and the platform **not** "privacy". Both
properties have an SDK part and a platform part. The real split is **verifiable
crypto core (SDK)** vs **correct deployment + governance (platform)**.

| Concern | Owner |
|---|---|
| Tally is honest — no miscount by the host | **SDK** — ZK proofs + verifier |
| Each ballot is well-formed — no overvote / negative vote by a user | **SDK** — ballot-validity proof |
| ElGamal encryption + the randomness it uses (privacy *core*) | **SDK** |
| Public verifier anyone can re-run | **SDK** |
| Encryption runs on the device; server never sees plaintext | **Platform / mobile app** |
| No plaintext or metadata leaks — logs, APM, Sentry, timing | **Platform** (ops) |
| Voter roll kept unlinkable from the ballot list | **Platform** |
| One person, one vote / who is eligible | **Platform** — voter roll → Gov.gr |
| Trustees are real and genuinely independent | **Governance** |
| Trust in the client code itself | **Mobile app** (strongest), platform |

**One-liner for the brief:**

> The SDK is the verifiable cryptographic core — tally integrity, ballot
> validity, and the encryption primitive. The platform owns deploying that core
> correctly (client-side encryption, no metadata leaks, real trustees) and
> everything crypto can't touch (who's eligible to vote, and trust in the client
> code).

---

## 4. What the SDK Implements (protocol elements)

- **ElGamal encryption** over the ElectionGuard 2.1 group.
- **Disjunctive Chaum-Pedersen ZK proofs** of ballot validity — each selection
  encrypts 0 or 1, and each contest sums to the allowed number of selections.
- **Fiat-Shamir transform** to make the proofs non-interactive (with correct
  domain separation — a known footgun).
- **Homomorphic tally aggregation** — multiply ciphertexts so only the aggregate
  is decrypted; individual ballots are never decrypted.
- **Threshold key ceremony** — Pedersen verifiable secret sharing, producing
  t-of-n guardian key shares.
- **Threshold decryption** — partial decryptions combined under the threshold,
  each with a Chaum-Pedersen proof of correct partial decryption.
- **Verifier** — re-checks every ballot proof, the homomorphic aggregation, and
  every decryption proof from public data alone.

---

## 5. Non-goals (the SDK explicitly does NOT do these)

- **Eligibility / one-person-one-vote.** The SDK ensures each ballot is
  *well-formed*; it does not ensure each ballot came from a distinct eligible
  human. Double-voting and fake voters are a platform concern (voter roll →
  Gov.gr identity verification). This is the Sybil problem — crypto never solves
  it.
- **Coercion-resistance / receipt-freeness.** A voter can prove how they voted
  to a third party. Helios and ElectionGuard do not provide this either; solving
  it is research-grade (Civitas, Belenios-RF). Stated non-goal.
- **Client-code delivery trust.** In a browser, the server ships the very code
  meant to protect the voter from the server. Mitigations are partial; the mobile
  app is the real answer. Platform concern.
- **Metadata-leak prevention.** Logs, APM, timing correlation. Platform ops
  concern.

---

## 6. Package Structure

```
packages/voting-sdk/
  package.json          — name @agorax/voting, deps: @noble/curves, @noble/hashes
  src/
    group.ts            — ElectionGuard 2.1 group params + element types (wraps @noble)
    elgamal.ts          — ElGamal encrypt / decrypt
    proofs/
      fiat-shamir.ts    — non-interactive challenge derivation (domain-separated)
      chaum-pedersen.ts — equality-of-discrete-logs proof
      disjunctive.ts    — ballot-validity (encrypts 0 or 1) proof
    ballot.ts           — plaintext / ciphertext ballot encode + decode
    manifest.ts         — election manifest type (contests, selections, styles)
    tally.ts            — homomorphic aggregation
    keyceremony.ts      — Pedersen VSS, guardian share generation + verification
    decryption.ts       — partial decryption + threshold combination
    verifier.ts         — independent re-verification of a full election record
    index.ts            — public API surface
  test/
    vectors/            — ElectionGuard 2.1 conformance test vectors
    *.test.ts
  README.md
```

The AgoraX integration is a new backend:

```
server/voting/electionguard-backend.ts   — implements VotingBackend using @agorax/voting
```

registered in `server/voting/index.ts` (replace the reserved `helios` slot with
`electionguard`).

---

## 7. Build Phases

Each phase is its own PR with its own tests. Do not collapse them.

- **Phase 0 — Scaffold.** Workspace package, `@noble` deps, ElectionGuard 2.1
  group parameters, a conformance test-vector harness wired to CI.
- **Phase 1 — Encryption + proofs.** ElGamal encrypt/decrypt, Chaum-Pedersen,
  disjunctive proofs, Fiat-Shamir. Must pass ElectionGuard 2.1 test vectors.
- **Phase 2 — Ballots + tally.** Plaintext/ciphertext ballot encode/decode,
  homomorphic aggregation, single-guardian decryption.
- **Phase 3 — Threshold.** Pedersen VSS key ceremony, N-of-M guardians,
  threshold decryption with partial-decryption proofs.
- **Phase 4 — Verifier.** Independent re-verification of a complete election
  record from public data only.
- **Phase 5 — AgoraX integration.** `ElectionGuardBackend` implementing
  `VotingBackend`. Election lifecycle wiring: proposal → `voting` state starts an
  election; `/finalize` closes and decrypts. Postgres schema for elections,
  encrypted ballots, election records.
- **Phase 6 — Browser-side encryption.** The voting UI fetches the election
  public key, encrypts locally, posts ciphertext + ZK proof. **This is the phase
  where the privacy property becomes real** — before this, encryption is
  server-side and the host can still see votes.
- **Phase 7 — Mobile signing surface.** The `signature` parameter on
  `castSignedBallot` is verified. Mobile app holds a device key; the server
  cannot forge ballots.

---

## 8. Privacy Checklist (all must hold before any binding vote)

- [ ] Encryption runs client-side (browser, later mobile app) — server never
      receives plaintext.
- [ ] `crypto.getRandomValues` only; a fresh random nonce per encryption; never
      reuse a nonce; never `Math.random`.
- [ ] Voter roll stored separately from the ballot list; no identity stored
      beside a ciphertext; no ordering or timestamp that lets ballots be
      correlated to voters.
- [ ] No request-body logging on vote routes; APM / Sentry body capture disabled
      for those routes; DB statement logging off for ballot inserts.
- [ ] At least 3 genuinely independent trustees. Single-guardian mode is
      development-only and must be blocked by production config.
- [ ] TLS everywhere; no plaintext in load-balancer or reverse-proxy logs.
- [ ] Independent cryptographer review of the encryption and proof code
      **before** any binding election.
- [ ] Every release before that review is labeled "not for binding elections".

---

## 9. Current Repo State (the starting point)

- **HEAD when this plan was written:** commit `4f5ffc3`
  (`feat(voting): extract VotingBackend abstraction`).
- `server/voting/types.ts` — the `VotingBackend` interface:
  `startElection`, `castSignedBallot`, `getTally`, `closeAndTally`, `getProof`,
  `verify`. Already designed to accept this work. `castSignedBallot` already
  takes an optional `BallotSignature` for the future mobile-signing path.
- `server/voting/hash-chain-backend.ts` — the current default backend
  (tamper-evident hash chain). Stays as the dev / fallback backend.
- `server/voting/index.ts` — `getVotingBackend()` factory, selected by the
  `VOTING_BACKEND` env var. A `helios` slot is reserved and currently throws
  Not Implemented — rename it to `electionguard` and implement it in Phase 5.
- `proposal_votes` table + migration `0010_vote_hash_chain.sql` — the hash
  chain. Unaffected by this work.
- Live endpoints (backend-agnostic, no route changes needed):
  - `POST /api/proposals/:id/vote`
  - `GET  /api/proposals/:id/election/proof`
  - `GET  /api/proposals/:id/election/verify`
- The SDK plugs in as a new `VotingBackend`. The AgoraX route layer does not
  change.

---

## 10. Honest Risks

- **This is starting a project, not shipping a feature.** A maintained crypto
  SDK is an indefinite commitment — or it becomes the next bitrotted library.
- **Rolling protocol code, even from a spec, has footguns.** Disjunctive proofs,
  Fiat-Shamir domain separation, and VSS each have known failure modes.
  Conformance vectors catch much but not everything.
- **The SDK is necessary but not sufficient for privacy.** Deployment and
  governance own the rest (see the responsibility split).
- **Independent cryptographer review is a hard gate** before any binding
  election. "Read carefully" is not "audited."
- **Client-code trust is unsolved in-browser.** The mobile app is the real
  mitigation; treat the browser version as strong-but-imperfect until then.

---

## 11. Open Questions (resolve with product / governance, not in code)

- **Who are the trustees?** Real, independent organizations — e.g. civil-society
  groups, Greek academic institutions, or sortition-selected bodies. Threshold
  decryption is theatre without them.
- **Where is the public audit bundle pinned?** A static site, OpenTimestamps,
  IPFS — somewhere the host does not control, so the record cannot be silently
  rewritten.
- **Confirm the ElectionGuard 2.1 group parameters** to implement against.
- **Does the hash-chain backend stay** as a selectable development backend, or
  get removed once the ElectionGuard backend ships? (Recommendation: keep it as
  the dev/test backend — fast, no trustees needed.)
