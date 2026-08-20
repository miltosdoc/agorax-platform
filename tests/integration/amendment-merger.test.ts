/**
 * Amendment dedup contract tests.
 *
 * Pin the duplicate detection: similar normalized text on the same proposal
 * (same amendment type) should be grouped, while different types are never
 * merged even when wording overlaps.
 */

import { describe, expect, it } from 'vitest';
import {
  jaccardSimilarity,
  normalizeForSimilarity,
  groupDuplicates,
  DEFAULT_SIMILARITY_THRESHOLD,
} from '../../server/utils/amendment-similarity';

describe('amendment similarity — text normalization', () => {
  it('strips punctuation, lowercases, and drops single-letter tokens', () => {
    const tokens = normalizeForSimilarity('Hello, World! A new proposal.');
    expect(tokens).toEqual(['hello', 'world', 'new', 'proposal']);
  });

  it('removes Greek diacritics so accent variants match', () => {
    const a = normalizeForSimilarity('Επέκταση δικτύου ποδηλατοδρόμων.');
    const b = normalizeForSimilarity('επεκταση δικτυου ποδηλατοδρομων');
    expect(a).toEqual(b);
  });
});

describe('amendment similarity — Jaccard similarity', () => {
  it('returns 1 for identical token lists', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('returns 0 for disjoint token lists', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('treats two empty lists as identical', () => {
    expect(jaccardSimilarity([], [])).toBe(1);
  });

  it('treats one empty side as fully dissimilar', () => {
    expect(jaccardSimilarity(['a'], [])).toBe(0);
  });

  it('produces similarity above threshold for paraphrased text', () => {
    const a = normalizeForSimilarity('Να συμπεριληφθούν σταθμοί φόρτισης σε προαστιακούς σταθμούς.');
    const b = normalizeForSimilarity('Πρέπει να συμπεριληφθούν σταθμοί φόρτισης σε προαστιακούς σταθμούς.');
    expect(jaccardSimilarity(a, b)).toBeGreaterThanOrEqual(DEFAULT_SIMILARITY_THRESHOLD);
  });

  it('produces similarity below threshold for unrelated proposals', () => {
    const a = normalizeForSimilarity('Επέκταση δικτύου ποδηλατοδρόμων στο κέντρο.');
    const b = normalizeForSimilarity('Δωρεάν εισιτήρια δημόσιας συγκοινωνίας για μαθητές.');
    expect(jaccardSimilarity(a, b)).toBeLessThan(DEFAULT_SIMILARITY_THRESHOLD);
  });
});

describe('amendment similarity — duplicate grouping', () => {
  it('returns no groups when amendments are all distinct', () => {
    const groups = groupDuplicates([
      { id: 1, type: 'improvement', text: 'Επέκταση δικτύου ποδηλατοδρόμων.' },
      { id: 2, type: 'improvement', text: 'Δωρεάν εισιτήρια για μαθητές.' },
      { id: 3, type: 'addition', text: 'Νέα στάση στον κεντρικό σταθμό.' },
    ]);
    expect(groups).toEqual([]);
  });

  it('groups paraphrased amendments of the same type', () => {
    const groups = groupDuplicates([
      { id: 1, type: 'improvement', text: 'Να συμπεριληφθούν σταθμοί φόρτισης σε προαστιακούς σταθμούς.' },
      { id: 2, type: 'improvement', text: 'Πρέπει να συμπεριληφθούν σταθμοί φόρτισης σε προαστιακούς σταθμούς.' },
      { id: 3, type: 'improvement', text: 'Νέα δωρεάν εισιτήρια για μαθητές.' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].amendmentIds.sort()).toEqual([1, 2]);
    expect(groups[0].representativeId).toBe(1);
    expect(groups[0].similarity).toBeGreaterThanOrEqual(DEFAULT_SIMILARITY_THRESHOLD);
  });

  it('never groups amendments of different types even if wording is identical', () => {
    const text = 'Νέα δωρεάν εισιτήρια για μαθητές.';
    const groups = groupDuplicates([
      { id: 1, type: 'improvement', text },
      { id: 2, type: 'counter_proposal', text },
    ]);
    expect(groups).toEqual([]);
  });
});
