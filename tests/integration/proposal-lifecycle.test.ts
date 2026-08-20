/**
 * Canonical proposal lifecycle contract tests.
 *
 * These tests protect the product spine: user drafts a proposal, submits it for
 * review, author handles amendments, community signals, sortition synthesizes,
 * and the community ratifies the final text.
 */

import { describe, expect, it } from 'vitest';
import {
  INITIAL_PROPOSAL_STATE,
  PROPOSAL_STATES,
  VALID_PROPOSAL_TRANSITIONS,
  canTransitionProposal,
  getNextProposalStates,
  isProposalState,
  isTerminalProposalState,
} from '../../shared/proposal-lifecycle';

describe('canonical proposal lifecycle', () => {
  it('starts new proposals as drafts', () => {
    expect(INITIAL_PROPOSAL_STATE).toBe('draft');
  });

  it('defines one coherent deliberation spine', () => {
    const spine = [
      'draft',
      'review',
      'author_review',
      'community_signal',
      'sortition_synthesis',
      'voting',
      'decided',
    ] as const;

    for (let index = 0; index < spine.length - 1; index += 1) {
      expect(canTransitionProposal(spine[index], spine[index + 1])).toBe(true);
    }
  });

  it('allows direct community_signal → voting when no sortition synthesis is needed', () => {
    expect(canTransitionProposal('community_signal', 'voting')).toBe(true);
  });

  it('rejects legacy/prototype states', () => {
    for (const legacyState of ['submitted', 'validating', 'valid', 'approved', 'returned', 'resolved']) {
      expect(isProposalState(legacyState)).toBe(false);
    }
  });

  it('has terminal decision states only', () => {
    expect(isTerminalProposalState('decided')).toBe(true);
    expect(isTerminalProposalState('archived')).toBe(true);
    expect(getNextProposalStates('decided')).toEqual([]);
    expect(getNextProposalStates('archived')).toEqual([]);
  });

  it('keeps transition map complete for every state', () => {
    expect(Object.keys(VALID_PROPOSAL_TRANSITIONS).sort()).toEqual([...PROPOSAL_STATES].sort());
  });
});
