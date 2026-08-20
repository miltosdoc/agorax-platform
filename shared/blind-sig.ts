/**
 * RSA blind signatures — RFC 9474 (RSA-BSSA) via @cloudflare/blindrsa-ts.
 *
 * Replaces the previous hand-rolled PKCS#1 v1.5 implementation (B1 closure).
 * Library: @cloudflare/blindrsa-ts v0.4.4 — authored by RFC 9474 co-authors
 * (Cloudflare), matches RFC test vectors, uses WebCrypto for side-channel
 * resistant private-key operations.
 *
 * Variant: RSABSSA.SHA384.PSS.Randomized — the safe, all-use-cases variant
 * that injects fresh entropy the signer cannot guess. Reinforces invariant I3
 * (token independent of AFM).
 *
 * See docs/compliance/04_ANONYMOUS_VOTING_DESIGN.md.
 */

import { RSABSSA } from '@cloudflare/blindrsa-ts';

const suite = RSABSSA.SHA384.PSS.Randomized();

// ─── Base64 codec (works in browser + Node) ──────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ─── Key conversion: base64 \u2194 CryptoKey \u2194 JWK ──────────────────────

function toB64Url(bytes: Uint8Array): string {
  const b64 = bytesToBase64(bytes);
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Convert base64-encoded RSA public key components to a WebCrypto CryptoKey.
 */
async function pubKeyFromBase64(nB64: string, eB64: string): Promise<CryptoKey> {
  const n = base64ToBytes(nB64);
  const e = base64ToBytes(eB64);
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: toB64Url(n), e: toB64Url(e) },
    { name: 'RSA-PSS', hash: 'SHA-384' },
    true,
    ['verify'],
  );
}

/**
 * Export a public CryptoKey to our base64 wire format.
 */
