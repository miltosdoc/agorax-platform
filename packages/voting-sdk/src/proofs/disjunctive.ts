/**
 * Disjunctive Chaum-Pedersen proof — ballot validity.
 *
 * Proves that an ElGamal ciphertext `(α, β)` encrypts **0 or 1** — and
 * nothing else — without revealing which. This is what stops a voter (or a
 * compromised client) from casting an overvote, a negative vote, or a
 * ballot-stuffing value like 1000.
 *
 * It is an OR-composition of two Chaum-Pedersen proofs. Recall an encryption
 * of `σ` is `α = g^ξ`, `β = K^(σ+ξ)`. For the claim "σ = j", define
 * `βʹⱼ = β · K^(−j)`; then "σ = j" holds iff `(g, K, α, βʹⱼ)` is a DH tuple
 * with witness `ξ`. The prover runs the *real* branch (`j = σ`) honestly and
 * *simulates* the other — choosing its challenge and response first and
 * back-solving its commitments. A single Fiat-Shamir challenge `c` ties them
 * together: the prover may freely pick the fake branch's challenge `c_f`, but
 * the real branch's is forced to `c − c_f`, so it can only complete the
 * branch for which it actually knows `ξ`.
 *
 * The proof is compact: just the two (challenge, response) pairs. The
 * verifier recomputes all four commitments and checks `c₀ + c₁ = H(…)`.
 */

import {
  addModQ,
  gPowP,
  invModP,
  isElementModP,
  multModP,
  multModQ,
  powModP,
  subModQ,
} from '../group.ts';
import type { ElementModP, ElementModQ } from '../group.ts';
import type { Ciphertext } from '../elgamal.ts';
import { randomModQ } from '../random.ts';
import { fiatShamirChallenge } from './fiat-shamir.ts';

const LABEL = 'disjunctive-zero-or-one';

/**
 * A ballot-validity proof. The branches are indexed by the claimed
 * plaintext: branch 0 is "encrypts 0", branch 1 is "encrypts 1".
 */
export interface DisjunctiveProof {
  /** Challenge of the "encrypts 0" branch. */
  challenge0: ElementModQ;
  /** Response of the "encrypts 0" branch. */
  response0: ElementModQ;
  /** Challenge of the "encrypts 1" branch. */
  challenge1: ElementModQ;
  /** Response of the "encrypts 1" branch. */
  response1: ElementModQ;
}

/** `βʹⱼ = β · K^(−j)` for j ∈ {0, 1}. */
function betaPrimes(
  ciphertext: Ciphertext,
  publicKey: ElementModP,
): [ElementModP, ElementModP] {
  return [
    ciphertext.beta,
    multModP(ciphertext.beta, invModP(publicKey)),
  ];
}

/** The verification commitments `(a, b)` for branch `j` from `(cⱼ, vⱼ)`. */
function branchCommitments(
  ciphertext: Ciphertext,
  publicKey: ElementModP,
  betaPrimeJ: ElementModP,
  challengeJ: ElementModQ,
  responseJ: ElementModQ,
): { a: ElementModP; b: ElementModP } {
  // a = g^v · α^(-c)
  const a = multModP(
    gPowP(responseJ),
    invModP(powModP(ciphertext.alpha, challengeJ)),
  );
  // b = K^v · βʹ^(-c)
  const b = multModP(
    powModP(publicKey, responseJ),
    invModP(powModP(betaPrimeJ, challengeJ)),
  );
  return { a, b };
}

function challengeFor(
  ciphertext: Ciphertext,
  publicKey: ElementModP,
  commitments: { a: ElementModP; b: ElementModP }[],
  context: bigint[],
): ElementModQ {
  return fiatShamirChallenge(LABEL, [
    ...context,
    publicKey,
    ciphertext.alpha,
    ciphertext.beta,
    commitments[0].a,
    commitments[0].b,
    commitments[1].a,
    commitments[1].b,
  ]);
}

/**
 * Build a ballot-validity proof.
 *
 * @param ciphertext  The encryption `(α, β)`.
 * @param nonce       The nonce `ξ` used to produce it (the witness).
 * @param plaintext   The true plaintext — must be 0 or 1.
 * @param publicKey   The election public key `K`.
 * @param context     Values bound into the challenge (election/contest ids).
 */
export function proveZeroOrOne(
  ciphertext: Ciphertext,
  nonce: ElementModQ,
  plaintext: 0 | 1,
  publicKey: ElementModP,
  context: bigint[] = [],
): DisjunctiveProof {
  const real = plaintext;
  const fake = (1 - plaintext) as 0 | 1;
  const bp = betaPrimes(ciphertext, publicKey);

  // Real branch: an honest commitment with a fresh exponent.
  const u = randomModQ();
  const realCommit = { a: gPowP(u), b: powModP(publicKey, u) };

  // Fake branch: pick challenge + response first, back-solve the commitment.
  const fakeChallenge = randomModQ();
  const fakeResponse = randomModQ();
  const fakeCommit = branchCommitments(
    ciphertext,
    publicKey,
    bp[fake],
    fakeChallenge,
    fakeResponse,
  );

  const commits: { a: ElementModP; b: ElementModP }[] = [];
  commits[real] = realCommit;
  commits[fake] = fakeCommit;

  // One Fiat-Shamir challenge ties the branches together.
  const c = challengeFor(ciphertext, publicKey, commits, context);

  // The real branch's challenge is whatever is left over.
  const realChallenge = subModQ(c, fakeChallenge);
  const realResponse = addModQ(u, multModQ(realChallenge, nonce));

  const challenges: ElementModQ[] = [];
  const responses: ElementModQ[] = [];
  challenges[real] = realChallenge;
  responses[real] = realResponse;
  challenges[fake] = fakeChallenge;
  responses[fake] = fakeResponse;

  return {
    challenge0: challenges[0],
    response0: responses[0],
    challenge1: challenges[1],
    response1: responses[1],
  };
}

/**
 * Verify a ballot-validity proof against a ciphertext and the election key.
 * Returns false for any malformed input rather than throwing.
 */
export function verifyZeroOrOne(
  ciphertext: Ciphertext,
  proof: DisjunctiveProof,
  publicKey: ElementModP,
  context: bigint[] = [],
): boolean {
  // Structural checks — α and β must be residues in (0, p).
  if (!isElementModP(ciphertext.alpha) || !isElementModP(ciphertext.beta)) {
    return false;
  }

  const bp = betaPrimes(ciphertext, publicKey);
  const commits = [
    branchCommitments(ciphertext, publicKey, bp[0], proof.challenge0, proof.response0),
    branchCommitments(ciphertext, publicKey, bp[1], proof.challenge1, proof.response1),
  ];

  const c = challengeFor(ciphertext, publicKey, commits, context);
  // The two branch challenges must sum to the Fiat-Shamir challenge.
  return addModQ(proof.challenge0, proof.challenge1) === c;
}
