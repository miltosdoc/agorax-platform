/**
 * Sortition shuffle tests.
 *
 * The old shuffle drew one random byte per step, so for pools above 256 the
 * rejection limit became 0 and the loop never ended. A synchronous infinite
 * loop blocks the worker and vitest's timeout can never fire, so these tests
 * cap the number of random draws: a regression fails instead of hanging CI.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cryptoRandomInt, cryptoShuffle } from '../../server/utils/crypto-shuffle';

const realGetRandomValues = crypto.getRandomValues.bind(crypto);

/** Pass random draws through to the real source, failing past `max` calls. */
function capRandomDraws(max: number): () => number {
  let calls = 0;
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: ArrayBufferView) => {
    calls += 1;
    if (calls > max) throw new Error(`more than ${max} random draws: shuffle is not terminating`);
    return realGetRandomValues(array as Uint32Array);
  }) as typeof crypto.getRandomValues);
  return () => calls;
}

/** Feed fixed 32-bit values to getRandomValues, in order. */
function feedRandomValues(values: number[]): () => number {
  let calls = 0;
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint32Array) => {
    array[0] = values[calls];
    calls += 1;
    return array;
  }) as typeof crypto.getRandomValues);
  return () => calls;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cryptoShuffle', () => {
  it('terminates on a 1,000-element pool and returns a permutation', () => {
    const input = Array.from({ length: 1000 }, (_, i) => i);
    const draws = capRandomDraws(2000);

    const shuffled = cryptoShuffle(input);

    expect(shuffled).toHaveLength(1000);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(input);
    expect(new Set(shuffled).size).toBe(1000);
    // One draw per swap; a rejection is roughly a 1-in-4-million event.
    expect(draws()).toBeGreaterThanOrEqual(999);
    // 1/1000! chance of the identity permutation.
    expect(shuffled).not.toEqual(input);
  });

  it('does not modify the input array', () => {
    const input = [1, 2, 3, 4, 5];
    cryptoShuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles empty and single-element arrays without drawing', () => {
    const draws = capRandomDraws(0);
    expect(cryptoShuffle([])).toEqual([]);
    expect(cryptoShuffle(['a'])).toEqual(['a']);
    expect(draws()).toBe(0);
  });

  it('reaches every ordering of three items about equally often', () => {
    const counts = new Map<string, number>();
    for (let k = 0; k < 6000; k++) {
      const key = cryptoShuffle(['a', 'b', 'c']).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    // Expected 1000 each, standard deviation about 29.
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(800);
      expect(n).toBeLessThan(1200);
    }
  });
});

describe('cryptoRandomInt', () => {
  it('stays in range for pools above 256', () => {
    capRandomDraws(10_000);
    for (const n of [257, 500, 1000, 100_000]) {
      for (let k = 0; k < 1000; k++) {
        const x = cryptoRandomInt(n);
        expect(Number.isInteger(x)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(n);
      }
    }
  });

  it('rejects draws at or above the largest multiple of n and redraws', () => {
    // 2^32 % 1000 = 296, so the limit is 4294967000.
    const draws = feedRandomValues([4294967000, 4294966999]);
    expect(cryptoRandomInt(1000)).toBe(999);
    expect(draws()).toBe(2);
  });

  it('accepts every draw when n divides 2^32', () => {
    const draws = feedRandomValues([2 ** 32 - 1]);
    expect(cryptoRandomInt(256)).toBe(255);
    expect(draws()).toBe(1);
  });

  it('returns 0 for n = 1', () => {
    expect(cryptoRandomInt(1)).toBe(0);
  });

  it('throws on invalid n', () => {
    expect(() => cryptoRandomInt(0)).toThrow(RangeError);
    expect(() => cryptoRandomInt(2.5)).toThrow(RangeError);
    expect(() => cryptoRandomInt(2 ** 32 + 1)).toThrow(RangeError);
  });
});
