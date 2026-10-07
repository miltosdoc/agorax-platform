export type CommunityJoinStatus = 'member' | 'pending' | 'eligible' | 'invite_only';

/** Membership wins over old requests; a pending request survives policy changes. */
export function getCommunityJoinStatus(input: {
  isMember: boolean;
  hasPendingRequest: boolean;
  joinPolicy?: string | null;
}): CommunityJoinStatus {
  if (input.isMember) return 'member';
  if (input.hasPendingRequest) return 'pending';
  return input.joinPolicy === 'invite_only' ? 'invite_only' : 'eligible';
}
