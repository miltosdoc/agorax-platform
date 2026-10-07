import { describe, expect, it } from 'vitest';
import { getCommunityJoinStatus } from '../../shared/community-membership';

describe('inline community membership state', () => {
  it('makes a pending approval request stable after a directory reload', () => {
    expect(getCommunityJoinStatus({ isMember: false, hasPendingRequest: true, joinPolicy: 'approval' })).toBe('pending');
  });

  it('shows an approved member even when an old request still exists', () => {
    expect(getCommunityJoinStatus({ isMember: true, hasPendingRequest: true, joinPolicy: 'approval' })).toBe('member');
  });

  it('preserves an existing pending request after policy becomes invite-only', () => {
    expect(getCommunityJoinStatus({ isMember: false, hasPendingRequest: true, joinPolicy: 'invite_only' })).toBe('pending');
  });

  it('prevents presenting an open join action for invite-only communities', () => {
    expect(getCommunityJoinStatus({ isMember: false, hasPendingRequest: false, joinPolicy: 'invite_only' })).toBe('invite_only');
  });

  it.each(['open', 'approval', null, undefined])('allows the proper join flow for policy %s', (joinPolicy) => {
    expect(getCommunityJoinStatus({ isMember: false, hasPendingRequest: false, joinPolicy })).toBe('eligible');
  });
});
