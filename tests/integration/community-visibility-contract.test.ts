/**
 * Community content-visibility invariant (QA checklist Γ.3β).
 *
 * One rule, applied server-side everywhere content is read: a community's
 * content is visible iff contentVisibility is 'public' OR the viewer is a
 * member. The community row itself (name, member count, founder) stays
 * public; memberListVisibility separately gates the roster.
 */

import { describe, expect, it } from 'vitest';
import {
  canViewCommunityContent,
  isContentPublic,
  isMemberListPublic,
} from '../../server/utils/community-visibility';

describe('content visibility predicate', () => {
  it('treats missing/legacy contentVisibility as public (back-compat)', () => {
    expect(isContentPublic({})).toBe(true);
    expect(isContentPublic({ contentVisibility: null })).toBe(true);
    expect(isContentPublic({ contentVisibility: 'public' })).toBe(true);
  });

  it("gates content when contentVisibility is 'members'", () => {
    expect(isContentPublic({ contentVisibility: 'members' })).toBe(false);
  });

  it('member-list visibility is an independent gate', () => {
    expect(isMemberListPublic({})).toBe(true);
    expect(isMemberListPublic({ memberListVisibility: 'members' })).toBe(false);
    // content can be public while the roster is members-only, and vice versa
    expect(isContentPublic({ contentVisibility: 'public' })).toBe(true);
  });
});

describe('canViewCommunityContent short-circuits', () => {
  it('public content is visible to anonymous viewers without a DB lookup', async () => {
    await expect(
      canViewCommunityContent({ id: -1, contentVisibility: 'public' }, undefined),
    ).resolves.toBe(true);
  });

  it('members-only content is invisible to anonymous viewers without a DB lookup', async () => {
    await expect(
      canViewCommunityContent({ id: -1, contentVisibility: 'members' }, undefined),
    ).resolves.toBe(false);
  });
});
