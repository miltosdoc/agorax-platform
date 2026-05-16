/**
 * Phase 0 — ElectionGuard 2.1 group conformance.
 *
 * Verifies the embedded standard parameters are internally consistent and
 * exercises the conformance harness with the `group-parameters` vectors.
 */

import { describe, expect, it } from 'vitest';
import {
  EG_GROUP,
  G,
  P,
  Q,
  R,
  gPowP,
  isInSubgroup,
  multModP,
  powModP,
  validateGroup,
} from '../src/index.ts';
import { loadVectorsByType } from './conformance.ts';

/** Shape of a `group-parameters` conformance case. */
interface GroupParamCase {
  name: string;
  field: string;
  expect: unknown;
}

/** Bit length of a non-negative bigint. */
function bitLength(x: bigint): number {
  return x <= 0n ? 0 : x.toString(2).length;
}

describe('ElectionGuard 2.1 standard group', () => {
  it('validates: every internal-consistency check passes', () => {
    const result = validateGroup(EG_GROUP);
    // Surface which check failed, if any, rather than a bare `false`.
    expect(result.checks).toEqual({
      'q is 256-bit': true,
      'p is 4096-bit': true,
      'p = q·r + 1': true,
      'g is a non-trivial residue (1 < g < p)': true,
      'g^q mod p = 1 (g generates the order-q subgroup)': true,
    });
    expect(result.ok).toBe(true);
  });

  it('q is the 256-bit prime 2^256 - 189', () => {
    expect(Q).toBe(2n ** 256n - 189n);
  });

  it('satisfies the cofactor relation p = q·r + 1', () => {
    expect(Q * R + 1n).toBe(P);
  });

  it('g generates the order-q subgroup (g^q mod p = 1)', () => {
    expect(powModP(G, Q)).toBe(1n);
    expect(isInSubgroup(G)).toBe(true);
  });

  it('rejects a non-subgroup element', () => {
    // 2 is a residue mod p but is not a q-th-order element.
    expect(isInSubgroup(2n)).toBe(false);
  });

  it('homomorphism: g^a · g^b = g^(a+b)', () => {
    const a = 12345n;
    const b = 67890n;
    expect(multModP(gPowP(a), gPowP(b))).toBe(gPowP(a + b));
  });

  it('g^0 = 1 and g^q = 1', () => {
    expect(gPowP(0n)).toBe(1n);
    expect(gPowP(Q)).toBe(1n);
  });
});

describe('conformance harness — group-parameters vectors', () => {
  const files = loadVectorsByType<GroupParamCase>('group-parameters');

  it('finds the group-parameters vector file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // Derive every value a vector case might reference, from the live constants.
  const derived: Record<string, unknown> = {
    name: EG_GROUP.name,
    pBits: bitLength(P),
    qBits: bitLength(Q),
    qIsTwoPow256Minus189: Q === 2n ** 256n - 189n,
    pEqualsQRplus1: Q * R + 1n === P,
    gPowQModP: powModP(G, Q).toString(),
    gIsNonTrivial: G > 1n && G < P,
  };

  for (const file of files) {
    for (const c of file.cases) {
      it(`vector: ${c.name}`, () => {
        expect(derived).toHaveProperty(c.field);
        expect(derived[c.field]).toEqual(c.expect);
      });
    }
  }
});
