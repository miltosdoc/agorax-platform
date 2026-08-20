/**
 * Cryptographic randomness.
 *
 * Every encryption nonce and every proof commitment exponent comes from here.
 * Per the SDK privacy checklist: `crypto.getRandomValues` only, never
 * `Math.random`, a fresh value per call, never reused.
 *
 * A uniform scalar in [0, q) is produced by rejection sampling — drawing
 * 32 random bytes and discarding any draw ≥ q. Since q is just below 2^256,
 * the rejection probability is ~189 / 2^256, i.e. effectively zero, so this
 * terminates in one iteration in practice while staying exactly uniform.
 */

import { Q } from './group.ts';
import type { ElementModQ } from './group.ts';
import { bytesToBigint, MOD_Q_BYTES } from './hash.ts';

/** A uniformly random scalar in [0, q). */
export function randomModQ(): ElementModQ {
  for (;;) {
    const bytes = new Uint8Array(MOD_Q_BYTES);
    globalThis.crypto.getRandomValues(bytes);
    const candidate = bytesToBigint(bytes);
    if (candidate < Q) return candidate as ElementModQ;
  }
}

/**
 * A uniformly random *nonzero* scalar in [1, q) — for secret keys and
 * encryption nonces, where a zero value would be degenerate.
 */
export function randomModQNonzero(): ElementModQ {
  for (;;) {
    const x = randomModQ();
    if (x !== 0n) return x;
  }
}
