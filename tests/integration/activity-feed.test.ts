import { describe, expect, it } from 'vitest';
import { compareFeedItems, decodeFeedCursor, encodeFeedCursor, isAfterFeedCursor, type FeedSource } from '../../shared/activity-feed';

const row = (source: FeedSource, id: number, createdAt = '2026-10-07T10:00:00.000Z') => ({ source, id, createdAt });

describe('activity feed pagination', () => {
  it('keeps colliding library and proposal media IDs distinct and ordered', () => {
    const items = [row('community-media', 1), row('proposal-media', 1), row('proposal', 1), row('survey', 1)].sort(compareFeedItems);
    expect(items.map(item => item.source)).toEqual(['survey', 'proposal-media', 'proposal', 'community-media']);
    for (let index = 0; index < items.length; index++) {
      const cursor = decodeFeedCursor(encodeFeedCursor(items[index]))!;
      expect(items.filter(item => isAfterFeedCursor(item, cursor))).toEqual(items.slice(index + 1));
    }
  });
  it('uses time then identity, so a newer low ID precedes an older high ID', () => {
    expect([row('proposal', 100, '2026-10-06T00:00:00Z'), row('proposal', 2)].sort(compareFeedItems)[0].id).toBe(2);
  });
  it('paginates equal timestamps by descending IDs within one source', () => {
    const items = [row('proposal', 4), row('proposal', 3), row('proposal', 2)];
    const cursor = decodeFeedCursor(encodeFeedCursor(items[1]))!;
    expect(items.filter(item => isAfterFeedCursor(item, cursor))).toEqual([items[2]]);
  });
  it('round trips a UTC cursor regardless of the supplied date timezone', () => {
    expect(decodeFeedCursor(encodeFeedCursor(row('community-media', 42, '2026-10-07T12:00:00+02:00'))))
      .toEqual({ createdAt: '2026-10-07T10:00:00.000Z', source: 'community-media', id: 42 });
  });
  it.each([undefined, null, '', '12', 'garbage|proposal|1', '2026-10-07|unknown|1', '2026-10-07|proposal|-1', '2026-10-07|proposal|1.5', '2026-10-07|proposal|Infinity', '2026-10-07|proposal|9007199254740992', '2026-10-07|proposal|1|extra'])('rejects invalid cursor %s', raw => {
    expect(decodeFeedCursor(raw)).toBeNull();
  });
});
