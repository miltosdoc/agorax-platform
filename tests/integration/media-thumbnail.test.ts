import { describe, expect, it } from 'vitest';
import { thumbnailSeekSeconds } from '../../server/utils/media-probe';

describe('video poster frame selection', () => {
  it('seeks inside a very short clip rather than beyond its last frame', () => {
    for (const duration of [0.04, 0.5, 1]) {
      expect(thumbnailSeekSeconds(duration)).toBeGreaterThanOrEqual(0);
      expect(thumbnailSeekSeconds(duration)).toBeLessThan(duration);
    }
  });
  it('keeps the existing one-second poster for longer clips', () => {
    expect(thumbnailSeekSeconds(120)).toBe(1);
    expect(thumbnailSeekSeconds()).toBe(1);
  });
  it('uses the first frame when duration is unavailable or invalid', () => {
    for (const duration of [0, -1, NaN, Infinity]) expect(thumbnailSeekSeconds(duration)).toBe(0);
  });
});
