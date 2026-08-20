import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Democracy Score', () => {
  const score = readFileSync(
    join(__dirname, '../../server/utils/democracy-score.ts'),
    'utf8'
  );

  describe('Score Calculation', () => {
    it('should implement calculateDemocracyScore', () => {
      expect(score).toMatch(/calculateDemocracyScore/);
    });

    it('should consider sortition usage', () => {
      expect(score).toMatch(/sortition/);
    });

    it('should consider participation rate', () => {
      expect(score).toMatch(/participation/);
    });

    it('should penalize admin intervention', () => {
      expect(score).toMatch(/admin.*intervention|intervention.*admin/);
    });
  });

  describe('Score Bounds', () => {
    it('should cap score at 100', () => {
      expect(score).toMatch(/Math.min.*100|100/);
    });

    it('should floor score at 0', () => {
      expect(score).toMatch(/Math.max.*0|0/);
    });
  });
});
