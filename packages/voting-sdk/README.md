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

## Status — Phase 0 (scaffold)

| Phase | Scope | State |
|-------|-------|-------|
| 0 | Workspace package, EG 2.1 group params, conformance harness | ✅ this PR |
| 1 | ElGamal + Chaum-Pedersen + disjunctive proofs + Fiat-Shamir | — |
| 2 | Ballot encode/decode, homomorphic tally, single-guardian decrypt | — |
| 3 | Pedersen VSS key ceremony, threshold decryption | — |
| 4 | Independent public verifier | — |
| 5 | AgoraX `ElectionGuardBackend` (`VotingBackend`) | — |
| 6 | Browser-side encryption (privacy becomes real here) | — |
| 7 | Mobile signing surface | — |

Phase 0 exposes the ElectionGuard 2.1 standard 4096-bit group and a
conformance test-vector harness. The group's `p`, `q`, `g`, `r` constants are
checked at test time against the algebraic relations that uniquely pin them
(`p = q·r + 1`, `g^q mod p = 1`), so any transcription error fails CI.

## Layout

```
src/
  constants.ts   — EG 2.1 standard 4096-bit p/q/g/r (hex, spec-formatted)
  group.ts       — group params, ElementModP/ElementModQ types, modular helpers
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
