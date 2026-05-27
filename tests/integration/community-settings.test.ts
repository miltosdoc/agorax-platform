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
} from '../../shared/community-settings';

describe('community settings contract', () => {
  it('exposes stable type and governance options for UI controls', () => {
    expect(COMMUNITY_TYPES).toEqual(['autonomous', 'managed']);
    expect(COMMUNITY_GOVERNANCE_MODELS).toEqual(['no_admin', 'admin_team', 'hybrid']);
  });

  it('sanitizes community creation with safe defaults and configurable deliberation settings', () => {
    const result = sanitizeCommunityCreateInput({
      name: '  Δήμος Αθηναίων  ',
      description: '  Civic participation  ',
      type: 'managed',
      governanceModel: 'hybrid',
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
      governanceModel: 'hybrid',
      maxConcurrentVotes: 3,
      minParticipationPct: '25',
      sortitionSize: 12,
      sortitionMode: 'absolute',
      sortitionResponseHours: 96,
      amendmentThreshold: '0.65',
      amendmentInclusionThreshold: '1',
      maxAmendmentsPerProposal: 8,
      requireGovgrVerification: true,
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
      amendmentThreshold: '0.5',
      amendmentInclusionThreshold: '1',
      maxAmendmentsPerProposal: -1,
      requireGovgrVerification: false,
    });
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
    expect(() => sanitizeCommunityCreateInput({ name: 'X', governanceModel: 'dictator' })).toThrow('Invalid governance model');
    expect(() => sanitizeCommunityCreateInput({ name: 'X', amendmentThreshold: 1.5 })).toThrow('amendmentThreshold must be between 0 and 1');
    expect(() => sanitizeCommunityCreateInput({ name: 'X', minParticipationPct: 101 })).toThrow('minParticipationPct must be between 0 and 100');
    expect(() => sanitizeCommunityCreateInput({ name: 'X', sortitionSize: 2 })).toThrow('sortitionSize must be between 3 and 500');
    expect(() => sanitizeCommunityCreateInput({ name: 'X', sortitionResponseHours: 0 })).toThrow('sortitionResponseHours must be between 1 and 720');
    expect(() => sanitizeCommunityCreateInput({ name: 'X', maxConcurrentVotes: 0 })).toThrow('maxConcurrentVotes must be -1 or greater than 0');
    expect(() => sanitizeCommunityCreateInput({ name: 'X', maxAmendmentsPerProposal: 0 })).toThrow('maxAmendmentsPerProposal must be -1 or greater than 0');
  });
});
