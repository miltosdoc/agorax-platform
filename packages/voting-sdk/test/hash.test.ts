/**
 * Phase 1 — the ElectionGuard 2.1 hash function and byte encodings.
 */

import { describe, expect, it } from 'vitest';
import {
  H,
  MOD_P_BYTES,
  bigintToBytes,
  bytesToBigint,
  modPToBytes,
} from '../src/index.ts';
import { loadVectorsByType } from './conformance.ts';

interface EgHashCase {
  name: string;
  keyHex: string;
  dataHex: string;
  expectHex: string;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('EG 2.1 hash function H (HMAC-SHA-256)', () => {
  it('matches the reference known-answer vector', () => {
    for (const file of loadVectorsByType<EgHashCase>('eg-hash')) {
      for (const c of file.cases) {
        const digest = H(hexToBytes(c.keyHex), hexToBytes(c.dataHex));
        expect(bytesToHex(digest).toLowerCase()).toBe(c.expectHex.toLowerCase());
      }
    }
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => H(new Uint8Array(16), new Uint8Array(0))).toThrow();
  });
});

describe('byte encodings', () => {
  it('bigint round-trips through fixed-width bytes', () => {
    for (const x of [0n, 1n, 255n, 256n, 0xdeadbeefn, 2n ** 300n]) {
      expect(bytesToBigint(bigintToBytes(x, 64))).toBe(x);
    }
  });

  it('rejects a value too large for the requested width', () => {
    expect(() => bigintToBytes(256n, 1)).toThrow();
  });

  it('encodes a group element as exactly 512 bytes', () => {
    expect(modPToBytes(123n).length).toBe(MOD_P_BYTES);
  });
});
