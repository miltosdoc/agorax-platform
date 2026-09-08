/**
 * Community settings contract tests.
 *
 * Community admins need parametrization, but the API must not accept arbitrary
 * fields or unsafe governance/deliberation values. These tests define the
 * modular contract used by routes and future UI settings screens.
 */

import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_GOVERNANCE_MODELS,
  COMMUNITY_TYPES,
  sanitizeCommunityCreateInput,
  sanitizeCommunityUpdateInput,
  assertCommunityRanges,
  resolveAuthoredPhaseHours,
} from '../../shared/community-settings';

describe('community settings contract', () => {
  it('exposes stable type and governance options for UI controls', () => {
    expect(COMMUNITY_TYPES).toEqual(['autonomous', 'managed']);
    // 'hybrid' is gone: it was a third option no permission check ever read.
    expect(COMMUNITY_GOVERNANCE_MODELS).toEqual(['no_admin', 'admin_team']);
  });

  it('sanitizes community creation with safe defaults and configurable deliberation settings', () => {
    const result = sanitizeCommunityCreateInput({
      name: '  Δήμος Αθηναίων  ',
      description: '  Civic participation  ',
      type: 'managed',
      governanceModel: 'hybrid',   // αγνοείται: παράγεται από το type
      maxConcurrentVotes: 3,
      minParticipationPct: '25',
      sortitionSize: 12,
      sortitionMode: 'absolute',
      sortitionResponseHours: 96,
      amendmentThreshold: '0.65',
      maxAmendmentsPerProposal: 8,
      requireGovgrVerification: true,
      creatorId: 999,
      id: 999,
    });

    expect(result).toEqual({
      name: 'Δήμος Αθηναίων',
      description: 'Civic participation',
      type: 'managed',
      governanceModel: 'admin_team',
      maxConcurrentVotes: 3,
      minParticipationPct: '25',
      sortitionSize: 12,
      sortitionMode: 'absolute',
      sortitionResponseHours: 96,
      synthesisMode: 'ai',
      amendmentThreshold: '0.65',
      amendmentInclusionThreshold: '0.6',
      maxAmendmentsPerProposal: 8,
      requireGovgrVerification: true,
      proposalPolicy: 'all_members',
      joinPolicy: 'open',
      memberListVisibility: 'public',
      contentVisibility: 'public',
      authorReviewHours: 72,
      communitySignalHours: 48,
      votingHours: 168,
      finalReviewHours: 24,
      deliberationMinHours: 24,
      deliberationMaxHours: 336,
      votingMinHours: 24,
      votingMaxHours: 720,
    });
  });

  it('applies defaults on minimal community creation', () => {
    expect(sanitizeCommunityCreateInput({ name: 'Citizens' })).toEqual({
      name: 'Citizens',
      type: 'autonomous',
      governanceModel: 'no_admin',
      maxConcurrentVotes: -1,
      minParticipationPct: '0',
      sortitionSize: 12,
      sortitionMode: 'absolute',
      sortitionResponseHours: 72,
      synthesisMode: 'ai',
      amendmentThreshold: '0.5',
      amendmentInclusionThreshold: '0.6',
      maxAmendmentsPerProposal: -1,
      requireGovgrVerification: false,
      proposalPolicy: 'all_members',
      joinPolicy: 'open',
      memberListVisibility: 'public',
      contentVisibility: 'public',
      authorReviewHours: 72,
      communitySignalHours: 48,
      votingHours: 168,
      finalReviewHours: 24,
      deliberationMinHours: 24,
      deliberationMaxHours: 336,
      votingMinHours: 24,
      votingMaxHours: 720,
    });
  });

  it('derives the governance model from the type on update, and never from input', () => {
    // A community that switches type must not keep a stored model describing
    // the type it just left.
    expect(sanitizeCommunityUpdateInput({ type: 'managed' }))
      .toEqual({ type: 'managed', governanceModel: 'admin_team' });
    expect(sanitizeCommunityUpdateInput({ type: 'autonomous' }))
      // Turning autonomous dissolves the admin team, so a restriction that
      // named it is cleared in the same patch rather than left dangling.
      .toEqual({ type: 'autonomous', governanceModel: 'no_admin', proposalPolicy: 'all_members' });
    expect(sanitizeCommunityUpdateInput({ governanceModel: 'admin_team' })).toEqual({});
  });

  it('sanitizes updates by whitelisting configurable fields only', () => {
    const result = sanitizeCommunityUpdateInput({
      name: ' Updated ',
      creatorId: 1,
      democracyScore: '999',
      createdAt: new Date(),
      requireGovgrVerification: false,
      sortitionResponseHours: 48,
    });

    expect(result).toEqual({
      name: 'Updated',
      requireGovgrVerification: false,
      sortitionResponseHours: 48,
    });
  });

  it('rejects invalid parametrization values', () => {
    expect(() => sanitizeCommunityCreateInput({ name: '' })).toThrow('Community name is required');
    expect(() => sanitizeCommunityCreateInput({ name: 'X', type: 'private' })).toThrow('Invalid community type');
    // No longer rejected, because it is no longer read: the governance model
    // is derived from the type, so a caller cannot set it at all.
    expect(sanitizeCommunityCreateInput({ name: 'X', governanceModel: 'dictator' }).governanceModel).toBe('no_admin');
    expect(sanitizeCommunityCreateInput({ name: 'X', type: 'managed', governanceModel: 'dictator' }).governanceModel).toBe('admin_team');
    expect(() => sanitizeCommunityCreateInput({ name: 'X', amendmentThreshold: 1.5 })).toThrow('amendmentThreshold must be between 0 and 1');
    expect(() => sanitizeCommunityCreateInput({ name: 'X', minParticipationPct: 101 })).toThrow('minParticipationPct must be between 0 and 100');
    expect(() => sanitizeCommunityCreateInput({ name: 'X', sortitionSize: 2 })).toThrow('sortitionSize must be between 3 and 500');
    expect(() => sanitizeCommunityCreateInput({ name: 'X', sortitionResponseHours: 0 })).toThrow('sortitionResponseHours must be between 1 and 720');
    expect(() => sanitizeCommunityCreateInput({ name: 'X', maxConcurrentVotes: 0 })).toThrow('maxConcurrentVotes must be -1 or greater than 0');
    expect(() => sanitizeCommunityCreateInput({ name: 'X', maxAmendmentsPerProposal: 0 })).toThrow('maxAmendmentsPerProposal must be -1 or greater than 0');
  });

  it('rejects a range that admits no valid author choice', () => {
    expect(() => sanitizeCommunityCreateInput({ name: 'X', deliberationMinHours: 100, deliberationMaxHours: 50 }))
      .toThrow('deliberationMinHours cannot exceed deliberationMaxHours');
    expect(() => sanitizeCommunityUpdateInput({ votingMinHours: 400, votingMaxHours: 200 }))
      .toThrow('votingMinHours cannot exceed votingMaxHours');
  });

  it('checks a half-sent range against the settings the row will hold', () => {
    // A PATCH raising only the minimum must still be judged against the
    // maximum already stored.
    expect(() => assertCommunityRanges({ deliberationMinHours: 400, deliberationMaxHours: 336 }))
      .toThrow('deliberationMinHours cannot exceed deliberationMaxHours');
    expect(() => assertCommunityRanges({ deliberationMinHours: 24, deliberationMaxHours: 336 })).not.toThrow();
  });
});

