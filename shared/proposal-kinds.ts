/**
 * What a proposal asks the community to vote on.
 *
 * The track (deliberation vs. direct vote) says *how* a proposal reaches the
 * ballot; the kind says *what* the ballot is. Members asked to be able to tell
 * a statute vote from an election from a quick opinion poll at a glance, and
 * the kind is that label — plus the few rules that genuinely differ:
 *
 *  - an election is a choice between candidates, so it needs options;
 *  - an election or a poll has no text to amend, so it cannot go through
 *    deliberation, and its description is optional;
 *  - a poll records opinion and decides nothing, so its result is never shown
 *    as passed or rejected.
 *
 * Everything else — the ballot, anonymity, the vote chain — is identical, so
 * the kind never reaches the voting backends.
 */

export const PROPOSAL_KINDS = ['decision', 'statute', 'election', 'poll'] as const;
export type ProposalKind = typeof PROPOSAL_KINDS[number];

export const DEFAULT_PROPOSAL_KIND: ProposalKind = 'decision';

export function isProposalKind(value: unknown): value is ProposalKind {
  return typeof value === 'string' && (PROPOSAL_KINDS as readonly string[]).includes(value);
}

/** Legacy rows and unknown values read as a plain decision. */
export function proposalKindOf(value: unknown): ProposalKind {
  return isProposalKind(value) ? value : DEFAULT_PROPOSAL_KIND;
}

/** Only a text can be amended; candidates and poll answers cannot. */
export function kindAllowsDeliberation(kind: ProposalKind): boolean {
  return kind === 'decision' || kind === 'statute';
}

/** An election without candidates is not a ballot. */
export function kindRequiresOptions(kind: ProposalKind): boolean {
  return kind === 'election';
}

/**
 * Whether the explanatory text (the `solution` column) is required. A poll
 * can be just its question and answers; an election, the role and the
 * candidates.
 */
export function kindRequiresText(kind: ProposalKind): boolean {
  return kind === 'decision' || kind === 'statute';
}

/** A poll is a sounding, not a decision. */
export function isBindingKind(kind: ProposalKind): boolean {
  return kind !== 'poll';
}

/**
 * The option appended to every option ballot so that nobody is forced to
 * pick one of the listed choices. Its id stays 'status_quo' whatever the
 * kind, so tallies and the ballot service treat it the same way; only the
 * words change, because «Καμία αλλαγή» means nothing on an election ballot.
 */
export function refusalOptionLabel(kind: ProposalKind): string {
  switch (kind) {
    case 'election': return 'Λευκό';
    case 'poll': return 'Καμία από τις παραπάνω';
    default: return 'Καμία αλλαγή';
  }
}
