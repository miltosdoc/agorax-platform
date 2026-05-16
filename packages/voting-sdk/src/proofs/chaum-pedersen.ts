/**
 * Chaum-Pedersen proof of discrete-log equality.
 *
 * Proves knowledge of an exponent `ξ` such that `α = g^ξ` and `βʹ = Kʷ^ξ`
 * for a second base `K` — i.e. that `(g, K, α, βʹ)` is a Diffie-Hellman
 * tuple — without revealing `ξ`.
 *
 * This is the workhorse sigma-protocol of ElectionGuard: a ballot-validity
 * proof (Phase 1) is a disjunction of these, and a trustee's
 * partial-decryption proof (Phase 3) is a single one. It is made
 * non-interactive with the Fiat-Shamir transform.
 *
 * Sigma protocol:
 *   commit    u ← Z_q;  a = g^u,  b = K^u
 *   challenge c = H(label, context ‖ K ‖ α ‖ βʹ ‖ a ‖ b)
 *   respond   v = u + c·ξ  (mod q)
 *   verify    recompute a = g^v·α⁻ᶜ, b = K^v·βʹ⁻ᶜ, then check c is the hash.
 */

import {
  addModQ,
  gPowP,
  invModP,
  multModP,
  multModQ,
  powModP,
} from '../group.ts';
import type { ElementModP, ElementModQ } from '../group.ts';
import { randomModQ } from '../random.ts';
import { fiatShamirChallenge } from './fiat-shamir.ts';

const LABEL = 'chaum-pedersen-equality';

/** A non-interactive Chaum-Pedersen proof (challenge + response). */
export interface ChaumPedersenProof {
  /** Fiat-Shamir challenge `c`. */
  challenge: ElementModQ;
  /** Response `v = u + c·ξ mod q`. */
  response: ElementModQ;
}

/** The discrete-log-equality statement being proven. */
export interface EqualDlogStatement {
  /** Second base `K` (the first base is the group generator `g`). */
  baseK: ElementModP;
  /** `α = g^ξ`. */
  alpha: ElementModP;
  /** `βʹ = K^ξ`. */
  betaPrime: ElementModP;
  /** Extra values bound into the challenge (e.g. election/contest ids). */
  context?: bigint[];
}

/** Recompute the commitments `(a, b)` a verifier expects from `(c, v)`. */
function recomputeCommitments(
  stmt: EqualDlogStatement,
  challenge: ElementModQ,
  response: ElementModQ,
): { a: ElementModP; b: ElementModP } {
  // a = g^v · α^(-c)
  const a = multModP(
    gPowP(response),
    invModP(powModP(stmt.alpha, challenge)),
  );
  // b = K^v · βʹ^(-c)
  const b = multModP(
    powModP(stmt.baseK, response),
    invModP(powModP(stmt.betaPrime, challenge)),
  );
  return { a, b };
}

function challengeFor(
  stmt: EqualDlogStatement,
  a: ElementModP,
  b: ElementModP,
): ElementModQ {
  return fiatShamirChallenge(LABEL, [
    ...(stmt.context ?? []),
    stmt.baseK,
    stmt.alpha,
    stmt.betaPrime,
    a,
    b,
  ]);
}

/**
 * Prove `α = g^ξ ∧ βʹ = K^ξ`. The caller must supply the true witness `ξ`;
 * the produced proof reveals nothing about it.
 */
export function proveEqualDlog(
  exponent: ElementModQ,
  stmt: EqualDlogStatement,
): ChaumPedersenProof {
  const u = randomModQ();
  const a = gPowP(u);
  const b = powModP(stmt.baseK, u);
  const challenge = challengeFor(stmt, a, b);
  const response = addModQ(u, multModQ(challenge, exponent));
  return { challenge, response };
}

/** Verify a Chaum-Pedersen discrete-log-equality proof. */
export function verifyEqualDlog(
  proof: ChaumPedersenProof,
  stmt: EqualDlogStatement,
): boolean {
  const { a, b } = recomputeCommitments(stmt, proof.challenge, proof.response);
  return challengeFor(stmt, a, b) === proof.challenge;
}