describe('author-chosen phase duration', () => {
  const bounds = { min: 24, max: 336, communityDefault: 48 };

  it('honours a choice inside the community range', () => {
    expect(resolveAuthoredPhaseHours({ requested: 120, ...bounds })).toBe(120);
  });

  it('clamps a choice that falls outside the range', () => {
    // Bounds can be tightened after the proposal was created, so a stored
    // value is re-clamped at transition time rather than trusted.
    expect(resolveAuthoredPhaseHours({ requested: 2, ...bounds })).toBe(24);
    expect(resolveAuthoredPhaseHours({ requested: 5000, ...bounds })).toBe(336);
  });

  it('falls back to the community default when the author chose nothing', () => {
    expect(resolveAuthoredPhaseHours({ requested: null, ...bounds })).toBe(48);
    expect(resolveAuthoredPhaseHours({ requested: 0, ...bounds })).toBe(48);
  });

  it('keeps a phase the community switched off switched off', () => {
    // 0 = unlimited/no auto-advance. An author preference must not
    // reintroduce a deadline the community removed.
    expect(resolveAuthoredPhaseHours({ requested: 100, min: 24, max: 336, communityDefault: 0 })).toBe(0);
  });

  it('ignores an impossible range instead of inverting it', () => {
    expect(resolveAuthoredPhaseHours({ requested: 100, min: 400, max: 50, communityDefault: 48 })).toBe(48);
  });
});