async function exportPubKey(key: CryptoKey): Promise<{ n: string; e: string }> {
  const jwk = await crypto.subtle.exportKey('jwk', key);
  const toStd = (b: string) =>
    (b + '='.repeat((4 - (b.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return { n: toStd(jwk.n!), e: toStd(jwk.e!) };
}

/**
 * Export a private CryptoKey to a storable base64-encoded JWK JSON string.
 */
async function exportPrivKey(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', key);
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(jwk)));
}

/**
 * Import a private key from the stored base64 JWK format.
 */
async function importPrivKey(jwkB64: string): Promise<CryptoKey> {
  const json = new TextDecoder().decode(base64ToBytes(jwkB64));
  const jwk = JSON.parse(json);
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-PSS', hash: 'SHA-384' },
    true,
    ['sign'],
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PublicKey {
  /** RSA modulus, base64 big-endian. */
  n: string;
  /** Public exponent, base64 big-endian (typically 65537). */
  e: string;
}

export interface PrivateKey extends PublicKey {
  /** Full JWK private key, base64-encoded JSON. Server-only. */
  d: string;
}

export interface BlindedRequest {
  /** Random token the voter generated, 40 bytes: 32 random + 8 bytes expiry. */
  token: Uint8Array;
  /** Prepared message (with Randomized entropy) — needed for finalize. */
  preparedMsg: Uint8Array;
  /** Blinding inverse (inv), kept secret on the client. */
  blindingFactor: Uint8Array;
  /** What the voter sends to the server (base64 of blinded message). */
  blinded: string;
  /** Minimum cast time (epoch ms) embedded in the last 8 bytes of the token. */
  minCastTime: number;
}

// ─── Random helpers ──────────────────────────────────────────────────────────

function randomBytesCross(length: number): Uint8Array {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const out = new Uint8Array(length);
    crypto.getRandomValues(out);
    return out;
  }
  const { randomBytes } = require('node:crypto') as typeof import('node:crypto');
  return new Uint8Array(randomBytes(length));
}

// ─── Key generation (server only) ────────────────────────────────────────────

/**
 * Generate a fresh RSA-2048 keypair per proposal using the RFC 9474 library.
 * Returns keys in our base64 wire format for storage.
 */
export async function generateKey(): Promise<PrivateKey> {
  const keypair = await suite.generateKey({
    modulusLength: 2048,
    publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
  });
  const pub = await exportPubKey(keypair.publicKey);
  const privJwk = await exportPrivKey(keypair.privateKey);
  return { n: pub.n, e: pub.e, d: privJwk };
}

// ─── Client (browser) side ───────────────────────────────────────────────────

/**
 * Generate a fresh random token + blind it against the proposal's public key.
 * The voter keeps `token`, `preparedMsg`, and `blindingFactor` locally and
 * sends `blinded` to the server.
 *
 * IMPORTANT: `preparedMsg` must be stored and passed to `unblind()` — the
 * Randomized variant injects fresh entropy during prepare(), so the prepared
 * message cannot be regenerated from the token alone.
 */
export async function blind(
  publicKey: PublicKey,
  minCastTime: number = Date.now(),
): Promise<BlindedRequest> {
  // 40-byte token: 32 random + 8 bytes minCastTime (big-endian epoch ms)
  const randomPart = randomBytesCross(32);
  const expiryBytes = new Uint8Array(8);
  new DataView(expiryBytes.buffer).setBigUint64(0, BigInt(minCastTime), false);
  const token = new Uint8Array(40);
  token.set(randomPart, 0);
  token.set(expiryBytes, 32);

  const pubKey = await pubKeyFromBase64(publicKey.n, publicKey.e);

  // Prepare injects high-entropy component (Randomized variant).
  // The prepared message must be stored — it cannot be regenerated.
  const preparedMsg = suite.prepare(token);

  // Blind the prepared message
  const { blindedMsg, inv } = await suite.blind(pubKey, preparedMsg);

  return {
    token,
    preparedMsg,
    blindingFactor: inv,
    blinded: bytesToBase64(blindedMsg),
    minCastTime,
  };
}

/**
 * Unblind the server's blind signature to recover a valid RSA-PSS signature
 * on the token. The client must pass the original token, prepared message,
 * and blinding factor from the blind() call.
 *
 * Returns base64-encoded signature.
 */
export async function unblind(
  blindedSignatureB64: string,
  token: Uint8Array,
  preparedMsg: Uint8Array,
  blindingFactor: Uint8Array,
  publicKey: PublicKey,
): Promise<string> {
  const pubKey = await pubKeyFromBase64(publicKey.n, publicKey.e);
  const blindSig = base64ToBytes(blindedSignatureB64);
  const sig = await suite.finalize(pubKey, preparedMsg, blindSig, blindingFactor);
  return bytesToBase64(sig);
}

// ─── Server side ─────────────────────────────────────────────────────────────

/**
 * Sign a blinded value with the server's private key.
 * Returns base64-encoded blinded signature.
 */
export async function signBlinded(
  blindedB64: string,
  privateKey: PrivateKey,
): Promise<string> {
  const privKey = await importPrivKey(privateKey.d);
  const blindedMsg = base64ToBytes(blindedB64);
  const blindSig = await suite.blindSign(privKey, blindedMsg);
  return bytesToBase64(blindSig);
}

/**
 * Verify an RSA-PSS signature on `token` using the public key.
 * The signature produced by the blind signature flow verifies as a
 * standard RSA-PSS signature on the prepared message.
 *
 * NOTE: The caller must pass the prepared message that was used during
 * the blind() call, because the Randomized variant injects entropy.
 */
export async function verify(
  _token: Uint8Array,
  preparedMsg: Uint8Array,
  signatureB64: string,
  publicKey: PublicKey,
): Promise<boolean> {
  const pubKey = await pubKeyFromBase64(publicKey.n, publicKey.e);
  const sig = base64ToBytes(signatureB64);
  return await suite.verify(pubKey, sig, preparedMsg);
}
