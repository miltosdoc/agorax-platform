/**
 * Phase 1 — zero-knowledge proofs: Chaum-Pedersen equality and the
 * disjunctive zero-or-one ballot-validity proof.
 *
 * Tests cover completeness (an honest proof verifies) and soundness (a
 * tampered proof, a wrong statement, or a malformed ballot is rejected).
 */

import { describe, expect, it } from 'vitest';
import {
  encrypt,
  encryptWithFreshNonce,
  generateKeyPair,
  gPowP,
  powModP,
  proveEqualDlog,
  proveZeroOrOne,
  randomModQ,
  verifyEqualDlog,
  verifyZeroOrOne,
} from '../src/index.ts';
import type { ElementModQ } from '../src/index.ts';

describe('Chaum-Pedersen discrete-log-equality proof', () => {
  function dhTuple() {
    const xi = randomModQ();
    const kp = generateKeyPair();
    return {
      exponent: xi,
      stmt: {
        baseK: kp.publicKey,
        alpha: gPowP(xi),
        betaPrime: powModP(kp.publicKey, xi),
      },
    };
  }

  it('an honest proof verifies', () => {
    const { exponent, stmt } = dhTuple();
    expect(verifyEqualDlog(proveEqualDlog(exponent, stmt), stmt)).toBe(true);
  });

  it('rejects a tampered response', () => {
    const { exponent, stmt } = dhTuple();
    const proof = proveEqualDlog(exponent, stmt);
    const tampered = {
      ...proof,
      response: (proof.response + 1n) as ElementModQ,
    };
    expect(verifyEqualDlog(tampered, stmt)).toBe(false);
  });

  it('rejects a proof for a non-DH tuple', () => {
    const { exponent, stmt } = dhTuple();
    const proof = proveEqualDlog(exponent, stmt);
    // betaPrime perturbed: no longer K^xi.
    const wrong = { ...stmt, betaPrime: powModP(stmt.betaPrime, 2n) };
    expect(verifyEqualDlog(proof, wrong)).toBe(false);
  });

  it('challenge is bound to context', () => {
    const { exponent, stmt } = dhTuple();
    const proof = proveEqualDlog(exponent, { ...stmt, context: [1n] });
    expect(verifyEqualDlog(proof, { ...stmt, context: [1n] })).toBe(true);
    expect(verifyEqualDlog(proof, { ...stmt, context: [2n] })).toBe(false);
  });
});

describe('disjunctive zero-or-one ballot-validity proof', () => {
  it('verifies an honest proof for an encryption of 0', () => {
    const kp = generateKeyPair();
    const { ciphertext, nonce } = encryptWithFreshNonce(0n, kp.publicKey);
    const proof = proveZeroOrOne(ciphertext, nonce, 0, kp.publicKey);
    expect(verifyZeroOrOne(ciphertext, proof, kp.publicKey)).toBe(true);
  });

  it('verifies an honest proof for an encryption of 1', () => {
    const kp = generateKeyPair();
    const { ciphertext, nonce } = encryptWithFreshNonce(1n, kp.publicKey);
    const proof = proveZeroOrOne(ciphertext, nonce, 1, kp.publicKey);
    expect(verifyZeroOrOne(ciphertext, proof, kp.publicKey)).toBe(true);
  });

  it('rejects a tampered proof', () => {
    const kp = generateKeyPair();
    const { ciphertext, nonce } = encryptWithFreshNonce(1n, kp.publicKey);
    const proof = proveZeroOrOne(ciphertext, nonce, 1, kp.publicKey);
    const tampered = {
      ...proof,
      response1: (proof.response1 + 1n) as ElementModQ,
    };
    expect(verifyZeroOrOne(ciphertext, tampered, kp.publicKey)).toBe(false);
  });

  it('rejects a proof verified under the wrong public key', () => {
    const kp = generateKeyPair();
    const other = generateKeyPair();
    const { ciphertext, nonce } = encryptWithFreshNonce(1n, kp.publicKey);
    const proof = proveZeroOrOne(ciphertext, nonce, 1, kp.publicKey);
    expect(verifyZeroOrOne(ciphertext, proof, other.publicKey)).toBe(false);
  });

  it('rejects a proof with mismatched context', () => {
    const kp = generateKeyPair();
    const { ciphertext, nonce } = encryptWithFreshNonce(0n, kp.publicKey);
    const proof = proveZeroOrOne(ciphertext, nonce, 0, kp.publicKey, [99n]);
    expect(verifyZeroOrOne(ciphertext, proof, kp.publicKey, [99n])).toBe(true);
    expect(verifyZeroOrOne(ciphertext, proof, kp.publicKey, [7n])).toBe(false);
  });

  it('soundness: cannot prove an out-of-range ballot is 0 or 1', () => {
    const kp = generateKeyPair();
    // Encrypt 2 — an overvote — and try to pass it off as a "1".
    const { ciphertext, nonce } = encryptWithFreshNonce(2n, kp.publicKey);
    const forged = proveZeroOrOne(ciphertext, nonce, 1, kp.publicKey);
    expect(verifyZeroOrOne(ciphertext, forged, kp.publicKey)).toBe(false);
  });
});
