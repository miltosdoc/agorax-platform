/**
 * The threshold key ceremony — Pedersen verifiable secret sharing.
 *
 * No single party, the host included, should hold the election decryption
 * key. Instead `n` guardians jointly generate it so that any `t` of them can
 * decrypt and any `t − 1` learn nothing — a `t`-of-`n` threshold.
 *
 * Each guardian `i` picks a secret degree-`(t−1)` polynomial `Pᵢ` over Z_q.
 * Its constant term `Pᵢ(0)` is its private contribution; `g^{Pᵢ(0)}` is
 * public. The **joint public key** is `K = ∏ᵢ g^{Pᵢ(0)} = g^s` where the
 * joint secret `s = Σᵢ Pᵢ(0)` is never assembled anywhere.
 *
 * Guardian `i` hands every guardian `ℓ` the share `Pᵢ(ℓ)`, which `ℓ` checks
 * against `i`'s published coefficient commitments. Guardian `ℓ`'s share of
 * the joint secret is `z_ℓ = Σᵢ Pᵢ(ℓ)` — a point on the joint polynomial
 * `P = Σᵢ Pᵢ`, with `P(0) = s`. So the `{z_ℓ}` are a `t`-of-`n` Shamir
 * sharing of `s`, and `g^{z_ℓ}` is publicly derivable from the commitments.
 *
 * `runKeyCeremony` performs the whole ceremony in one process — convenient
 * for tests and a single-operator setup. A real deployment runs the exposed
 * building blocks (`generateGuardian`, `dealShare`, `verifyShare`, …) across
 * genuinely independent parties; the mathematics is identical.
 */

import {
  addModQ,
  gPowP,
  invModQ,
  multModP,
  multModQ,
  powModP,
} from './group.ts';
import type { ElementModP, ElementModQ } from './group.ts';
import { randomModQ, randomModQNonzero } from './random.ts';

/** A guardian's secret state — its polynomial. Never leaves the guardian. */
export interface Guardian {
  /** 1-based index; also the polynomial evaluation point. Never 0. */
  index: number;
  /** Polynomial coefficients `a₀ … a_{t−1}`; `a₀` is the secret contribution. */
  polynomial: ElementModQ[];
}

/** A guardian's public coefficient commitments — published to everyone. */
export interface GuardianCommitment {
  index: number;
  /** `g^{aⱼ}` for j = 0 … t−1. `commitments[0]` is this guardian's public key. */
  commitments: ElementModP[];
}

/** A guardian's share of the joint secret, after the ceremony. */
export interface GuardianShare {
  index: number;
  /** Secret share `z_ℓ = Σᵢ Pᵢ(ℓ)` — kept by guardian ℓ alone. */
  share: ElementModQ;
  /** Public commitment `g^{z_ℓ}` — derivable by anyone from the commitments. */
  publicCommitment: ElementModP;
}

/** The public + secret output of a completed key ceremony. */
export interface KeyCeremonyResult {
  /** Decryption threshold `t`. */
  threshold: number;
  /** Number of guardians `n`. */
  guardianCount: number;
  /** Joint election public key `K = g^s`. */
  jointPublicKey: ElementModP;
  /** Every guardian's public coefficient commitments. */
  guardianCommitments: GuardianCommitment[];
  /** Every guardian's secret share + public commitment. */
  guardianShares: GuardianShare[];
}

/** Evaluate a polynomial (given by its coefficients) at `x`, in Z_q. */
export function evaluatePolynomial(
  coefficients: ElementModQ[],
  x: bigint,
): ElementModQ {
  // Horner's method, low-to-high via a reversed fold.
  let acc = 0n as ElementModQ;
  for (let j = coefficients.length - 1; j >= 0; j--) {
    acc = addModQ(multModQ(acc, x), coefficients[j]);
  }
  return acc;
}

/** Create a guardian with a fresh random degree-`(threshold−1)` polynomial. */
export function generateGuardian(index: number, threshold: number): Guardian {
  if (index < 1) throw new Error('generateGuardian: index must be ≥ 1');
  if (threshold < 1) throw new Error('generateGuardian: threshold must be ≥ 1');
  const polynomial: ElementModQ[] = [randomModQNonzero()];
  for (let j = 1; j < threshold; j++) polynomial.push(randomModQ());
  return { index, polynomial };
}

