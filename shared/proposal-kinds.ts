/**
 * What a proposal asks the community to vote on.
 *
 * The track (deliberation vs. direct vote) says *how* a proposal reaches the
 * ballot; the kind says *what* the ballot is. Members asked to be able to tell
 * a statute vote from an election from a quick opinion poll at a glance, and
 * the kind is that label — plus the few rules that genuinely differ:
 *
 *  - an election is a choice between candidates, so it needs options;
 *  - an election or a poll has no text to amend, so its co-drafting phase
 *    collects options instead — candidacies for an election, answers for a
 *    poll — and its description is optional;
 *  - a poll records opinion and decides nothing, so its result is never shown
 *    as passed or rejected.
 *
 * Everything else — the ballot, anonymity, the vote chain — is identical, so
 * the kind never reaches the voting backends.
 *
 * Each community sets the terms for each kind (see `voteRulesFor`): whether
 * members may start it at all, how long it may run, the majority it needs and
 * the quorum. An author chooses inside those terms and can never step outside
 * them; the server re-checks everything the form offers.
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

/**
 * Whether co-drafting means amending a text (decision, statute): amendments,
 * counter-proposals, an AI-merged final text. The alternative is
 * `kindCollectsOptions`.
 */
export function kindAllowsDeliberation(kind: ProposalKind): boolean {
  return kind === 'decision' || kind === 'statute';
}

/**
 * Whether co-drafting means collecting the ballot's options. An election
 * gathers candidacies — members put themselves or someone else forward — and
 * a poll gathers answers the author did not think of. When the phase ends
 * the list locks and becomes the ballot.
 */
