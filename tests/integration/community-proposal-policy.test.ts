/**
 * Who may submit a proposal.
 *
 * A managed community can reserve proposal-writing for its admin team or for
 * the founder alone. The rule that matters most here is the one these tests
 * spend the most effort on: narrowing WHO PROPOSES must never narrow who
 * debates or votes. A community that silenced its members would not be a
 * community, and the platform should not be able to express that.
 */

import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_PROPOSAL_POLICIES,
  canSubmitProposal,
  effectiveProposalPolicy,
  sanitizeCommunityCreateInput,
  sanitizeCommunityUpdateInput,
} from '../../shared/community-settings';
import { buildCommunitySummary } from '../../shared/community-summary';

const community = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Γενική Κοινότητα',
  type: 'managed',
  proposalPolicy: 'all_members',
  creatorId: 7,
  democracyScore: null,
  description: null,
  ...over,
}) as any;

describe('proposal policy', () => {
  it('offers exactly the three documented values', () => {
    expect(COMMUNITY_PROPOSAL_POLICIES).toEqual(['all_members', 'admins', 'founder']);
  });

  it('is meaningless in an autonomous community, whatever the column says', () => {
    // No admin team exists to reserve anything for, so a stored restriction
    // is not honoured rather than being quietly enforced.
    expect(effectiveProposalPolicy(community({ type: 'autonomous', proposalPolicy: 'founder' }))).toBe('all_members');
    expect(effectiveProposalPolicy(community({ type: 'autonomous', proposalPolicy: 'admins' }))).toBe('all_members');
  });

  it('falls back to the open value when the column holds something unknown', () => {
    expect(effectiveProposalPolicy(community({ proposalPolicy: 'nonsense' }))).toBe('all_members');
    expect(effectiveProposalPolicy(community({ proposalPolicy: null }))).toBe('all_members');
  });

  describe('all_members', () => {
    it('lets any member propose', () => {
      for (const role of ['member', 'admin', 'founder']) {
        expect(canSubmitProposal({ policy: 'all_members', role })).toBe(true);
      }
    });
  });

  describe('admins', () => {
    it('admits the founder and the admin team, and refuses an ordinary member', () => {
      expect(canSubmitProposal({ policy: 'admins', role: 'founder' })).toBe(true);
      expect(canSubmitProposal({ policy: 'admins', role: 'admin' })).toBe(true);
      expect(canSubmitProposal({ policy: 'admins', role: 'member' })).toBe(false);
    });
  });

  describe('founder', () => {
    it('refuses even the admin team', () => {
      expect(canSubmitProposal({ policy: 'founder', role: 'founder' })).toBe(true);
      expect(canSubmitProposal({ policy: 'founder', role: 'admin' })).toBe(false);
      expect(canSubmitProposal({ policy: 'founder', role: 'member' })).toBe(false);
    });

    it('admits the creator even when no founder row exists', () => {
      // createCommunity in server/utils/community-manager.ts records the
      // creator of a managed community with role 'admin' and writes no
      // 'founder' row at all. Trusting the role alone would lock a founder
      // out of their own community under exactly the policy they chose.
      expect(canSubmitProposal({ policy: 'founder', role: 'admin', isCreator: true })).toBe(true);
      expect(canSubmitProposal({ policy: 'founder', role: undefined, isCreator: true })).toBe(true);
    });
  });

  it('refuses someone who is not a member at all', () => {
    expect(canSubmitProposal({ policy: 'admins', role: undefined })).toBe(false);
    expect(canSubmitProposal({ policy: 'founder', role: null })).toBe(false);
  });
});

describe('proposal policy in the settings contract', () => {
  it('defaults to open, so no existing community changes behaviour', () => {
    const created = sanitizeCommunityCreateInput({ name: 'Δήμος', type: 'managed' });
    expect(created.proposalPolicy).toBe('all_members');
  });

  it('accepts a restriction on a managed community', () => {
    const created = sanitizeCommunityCreateInput({ name: 'Δήμος', type: 'managed', proposalPolicy: 'founder' });
    expect(created.proposalPolicy).toBe('founder');
  });

  it('forces the open value on an autonomous community at creation', () => {
    const created = sanitizeCommunityCreateInput({ name: 'Δήμος', type: 'autonomous', proposalPolicy: 'founder' });
    expect(created.proposalPolicy).toBe('all_members');
  });

  it('rejects a value outside the three', () => {
    expect(() => sanitizeCommunityCreateInput({ name: 'Δήμος', type: 'managed', proposalPolicy: 'everyone' }))
      .toThrow(/Invalid proposal policy/);
  });

  it('drops a restriction when a community turns autonomous', () => {
    // The admin team dissolves with the switch; a restriction naming it must
    // not linger as a value nothing honours.
    const updated = sanitizeCommunityUpdateInput({ type: 'autonomous', proposalPolicy: 'founder' });
    expect(updated.proposalPolicy).toBe('all_members');
  });

  it('leaves the policy alone when the patch does not mention it', () => {
    const updated = sanitizeCommunityUpdateInput({ name: 'Νέο όνομα' });
    expect(updated.proposalPolicy).toBeUndefined();
  });
});

describe('what the community summary tells the page', () => {
  const summaryFor = (over: Record<string, unknown>, role?: string, viewerId?: number) =>
    buildCommunitySummary(community(over), [], 10, role, viewerId);

  it('reports the effective policy, not the raw column', () => {
    expect(summaryFor({ type: 'autonomous', proposalPolicy: 'founder' }, 'member').proposalPolicy).toBe('all_members');
  });

  it('tells an ordinary member they may not propose under a restriction', () => {
    expect(summaryFor({ proposalPolicy: 'admins' }, 'member').viewerCanPropose).toBe(false);
    expect(summaryFor({ proposalPolicy: 'admins' }, 'admin').viewerCanPropose).toBe(true);
  });

  it('tells the creator they may propose under the founder-only policy', () => {
    expect(summaryFor({ proposalPolicy: 'founder' }, 'admin', 7).viewerCanPropose).toBe(true);
    expect(summaryFor({ proposalPolicy: 'founder' }, 'admin', 99).viewerCanPropose).toBe(false);
  });

  it('never lets a non-member propose', () => {
    expect(summaryFor({ proposalPolicy: 'all_members' }, undefined).viewerCanPropose).toBe(false);
  });

  it('leaves every other member right untouched', () => {
    // The guard this whole feature has to respect: restricting proposals must
    // not restrict anything else. canManageSettings is role-derived and must
    // stay exactly as it was for a plain member under the tightest policy.
    const tight = summaryFor({ proposalPolicy: 'founder' }, 'member');
    const open = summaryFor({ proposalPolicy: 'all_members' }, 'member');
    expect(tight.canManageSettings).toBe(open.canManageSettings);
    expect(tight.memberCount).toBe(open.memberCount);
    expect(tight.currentUserRole).toBe('member');
  });
});
