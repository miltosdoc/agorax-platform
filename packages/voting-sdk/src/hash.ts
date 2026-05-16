/**
 * The ElectionGuard 2.1 hash function and byte encodings.
 *
 * ElectionGuard 2.1 defines its hash `H` as **HMAC-SHA-256**: `H(key, data)`
 * keys HMAC-SHA-256 with a fixed-length 32-byte `key` and returns the 32-byte
 * digest. The key slot is what provides domain separation — different uses of
 * `H` across the protocol pass different 32-byte context keys.
 *
 * `hmac` and `sha256` come from the audited `@noble/hashes`; this module only
 * supplies the EG-specific framing (fixed-width big-endian encodings of group
 * elements and scalars).
 */

import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { P } from './group.ts';

/** Byte width of an element mod p (4096-bit ⇒ 512 bytes). */
export const MOD_P_BYTES = 512;
/** Byte width of a scalar mod q and of an `H` output (256-bit ⇒ 32 bytes). */
export const MOD_Q_BYTES = 32;

if ((P.toString(2).length + 7) >> 3 !== MOD_P_BYTES) {
  throw new Error('hash.ts: MOD_P_BYTES does not match the group modulus width');
}

/** Big-endian fixed-width encoding of a non-negative bigint. */
export function bigintToBytes(x: bigint, byteLength: number): Uint8Array {
  if (x < 0n) throw new Error('bigintToBytes: negative input');
  const out = new Uint8Array(byteLength);
  let v = x;
  for (let i = byteLength - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error('bigintToBytes: value does not fit in byteLength');
  return out;
}

/** Decode a big-endian byte array to a bigint. */
export function bytesToBigint(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

/** Encode a group element (residue mod p) as 512 big-endian bytes. */
export function modPToBytes(x: bigint): Uint8Array {
  return bigintToBytes(x, MOD_P_BYTES);
}

/** Encode a scalar (residue mod q) as 32 big-endian bytes. */
export function modQToBytes(x: bigint): Uint8Array {
  return bigintToBytes(x, MOD_Q_BYTES);
}

/** Concatenate byte arrays. */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/**
 * The ElectionGuard hash function `H(key, data)` — HMAC-SHA-256.
 *
 * `key` must be exactly 32 bytes (the EG 2.1 convention; HMAC would accept
 * other lengths, but the spec fixes it and we enforce it).
 */
export function H(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (key.length !== MOD_Q_BYTES) {
    throw new Error(`H: key must be exactly ${MOD_Q_BYTES} bytes`);
  }
  return hmac(sha256, key, data);
}

/** SHA-256 of a UTF-8 string — used to derive 32-byte domain-separation keys. */
export function sha256Utf8(s: string): Uint8Array {
  return sha256(new TextEncoder().encode(s));
}
