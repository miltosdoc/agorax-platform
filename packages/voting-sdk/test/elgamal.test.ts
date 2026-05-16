/**
 * Phase 1 — exponential ElGamal: round-trip and homomorphic tally.
 */

import { describe, expect, it } from 'vitest';
import {
  addCiphertexts,
  decrypt,
  encrypt,
  encryptWithFreshNonce,
  generateKeyPair,
  gPowP,
  publicKeyOf,
} from '../src/index.ts';

describe('ElGamal keypair', () => {
  it('public key is g^secret', () => {
    const kp = generateKeyPair();
    expect(kp.publicKey).toBe(gPowP(kp.secretKey));
    expect(publicKeyOf(kp.secretKey)).toBe(kp.publicKey);
  });
});

describe('ElGamal encrypt / decrypt', () => {
  it('round-trips small plaintexts', () => {
    const kp = generateKeyPair();
    for (const sigma of [0n, 1n, 2n, 7n, 42n]) {
      const { ciphertext } = encryptWithFreshNonce(sigma, kp.publicKey);
      expect(decrypt(ciphertext, kp, 100)).toBe(Number(sigma));
    }
  });

  it('fresh nonces give different ciphertexts for the same plaintext', () => {
    const kp = generateKeyPair();
    const a = encryptWithFreshNonce(1n, kp.publicKey).ciphertext;
    const b = encryptWithFreshNonce(1n, kp.publicKey).ciphertext;
    expect(a.alpha === b.alpha && a.beta === b.beta).toBe(false);
  });

  it('a fixed nonce is deterministic', () => {
    const kp = generateKeyPair();
    const { nonce } = encryptWithFreshNonce(1n, kp.publicKey);
    expect(encrypt(1n, nonce, kp.publicKey)).toEqual(
      encrypt(1n, nonce, kp.publicKey),
    );
  });

  it('throws when the plaintext exceeds maxValue', () => {
    const kp = generateKeyPair();
    const { ciphertext } = encryptWithFreshNonce(50n, kp.publicKey);
    expect(() => decrypt(ciphertext, kp, 10)).toThrow(/maxValue/);
  });
});

describe('homomorphic tally', () => {
  it('the product of encryptions decrypts to the sum of plaintexts', () => {
    const kp = generateKeyPair();
    const votes = [1n, 0n, 1n, 1n, 0n, 1n, 0n]; // yes-count = 4
    const ciphertexts = votes.map(
      (v) => encryptWithFreshNonce(v, kp.publicKey).ciphertext,
    );
    const aggregate = addCiphertexts(...ciphertexts);
    expect(decrypt(aggregate, kp, votes.length)).toBe(4);
  });

  it('the empty aggregate decrypts to 0', () => {
    const kp = generateKeyPair();
    expect(decrypt(addCiphertexts(), kp, 5)).toBe(0);
  });
});