export function kindCollectsOptions(kind: ProposalKind): boolean {
  return kind === 'election' || kind === 'poll';
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

/** The title or question (the `question` column), for every kind. */
export const QUESTION_MAX_CHARS = 2_000;

/**
 * The longest text any kind allows. The AI box takes a paste this long and
 * the merger reads a text this long, so neither can be what cuts it short.
 * About 38k tokens on the configured model, which reads Greek at ~2.6
 * characters per token (measured on a 32k-character statute: 12.3k tokens)
 * — the size asked for, counted in the unit members can see.
 */
export const TEXT_MAX_CHARS = 100_000;

/**
 * How long the text may be. A statute is often a whole document — an
 * association's statute runs to 30–60 thousand characters — so it has room
 * for one; for every other kind the text is a description.
 */
export function textMaxChars(kind: ProposalKind): number {
  return kind === 'statute' ? TEXT_MAX_CHARS : 12_000;
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

// ─── The community's terms for each kind ─────────────────────────────────

/**
 * How large a share of the Yes/No votes a decision or a statute needs.
 * Stored as a name rather than a decimal so the comparison is exact: «2/3»
 * held as 0.6667 would turn away a vote of exactly two to one.
 */
export const MAJORITY_RULES = ['simple', 'three_fifths', 'two_thirds', 'three_quarters'] as const;
export type MajorityRule = typeof MAJORITY_RULES[number];

export function isMajorityRule(value: unknown): value is MajorityRule {
  return typeof value === 'string' && (MAJORITY_RULES as readonly string[]).includes(value);
}

const MAJORITY_FRACTIONS: Record<MajorityRule, [number, number]> = {
  simple: [1, 2],
  three_fifths: [3, 5],
  two_thirds: [2, 3],
  three_quarters: [3, 4],
};

/** The rule as a fraction, for display ("2/3") and for the share it needs. */
export function majorityFraction(rule: MajorityRule): [number, number] {
  return MAJORITY_FRACTIONS[rule];
}

/**
 * Whether Yes carries the vote. A simple majority means *more than* half;
 * every qualified majority means *at least* the fraction — the way statutes
 * and bylaws word them. Abstentions count for neither side.
 */
export function meetsMajority(yes: number, no: number, rule: MajorityRule): boolean {
  const cast = yes + no;
  if (cast <= 0) return false;
  const [num, den] = MAJORITY_FRACTIONS[rule];
  return rule === 'simple' ? yes * den > num * cast : yes * den >= num * cast;
}

/** Read a stored majority (legacy decimal thresholds included) as a rule. */
export function majorityRuleOf(value: unknown, fallback: MajorityRule = 'simple'): MajorityRule {
  if (isMajorityRule(value)) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n >= 0.75) return 'three_quarters';
  if (n >= 0.66) return 'two_thirds';
  if (n >= 0.6) return 'three_fifths';
  return 'simple';
}

export interface VoteRules {
  /** Members may start this kind in this community. A decision always may. */
  enabled: boolean;
  /**
   * The author may open a co-drafting phase before the vote: amendments for
   * a text, candidacies for an election, answers for a poll. Always allowed
   * for a text; a community can switch the other two off.
   */
  codrafting: boolean;
  /** The range the author's voting duration must fall in, in hours. */
  minHours: number;
  maxHours: number;
  /** The majority Yes needs; null where it does not apply (election, poll). */
  majority: MajorityRule | null;
  /** Minimum turnout as a percentage of members (0–100); null for a poll. */
  quorumPct: number | null;
}

/**
 * Defaults every community starts with, so each kind works out of the box.
 * They mirror the column defaults in migrations/0055_vote_kind_rules.sql.
 */
export const DEFAULT_VOTE_RULES: Record<ProposalKind, VoteRules> = {
  decision: { enabled: true, codrafting: true, minHours: 24, maxHours: 720, majority: 'simple', quorumPct: 0 },
  statute: { enabled: true, codrafting: true, minHours: 72, maxHours: 720, majority: 'two_thirds', quorumPct: 0 },
  election: { enabled: true, codrafting: true, minHours: 48, maxHours: 336, majority: null, quorumPct: 0 },
  poll: { enabled: true, codrafting: true, minHours: 24, maxHours: 336, majority: null, quorumPct: null },
};

/** The community columns behind each kind's terms. */
export const VOTE_RULE_COLUMNS = {
  decision: { enabled: null, codrafting: null, min: 'votingMinHours', max: 'votingMaxHours', majority: 'decisionMajority', quorum: 'minParticipationPct' },
  statute: { enabled: 'statuteEnabled', codrafting: null, min: 'statuteMinHours', max: 'statuteMaxHours', majority: 'statuteMajority', quorum: 'statuteMinParticipationPct' },
  election: { enabled: 'electionEnabled', codrafting: 'electionNominationsEnabled', min: 'electionMinHours', max: 'electionMaxHours', majority: null, quorum: 'electionMinParticipationPct' },
  poll: { enabled: 'pollEnabled', codrafting: 'pollSuggestionsEnabled', min: 'pollMinHours', max: 'pollMaxHours', majority: null, quorum: null },
} as const satisfies Record<ProposalKind, {
  enabled: string | null; codrafting: string | null; min: string; max: string; majority: string | null; quorum: string | null;
}>;

/**
 * The terms a community sets for one kind, read from its row. Missing
 * columns fall back to the defaults, so an older row (or a client that got a
 * partial community) still gets working rules. Settings voted separately in
 * an autonomous community can cross — a minimum above the maximum — and the
 * range between the two values is used rather than a range nobody can meet.
 */
export function voteRulesFor(community: Record<string, unknown> | null | undefined, kind: ProposalKind): VoteRules {
  const defaults = DEFAULT_VOTE_RULES[kind];
  const cols = VOTE_RULE_COLUMNS[kind];
  const row = community ?? {};
  const int = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 ? Math.round(n) : fallback;
  };
  const a = int(row[cols.min], defaults.minHours);
  const b = int(row[cols.max], defaults.maxHours);
  const enabledRaw = cols.enabled ? row[cols.enabled] : true;
  const codraftingRaw = cols.codrafting ? row[cols.codrafting] : true;
  const quorumRaw = cols.quorum ? Number(row[cols.quorum] ?? 0) : null;
  return {
    enabled: kind === 'decision' ? true : enabledRaw !== false,
    codrafting: codraftingRaw !== false,
    minHours: Math.min(a, b),
    maxHours: Math.max(a, b),
    majority: cols.majority ? majorityRuleOf(row[cols.majority], defaults.majority ?? 'simple') : null,
    quorumPct: quorumRaw === null ? null : Number.isFinite(quorumRaw) ? Math.min(Math.max(quorumRaw, 0), 100) : 0,
  };
}

/** The most options a collected ballot may carry — a ballot, not a census. */
export const MAX_COLLECTED_OPTIONS = 30;

/** The kinds a community lets its members start, in display order. */
export function enabledKinds(community: Record<string, unknown> | null | undefined): ProposalKind[] {
  return PROPOSAL_KINDS.filter((kind) => voteRulesFor(community, kind).enabled);
}

// ─── Stage: the three steps a member sees ────────────────────────────────

/**
 * The public stage of a proposal. The lifecycle has nine internal states;
 * a member needs three: it is being co-drafted, it is being voted on, or it
 * is over. A draft is the author's alone and is shown apart.
 *
 *   without co-drafting: voting → completed
 *   with co-drafting:    codrafting → voting → completed
 */
export const PROPOSAL_STAGES = ['codrafting', 'voting', 'completed'] as const;
export type ProposalStage = typeof PROPOSAL_STAGES[number] | 'draft';

export function proposalStageOf(status: string): ProposalStage {
  switch (status) {
    case 'draft': return 'draft';
    case 'voting': return 'voting';
    case 'decided':
    case 'archived': return 'completed';
    // review, author_review, community_signal, sortition_synthesis,
    // final_review — every step before the ballot opens.
    default: return 'codrafting';
  }
}
