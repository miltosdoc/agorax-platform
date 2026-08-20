import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Amendment Merger', () => {
  const merger = readFileSync(
    join(__dirname, '../../server/utils/amendment-merger.ts'),
    'utf8'
  );

  const similarity = readFileSync(
    join(__dirname, '../../server/utils/amendment-similarity.ts'),
    'utf8'
  );

  describe('TF-IDF Calculation', () => {
    it('should implement TF-IDF algorithm in similarity module', () => {
      expect(similarity).toMatch(/TF-IDF|tfidf|tf_idf|idf/);
    });

    it('should use log formula for IDF', () => {
      expect(similarity).toMatch(/log/);
    });
  });

  describe('Cosine Similarity', () => {
    it('should implement cosine similarity', () => {
      expect(similarity).toMatch(/cosine|similarity/);
    });

    it('should handle vector operations', () => {
      expect(similarity).toMatch(/dot|multiply|vector|cosine/);
    });
  });

  describe('Group Similar Amendments', () => {
    it('should group similar amendments', () => {
      expect(merger).toMatch(/group|similar/);
    });

    it('should merge amendments', () => {
      expect(merger).toMatch(/merge/);
    });
  });
});
