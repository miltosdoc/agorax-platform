/**
 * Cryptographically secure, unbiased shuffling for sortition draws.
 *
 * Kept free of database imports so it can be unit-tested on its own and
 * shared by every code path that draws members by lot.
 */

const UINT32_RANGE = 2 ** 32;

/**
 * Uniform random integer in [0, n) from crypto.getRandomValues.
 *
 * Draws a 32-bit value and uses rejection sampling to avoid modulo bias:
 * values at or above the largest multiple of n below 2^32 are redrawn.
 * The rejection chance is below n / 2^32, so the loop ends almost at once
 * for any realistic pool size.
 */
export function cryptoRandomInt(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > UINT32_RANGE) {
    throw new RangeError(`cryptoRandomInt: n must be an integer in [1, 2^32], got ${n}`);
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % n);
  const buf = new Uint32Array(1);
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % n;
}

/**
 * Fisher–Yates shuffle driven by cryptoRandomInt. Returns a new array and
 * leaves the input untouched.
 */
export function cryptoShuffle<T>(array: readonly T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
