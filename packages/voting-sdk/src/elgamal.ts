/**
 * Exponential ElGamal encryption — the ElectionGuard 2.1 form.
 *
 * A keypair is a secret scalar `s ∈ Z_q` and public key `K = g^s mod p`.
 *
 * An encryption of an integer `σ` under nonce `ξ ∈ Z_q` is the pair
 *
 *     α = g^ξ mod p
 *     β = K^(σ + ξ) mod p
 *
 * (ElectionGuard 2.0 unified ordinary and exponential ElGamal onto this
 * single-key `K^(σ+ξ)` form; 2.1 keeps it and only changed the group.)
 *
 * It is **additively homomorphic**: the component-wise product of encryptions
 * of σ₁ and σ₂ (under nonces ξ₁, ξ₂) is an encryption of σ₁+σ₂ under ξ₁+ξ₂.
 * This is what lets a tally be computed on ciphertexts and only the aggregate
 * ever decrypted.
 *
 * Decryption recovers `K^σ = β · (α^s)⁻¹` and then finds `σ` by a discrete-log
 * search base `K`. That search is linear in σ, so decryption is only for
 * *small* values — a per-contest tally, never a packed ballot.
 */

import {
  gPowP,
  invModP,
  multModP,
  powModP,
  addModQ,
} from './group.ts';
import type { ElementModP, ElementModQ } from './group.ts';
import { randomModQNonzero } from './random.ts';

/** An ElGamal keypair. The secret key must never leave a trustee. */
export interface ElGamalKeyPair {
  /** Secret scalar `s ∈ Z_q`. */
  secretKey: ElementModQ;
  /** Public key `K = g^s mod p`. */
  publicKey: ElementModP;
}

/** An ElGamal ciphertext — the pair (α, β). */
export interface Ciphertext {
  /** α = g^ξ mod p. */
  alpha: ElementModP;
  /** β = K^(σ+ξ) mod p. */
  beta: ElementModP;
}

/** A ciphertext together with the nonce that produced it (encryptor-side). */
export interface EncryptionResult {
  ciphertext: Ciphertext;
  /** The nonce ξ — secret; needed to build a ballot-validity proof. */
  nonce: ElementModQ;
}

/** Derive the public key for a secret scalar. */
export function publicKeyOf(secretKey: ElementModQ): ElementModP {
  return gPowP(secretKey);
}

/** Generate a fresh ElGamal keypair from cryptographic randomness. */
export function generateKeyPair(): ElGamalKeyPair {
  const secretKey = randomModQNonzero();
  return { secretKey, publicKey: gPowP(secretKey) };
}

/** Encrypt `message` under `publicKey` with a caller-supplied nonce. */
export function encrypt(
  message: bigint,
  nonce: ElementModQ,
  publicKey: ElementModP,
): Ciphertext {
  if (message < 0n) throw new Error('encrypt: message must be non-negative');
  return {
    alpha: gPowP(nonce),
    beta: powModP(publicKey, addModQ(message, nonce)),
  };
}

/** Encrypt `message` under `publicKey` with a fresh random nonce. */
export function encryptWithFreshNonce(
  message: bigint,
  publicKey: ElementModP,
): EncryptionResult {
  const nonce = randomModQNonzero();
  return { ciphertext: encrypt(message, nonce, publicKey), nonce };
}

/**
 * Combine ciphertexts homomorphically: returns an encryption of the sum of
 * the plaintexts (under the sum of the nonces). The identity is the
 * encryption of 0 with nonce 0, i.e. (1, 1).
 */
export function addCiphertexts(...ciphertexts: Ciphertext[]): Ciphertext {
  let alpha = 1n as ElementModP;
  let beta = 1n as ElementModP;
  for (const c of ciphertexts) {
    alpha = multModP(alpha, c.alpha);
    beta = multModP(beta, c.beta);
  }
  return { alpha, beta };
}

/**
 * Recover `K^σ` from a ciphertext given the secret key — the group element
 * the discrete-log search runs against. Exposed for threshold decryption
 * (Phase 3), where partial decryptions are combined before the search.
 */
export function decryptToGroupElement(
  ciphertext: Ciphertext,
  secretKey: ElementModQ,
): ElementModP {
  const shared = powModP(ciphertext.alpha, secretKey); // α^s = K^ξ
  return multModP(ciphertext.beta, invModP(shared)); // β / K^ξ = K^σ
}

/**
 * Decrypt a ciphertext to its integer plaintext `σ`, searching `0..maxValue`.
 * Throws if `σ` is not in range — callers must bound `maxValue` by the number
 * of ballots in the tally.
 */
export function decrypt(
  ciphertext: Ciphertext,
  keyPair: ElGamalKeyPair,
  maxValue: number,
): number {
  const target = decryptToGroupElement(ciphertext, keyPair.secretKey);
  let acc = 1n as ElementModP; // K^0
  for (let sigma = 0; sigma <= maxValue; sigma++) {
    if (acc === target) return sigma;
    acc = multModP(acc, keyPair.publicKey); // K^(sigma+1)
  }
  throw new Error(`decrypt: plaintext exceeds maxValue (${maxValue})`);
}
