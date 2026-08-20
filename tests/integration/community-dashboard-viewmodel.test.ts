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
  it('maps governance enum values to translation keys instead of leaking raw values', () => {
    expect(getGovernanceTranslationKey('no_admin')).toBe('community.governance_no_admin');
    expect(getGovernanceTranslationKey('admin_team')).toBe('community.governance_admin_team');
    expect(getGovernanceTranslationKey('hybrid')).toBe('community.governance_hybrid');

    // Legacy seed values should still render as human labels while data is cleaned up.
    expect(getGovernanceTranslationKey('admin_founded')).toBe('community.governance_admin_team');
    expect(getGovernanceTranslationKey('admin_guided')).toBe('community.governance_hybrid');
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
