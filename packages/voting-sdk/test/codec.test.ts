/**
 * Phase 5 support — the bigint-aware JSON codec.
 */

import { describe, expect, it } from 'vitest';
import {
  encryptWithFreshNonce,
  fromJsonSafe,
  generateKeyPair,
  toJsonSafe,
} from '../src/index.ts';

describe('JSON codec for bigint-bearing values', () => {
  it('round-trips a nested structure of bigints', () => {
    const value = {
      a: 1n,
      b: [2n, 3n, { c: 4n }],
      d: 'text',
      e: 42,
      f: true,
      g: null,
    };
    expect(fromJsonSafe(toJsonSafe(value))).toEqual(value);
  });

  it('produces output that JSON.stringify accepts', () => {
    const encoded = toJsonSafe({ key: 123456789012345678901234567890n });
    expect(() => JSON.stringify(encoded)).not.toThrow();
  });

  it('survives a JSON.stringify / parse round-trip', () => {
    const original = { x: 2n ** 200n, y: [0n, 7n] };
    const restored = fromJsonSafe(JSON.parse(JSON.stringify(toJsonSafe(original))));
    expect(restored).toEqual(original);
  });

  it('round-trips a real ciphertext unchanged', () => {
    const kp = generateKeyPair();
    const { ciphertext } = encryptWithFreshNonce(1n, kp.publicKey);
    const restored = fromJsonSafe(
      JSON.parse(JSON.stringify(toJsonSafe(ciphertext))),
    );
    expect(restored).toEqual(ciphertext);
  });

  it('leaves bigint-free values untouched', () => {
    const plain = { a: 1, b: 'two', c: [true, null], d: { e: 'f' } };
    expect(toJsonSafe(plain)).toEqual(plain);
    expect(fromJsonSafe(plain)).toEqual(plain);
  });
});
