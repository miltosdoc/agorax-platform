/**
 * Canonical AgoraX proposal lifecycle.
 *
 * This is the single source of truth for proposal state names and transitions.
 * UI labels, API validation, storage updates, and tests should import from here
 * instead of re-declaring legacy status strings.
 */

export const PROPOSAL_STATES = [
  'draft',
  'review',
  'author_review',
  'community_signal',
  'sortition_synthesis',
  'final_review',
  'voting',
  'decided',
  'archived',
] as const;

/**
 * Proposal tracks.
 *  - 'deliberation': the short deliberation flow — review → community_signal
 *    (amendments) → final_review (AI merge + author acceptance) → voting,
 *    where qualifying counter-proposals appear on the ballot as alternatives.
 *  - 'vote': no deliberation — submit goes straight to a yes/no/abstain vote
 *    with an author-chosen duration.
 * Proposals created before tracks existed follow the legacy full flow and
 * carry track='deliberation' with the legacy states still being valid.
 */
export const PROPOSAL_TRACKS = ['deliberation', 'vote'] as const;
export type ProposalTrack = typeof PROPOSAL_TRACKS[number];

export type ProposalState = typeof PROPOSAL_STATES[number];

export const INITIAL_PROPOSAL_STATE: ProposalState = 'draft';

export const TERMINAL_PROPOSAL_STATES = ['decided', 'archived'] as const satisfies readonly ProposalState[];

export const VALID_PROPOSAL_TRANSITIONS: Record<ProposalState, readonly ProposalState[]> = {
  // draft → voting is the direct-vote track only; transitionProposal
  // enforces the track guard (the static map can't express per-proposal rules).
  draft: ['review', 'voting', 'archived'],
  // review → voting is the LLM auto-approve fast path (score > 90): the
  // proposal is high-confidence enough to skip deliberation and go straight
  // to ratification.
  review: ['author_review', 'community_signal', 'draft', 'voting', 'archived'],
  author_review: ['community_signal', 'archived'],
  community_signal: ['sortition_synthesis', 'final_review', 'voting', 'archived'],
  sortition_synthesis: ['voting', 'author_review', 'archived'],
  // final_review: the AI has produced the merged vote-ready text; the author
  // accepts it (or refines it via constrained AI edits) before the vote.
  final_review: ['voting', 'archived'],
  voting: ['decided', 'archived'],
  decided: [],
  archived: [],
};

export const PROPOSAL_STATE_DESCRIPTIONS: Record<ProposalState, string> = {
  draft: 'Under author revision',
  review: 'Being validated by LLM',
  author_review: 'Author reviewing amendments',
  community_signal: 'Community voting on rejected amendments',
  sortition_synthesis: 'Sortition body composing final text',
  final_review: 'Author reviewing the AI-merged final text',
  voting: 'Final ratification vote in progress',
  decided: 'Decision reached',
  archived: 'Closed without decision',
};

export function isProposalState(value: unknown): value is ProposalState {
  return typeof value === 'string' && (PROPOSAL_STATES as readonly string[]).includes(value);
}

export function assertProposalState(value: unknown): ProposalState {
  if (isProposalState(value)) return value;
  throw new Error(`Invalid proposal state: ${String(value)}`);
}

export function canTransitionProposal(from: ProposalState, to: ProposalState): boolean {
  return VALID_PROPOSAL_TRANSITIONS[from].includes(to);
}

export function getNextProposalStates(current: ProposalState): readonly ProposalState[] {
  return VALID_PROPOSAL_TRANSITIONS[current];
}

export function isTerminalProposalState(state: ProposalState): boolean {
  return (TERMINAL_PROPOSAL_STATES as readonly ProposalState[]).includes(state);
}