/** The public coefficient commitments `g^{aⱼ}` for a guardian. */
export function commitmentFor(guardian: Guardian): GuardianCommitment {
  return {
    index: guardian.index,
    commitments: guardian.polynomial.map((coeff) => gPowP(coeff)),
  };
}

/** The share a guardian deals to recipient `ℓ`: `P_guardian(ℓ)`. */
export function dealShare(guardian: Guardian, recipientIndex: number): ElementModQ {
  return evaluatePolynomial(guardian.polynomial, BigInt(recipientIndex));
}

/**
 * Check a received share against the dealer's published commitments:
 * `g^share` must equal `∏ⱼ commitmentⱼ^{ℓʲ}`.
 */
export function verifyShare(
  commitment: GuardianCommitment,
  recipientIndex: number,
  share: ElementModQ,
): boolean {
  let expected = 1n as ElementModP;
  for (let j = 0; j < commitment.commitments.length; j++) {
    const exponent = BigInt(recipientIndex) ** BigInt(j);
    expected = multModP(expected, powModP(commitment.commitments[j], exponent));
  }
  return gPowP(share) === expected;
}

/** Derive the public commitment `g^{z_ℓ}` from all guardians' commitments. */
export function deriveShareCommitment(
  allCommitments: GuardianCommitment[],
  recipientIndex: number,
): ElementModP {
  let result = 1n as ElementModP;
  for (const commitment of allCommitments) {
    for (let j = 0; j < commitment.commitments.length; j++) {
      const exponent = BigInt(recipientIndex) ** BigInt(j);
      result = multModP(result, powModP(commitment.commitments[j], exponent));
    }
  }
  return result;
}

/**
 * Lagrange interpolation coefficient for guardian `index`, evaluated at 0,
 * over the participating set `{index} ∪ others` — computed in Z_q:
 *
 *     w = ∏_{m ∈ others} m · (m − index)⁻¹   (mod q)
 *
 * `Σ w_ℓ · z_ℓ = P(0) = s` over any `t`-element participating set.
 */
export function lagrangeCoefficient(
  index: number,
  others: number[],
): ElementModQ {
  let numerator = 1n as ElementModQ;
  let denominator = 1n as ElementModQ;
  for (const m of others) {
    if (m === index) {
      throw new Error('lagrangeCoefficient: index must not appear in others');
    }
    numerator = multModQ(numerator, BigInt(m));
    // (m − index) mod q, via addModQ with a value that is always positive.
    denominator = multModQ(denominator, addModQ(BigInt(m), -BigInt(index)));
  }
  // numerator / denominator (mod q)
  return multModQ(numerator, invModQ(denominator));
}

/**
 * Run a complete `threshold`-of-`guardianCount` key ceremony in one process.
 * Returns the joint public key plus every guardian's commitments and secret
 * share. Throws if any dealt share fails verification (it never should here —
 * the check is a self-test of the ceremony).
 */
export function runKeyCeremony(
  threshold: number,
  guardianCount: number,
): KeyCeremonyResult {
  if (threshold < 1 || threshold > guardianCount) {
    throw new Error('runKeyCeremony: require 1 ≤ threshold ≤ guardianCount');
  }

  const guardians: Guardian[] = [];
  for (let i = 1; i <= guardianCount; i++) {
    guardians.push(generateGuardian(i, threshold));
  }
  const guardianCommitments = guardians.map(commitmentFor);

  const guardianShares: GuardianShare[] = [];
  for (let ell = 1; ell <= guardianCount; ell++) {
    let combined = 0n as ElementModQ;
    for (let i = 0; i < guardianCount; i++) {
      const dealt = dealShare(guardians[i], ell);
      if (!verifyShare(guardianCommitments[i], ell, dealt)) {
        throw new Error(
          `runKeyCeremony: share from guardian ${i + 1} to ${ell} failed verification`,
        );
      }
      combined = addModQ(combined, dealt);
    }
    guardianShares.push({
      index: ell,
      share: combined,
      publicCommitment: deriveShareCommitment(guardianCommitments, ell),
    });
  }

  // Joint public key K = ∏ᵢ g^{Pᵢ(0)} = ∏ᵢ commitmentᵢ[0].
  let jointPublicKey = 1n as ElementModP;
  for (const commitment of guardianCommitments) {
    jointPublicKey = multModP(jointPublicKey, commitment.commitments[0]);
  }

  return {
    threshold,
    guardianCount,
    jointPublicKey,
    guardianCommitments,
    guardianShares,
  };
}
