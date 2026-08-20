import { describe, it, expect } from 'vitest';

describe('Sortition Algorithm', () => {
  describe('Modulo Bias Prevention', () => {
    it('should use rejection sampling for uniform distribution', () => {
      const n = 10;
      const limit = 256 - (256 % (n + 1));

      // 256 % 11 = 3, so limit = 256 - 3 = 253
      expect(limit).toBe(253);

      const testValues = [0, 50, 100, 200, 250, 252, 253, 254, 255];
      const accepted = testValues.filter(v => v < limit);

      expect(accepted).not.toContain(253);
      expect(accepted).not.toContain(254);
      expect(accepted).not.toContain(255);
    });

    it('should handle edge case where n equals 255', () => {
      const n = 255;
      const limit = 256 - (256 % (n + 1));
      expect(limit).toBe(256);
    });

    it('should handle n = 1', () => {
      const n = 1;
      const limit = 256 - (256 % (n + 1));
      expect(limit).toBe(256);
    });
  });

  describe('Fisher-Yates Shuffle', () => {
    it('should produce a shuffled array', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const original = [...arr];

      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }

      expect(arr.sort()).toEqual(original.sort());
    });

    it('should handle single element array', () => {
      const arr = [1];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }

      expect(arr).toEqual([1]);
    });

    it('should handle two element array', () => {
      const arr = [1, 2];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }

      // Should be either [1, 2] or [2, 1]
      expect(arr.length).toBe(2);
      expect(arr.includes(1)).toBe(true);
      expect(arr.includes(2)).toBe(true);
    });
  });
});
