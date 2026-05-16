# @agorax/voting

Verifiable, private voting SDK for AgoraX — an in-house TypeScript implementation
of the **ElectionGuard 2.1** cryptographic protocol layer.

> ⚠️ **Not for binding elections.** Every release before an independent
> cryptographer review is explicitly labelled not for binding use. See the
> privacy checklist in [`docs/VERIFIABLE_VOTING_SDK_PLAN.md`](../../docs/VERIFIABLE_VOTING_SDK_PLAN.md).

## What this is

The SDK is the **verifiable cryptographic core** of an end-to-end verifiable,
private ratification vote: ElGamal encryption, disjunctive Chaum-Pedersen
ballot-validity proofs, a homomorphic tally, a threshold key ceremony /
decryption, and a public verifier. It implements the *protocol layer* only —
all elliptic-curve/field and hash math comes from the audited `@noble/curves`
and `@noble/hashes` packages.

It deliberately does **not** own eligibility (one-person-one-vote),
coercion-resistance, client-code delivery trust, or metadata-leak prevention —
those are platform and governance concerns. See section 3 of the plan.

## Status — Phase 4 (public verifier)

| Phase | Scope | State |
|-------|-------|-------|
| 0 | Workspace package, EG 2.1 group params, conformance harness | ✅ |
| 1 | ElGamal + Chaum-Pedersen + disjunctive proofs + Fiat-Shamir | ✅ |
| 2 | Ballot encode/decode, homomorphic tally, single-guardian decrypt | ✅ |
| 3 | Pedersen VSS key ceremony, threshold decryption | ✅ |
| 4 | Independent public verifier | ✅ this PR |
| 5 | AgoraX `ElectionGuardBackend` (`VotingBackend`) | — |
| 6 | Browser-side encryption (privacy becomes real here) | — |
| 7 | Mobile signing surface | — |

Phase 0 exposes the ElectionGuard 2.1 standard 4096-bit group and a
conformance test-vector harness. The group's `p`, `q`, `g`, `r` constants are
checked against the algebraic relations that uniquely pin them
(`p = q·r + 1`, `g^q mod p = 1`), so any transcription error fails CI.

Phase 1 adds the cryptographic core: the EG hash `H` (HMAC-SHA-256, checked
against the reference known-answer vector), exponential ElGamal encryption
with its additive-homomorphic tally, and the zero-knowledge proofs — a
Chaum-Pedersen discrete-log-equality proof and the disjunctive zero-or-one
ballot-validity proof, both made non-interactive via Fiat-Shamir.

Phase 2 builds the election flow on top: an election manifest, ballot
encryption (each selection a proven 0/1, each contest proven to sum to its
selection limit), the homomorphic tally over many ballots, and single-guardian
decryption that recovers the counts with a verifiable proof. The end-to-end
test casts ten ballots and confirms the decrypted result and its proof.

Phase 3 removes the single point of trust: a Pedersen verifiable-secret-sharing
key ceremony produces a `t`-of-`n` guardian set with a joint public key whose
secret is never assembled. Each guardian partially decrypts the tally with a
proof; any `t` partials Lagrange-combine into the result. The test confirms
three different 3-guardian subsets (and the full 5) all decrypt identically,
and that a sub-threshold set cannot.

Phase 4 is the standalone verifier. `verifyElectionRecord` takes the complete
public bundle of an election — manifest, joint key, guardian commitments,
every encrypted ballot, the tally, the partial decryptions, the result — and
re-derives and re-checks all of it: ballot validity, that the tally is the
homomorphic aggregate of the ballots, and that the threshold decryption is
correct. A miscount, stuffed ballot, forged tally or cheating guardian fails
at least one named check.

**Conformance caveat:** Phase 1 proves *mathematical* soundness — honest
proofs verify, tampered proofs and out-of-range ballots are rejected. The
Fiat-Shamir encoding is sound but not yet byte-identical to EG 2.1's exact
`H_E`/domain-byte scheme; aligning it against the official EG 2.1 encryption
test vectors is tracked for a follow-up before any conformance claim.

## Layout

```
src/
  constants.ts   — EG 2.1 standard 4096-bit p/q/g/r (hex, spec-formatted)
  group.ts       — group params, ElementModP/ElementModQ types, modular helpers
  hash.ts        — EG hash H = HMAC-SHA-256, fixed-width byte encodings
  random.ts      — crypto.getRandomValues-backed scalars in Z_q
  elgamal.ts     — exponential ElGamal: keygen, encrypt, homomorphic add, decrypt
  proofs/
    fiat-shamir.ts    — non-interactive challenge derivation (domain-separated)
    chaum-pedersen.ts — discrete-log-equality proof
    disjunctive.ts    — zero-or-one ballot-validity proof
  manifest.ts    — election manifest (contests, selections, limits)
  ballot.ts      — plaintext/ciphertext ballots, encrypt + verify
  tally.ts       — homomorphic aggregation of encrypted ballots
  keyceremony.ts — Pedersen VSS key ceremony, t-of-n guardian shares
  decryption.ts  — single-guardian + threshold decryption, with proofs
  verifier.ts    — ElectionRecord + verifyElectionRecord (public verifier)
  index.ts       — public API surface
test/
  conformance.ts — JSON vector-file harness (loadVectorsByType)
  vectors/       — conformance vectors, grouped by type
  *.test.ts
```

## Develop

```sh
npm run check -w @agorax/voting   # typecheck
npm test  -w @agorax/voting       # vitest
```
