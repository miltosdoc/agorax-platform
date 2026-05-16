/**
 * The ElectionGuard 2.1 algebraic group.
 *
 * ElectionGuard works in the order-`q` subgroup of the multiplicative group
 * Z*_p, where `p` is a 4096-bit prime and `q` is a 256-bit prime dividing
 * p − 1. This is *integer* modular arithmetic, not an elliptic curve — but we
 * still build it on audited primitives: `@noble/curves` supplies the prime
 * field (constant-time modular exponentiation and inversion). The SDK never
 * implements raw bignum modular arithmetic itself.
 *
 * Two element spaces appear throughout the protocol and must not be mixed:
 *  - `ElementModP` — a residue in Z*_p; group elements (ciphertexts, keys).
 *  - `ElementModQ` — a residue in Z_q; exponents (nonces, secret keys,
 *    Fiat-Shamir challenges).
 * They are branded so the type system rejects passing one where the other is
 * expected — a real footgun in hand-rolled protocol code.
 */

import { Field } from '@noble/curves/abstract/modular';
import { P_HEX, Q_HEX, G_HEX, R_HEX, EG_2_1_PARAMETER_SET } from './constants.ts';

/** A residue modulo `p` — a candidate element of the group Z*_p. */
export type ElementModP = bigint & { readonly __brand: 'ElementModP' };

/** A residue modulo `q` — an exponent / scalar. */
export type ElementModQ = bigint & { readonly __brand: 'ElementModQ' };

/** Parse a (possibly whitespace-formatted) hex string into a bigint. */
export function hexToBigint(hex: string): bigint {
  const cleaned = hex.replace(/\s+/g, '');
  if (cleaned.length === 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error('hexToBigint: input is not a hex string');
  }
  return BigInt('0x' + cleaned);
}

/** Large prime modulus `p` (4096-bit). */
export const P: bigint = hexToBigint(P_HEX);
/** Small prime `q` — order of the subgroup (256-bit). */
export const Q: bigint = hexToBigint(Q_HEX);
/** Generator `g` of the order-`q` subgroup. */
export const G: bigint = hexToBigint(G_HEX);
/** Cofactor `r`, satisfying p = q·r + 1. */
export const R: bigint = hexToBigint(R_HEX);

/** Field arithmetic modulo `p` (group elements). */
export const Fp = Field(P);
/** Field arithmetic modulo `q` (exponents / scalars). */
export const Fq = Field(Q);

/** The ElectionGuard 2.1 standard group, as a single value. */
export interface ElectionGroup {
  /** Stable identifier for this parameter set. */
  readonly name: string;
  /** Large prime modulus. */
  readonly p: bigint;
  /** Subgroup order (small prime). */
  readonly q: bigint;
  /** Subgroup generator. */
  readonly g: bigint;
  /** Cofactor: p = q·r + 1. */
  readonly r: bigint;
}

export const EG_GROUP: ElectionGroup = {
  name: EG_2_1_PARAMETER_SET,
  p: P,
  q: Q,
  g: G,
  r: R,
};

// --- Arithmetic in Z*_p (group elements) ----------------------------------

/** Modular exponentiation in Z*_p: base^exp mod p. */
export function powModP(base: bigint, exp: bigint): ElementModP {
  return Fp.pow(Fp.create(base), exp) as ElementModP;
}

/** Modular multiplication in Z*_p: (a · b) mod p. */
export function multModP(a: bigint, b: bigint): ElementModP {
  return Fp.mul(Fp.create(a), Fp.create(b)) as ElementModP;
}

/** Modular inverse in Z*_p: a^-1 mod p. */
export function invModP(a: bigint): ElementModP {
  return Fp.inv(Fp.create(a)) as ElementModP;
}

/** g^exp mod p — the canonical "encode an exponent as a group element". */
export function gPowP(exp: bigint): ElementModP {
  return powModP(G, exp);
}

// --- Arithmetic in Z_q (exponents) ----------------------------------------

/** Reduce an arbitrary integer into Z_q. */
export function modQ(x: bigint): ElementModQ {
  return Fq.create(x) as ElementModQ;
}

/** Modular addition in Z_q: (a + b) mod q. */
export function addModQ(a: bigint, b: bigint): ElementModQ {
  return Fq.add(Fq.create(a), Fq.create(b)) as ElementModQ;
}

/** Modular multiplication in Z_q: (a · b) mod q. */
export function multModQ(a: bigint, b: bigint): ElementModQ {
  return Fq.mul(Fq.create(a), Fq.create(b)) as ElementModQ;
}

// --- Membership checks -----------------------------------------------------

/** True if `x` is a valid residue mod p (0 < x < p). */
export function isElementModP(x: bigint): boolean {
  return x > 0n && x < P;
}

/** True if `x` is a valid exponent (0 ≤ x < q). */
export function isElementModQ(x: bigint): boolean {
  return x >= 0n && x < Q;
}

/**
 * True if `x` is a member of the order-`q` subgroup — i.e. a well-formed
 * ElectionGuard group element. This is the check the verifier applies to
 * every ciphertext component: x^q mod p must equal 1.
 */
export function isInSubgroup(x: bigint): boolean {
  return isElementModP(x) && powModP(x, Q) === 1n;
}

/** Bit length of a non-negative bigint. */
function bitLength(x: bigint): number {
  return x <= 0n ? 0 : x.toString(2).length;
}

/** Result of validating a group's parameters — a named pass/fail per check. */
export interface GroupValidation {
  ok: boolean;
  checks: Record<string, boolean>;
}

/**
 * Validate that a group's parameters are internally consistent. This is the
 * core defence against a transcription error in the constants: the relations
 * below uniquely pin `p`, `q`, `g` and `r` to each other, so a single wrong
 * hex digit in any of them is caught.
 */
export function validateGroup(group: ElectionGroup = EG_GROUP): GroupValidation {
  const checks: Record<string, boolean> = {
    'q is 256-bit': bitLength(group.q) === 256,
    'p is 4096-bit': bitLength(group.p) === 4096,
    'p = q·r + 1': group.q * group.r + 1n === group.p,
    'g is a non-trivial residue (1 < g < p)': group.g > 1n && group.g < group.p,
    'g^q mod p = 1 (g generates the order-q subgroup)':
      powModP(group.g, group.q) === 1n,
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}
