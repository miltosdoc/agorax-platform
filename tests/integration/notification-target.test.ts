import { describe, expect, it } from 'vitest';
import { notificationTarget } from '../../client/src/lib/notification-target';

const target = (actionUrl: string | null = null, ids: Partial<{ proposalId: number | null; sortitionBodyId: number | null; communityId: number | null }> = {}) =>
  notificationTarget({ actionUrl, proposalId: null, sortitionBodyId: null, communityId: null, ...ids });

describe('notification destinations', () => {
  it('preserves the local action including its selected tab and fragment', () => {
    expect(target('/communities/12?tab=forum#reply-7', { proposalId: 5 })).toBe('/communities/12?tab=forum#reply-7');
    expect(target('/proposals/12?tab=media')).toBe('/proposals/12?tab=media');
  });

  it('uses the associated object when a notification has no action', () => {
    expect(target(null, { proposalId: 5, sortitionBodyId: 8, communityId: 12 })).toBe('/proposals/5');
    expect(target(null, { sortitionBodyId: 8, communityId: 12 })).toBe('/sortition/8/ceremony');
    expect(target(null, { communityId: 12 })).toBe('/communities/12');
    expect(target()).toBe('/notifications');
  });

  it.each(['https://other.example/path', '//other.example/path', '/\\other.example/path', 'javascript:alert(1)', '/feed\n', '/feed\u0000'])('rejects unsafe action %s while retaining an available object', action => {
    expect(target(action, { communityId: 12 })).toBe('/communities/12');
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('does not construct object routes for invalid ID %s', id => {
    expect(target(null, { proposalId: id, sortitionBodyId: id, communityId: id })).toBe('/notifications');
  });
});
