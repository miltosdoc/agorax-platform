/**
 * Community summary contract tests.
 *
 * Protects the dashboard from backend/frontend drift: the dashboard needs
 * member count, current user role, settings permission, and proposal summaries
 * using canonical proposal fields (question/status), not stale title/state.
 */

import { describe, expect, it } from 'vitest';
import {
  getCommunitySummaryPermissions,
  mapProposalToCommunitySummary,
} from '../../shared/community-summary';

describe('community summary contract', () => {
  it('allows only founders/admins to manage settings', () => {
    expect(getCommunitySummaryPermissions('founder')).toEqual({ canManageSettings: true });
    expect(getCommunitySummaryPermissions('admin')).toEqual({ canManageSettings: true });
    expect(getCommunitySummaryPermissions('member')).toEqual({ canManageSettings: false });
    expect(getCommunitySummaryPermissions(undefined)).toEqual({ canManageSettings: false });
  });

  it('maps proposals to canonical dashboard summaries', () => {
    const summary = mapProposalToCommunitySummary({
      id: 7,
      question: 'How should Athens improve transit?',
      status: 'community_signal',
      authorId: 42,
      createdAt: new Date('2026-04-25T10:00:00.000Z'),
    });

    expect(summary).toEqual({
      id: 7,
      question: 'How should Athens improve transit?',
      status: 'community_signal',
      authorId: 42,
      authorLabel: 'User #42',
      createdAt: '2026-04-25T10:00:00.000Z',
    });
  });

  it('does not expose stale title/state fields in proposal summaries', () => {
    const summary = mapProposalToCommunitySummary({
      id: 8,
      question: 'Question is canonical',
      status: 'review',
      authorId: 11,
      createdAt: '2026-04-25T10:00:00.000Z',
      title: 'Old title field',
      state: 'old_state',
    });

    expect(summary).not.toHaveProperty('title');
    expect(summary).not.toHaveProperty('state');
    expect(summary.question).toBe('Question is canonical');
    expect(summary.status).toBe('review');
  });
});
