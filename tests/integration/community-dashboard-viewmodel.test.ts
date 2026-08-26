/**
 * Community dashboard view model tests.
 *
 * Protects the dashboard from mockup-style empty labels and raw enum leakage.
 */

import { describe, expect, it } from 'vitest';
import {
  getCommunityDashboardMetrics,
  getGovernanceTranslationKey,
  hasDemocracyScore,
} from '../../shared/community-summary';

describe('community dashboard view model', () => {
  it('labels governance from the community type, which is what is enforced', () => {
    expect(getGovernanceTranslationKey('managed')).toBe('community.governance_admin_team');
    expect(getGovernanceTranslationKey('autonomous')).toBe('community.governance_no_admin');

    // The label used to read the stored governanceModel column, which nothing
    // enforced: a managed community could announce that it had no admins.
    // Anything that is not 'managed' — missing, legacy, junk — reads as the
    // community governing itself, which is the platform's default.
    expect(getGovernanceTranslationKey(null)).toBe('community.governance_no_admin');
    expect(getGovernanceTranslationKey(undefined)).toBe('community.governance_no_admin');
    expect(getGovernanceTranslationKey('hybrid')).toBe('community.governance_no_admin');
  });

  it('treats missing democracy score as not available instead of rendering /100', () => {
    expect(hasDemocracyScore(null)).toBe(false);
    expect(hasDemocracyScore(undefined)).toBe(false);
    expect(hasDemocracyScore('')).toBe(false);
    expect(hasDemocracyScore('72.5')).toBe(true);
    expect(hasDemocracyScore(0)).toBe(true);
  });

  it('computes substantive dashboard metrics', () => {
    const metrics = getCommunityDashboardMetrics({
      memberCount: 3,
      proposals: [
        { id: 1, status: 'draft' },
        { id: 2, status: 'voting' },
        { id: 3, status: 'decided' },
        { id: 4, status: 'archived' },
      ],
    });

    expect(metrics).toEqual({
      memberCount: 3,
      proposalCount: 4,
      activeProposalCount: 2,
      decidedProposalCount: 1,
    });
  });
});
