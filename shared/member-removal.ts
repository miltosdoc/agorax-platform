/**
 * Removing a member from a community.
 *
 * Who decides follows the community type, the same split the rest of the
 * platform uses:
 *
 *  - managed: the founder and admins remove directly. Admins remove regular
 *    members; only the founder removes an admin.
 *  - autonomous: nobody removes anyone alone. Any member opens a removal
 *    vote; it passes with ⅔ of the votes cast, provided enough members took
 *    part (the community's own quorum, and never fewer than 3 voters unless
 *    the community is smaller than that).
 *
 * Either way a reason is required, the person is told, every member can see
 * the log, and the founder can never be removed.
 *
 * A removal is not a lifetime ban: the person may rejoin after
 * REJOIN_COOLDOWN_DAYS, under the community's normal join policy. In a
 * managed community an admin can let them back sooner.
 *
 * Pure rules only — no I/O — so the client shows exactly what the server
 * enforces.
 */

/** Days a removed member waits before they can rejoin. */
export const REJOIN_COOLDOWN_DAYS = 30;
/** How long a removal vote stays open. */
export const REMOVAL_VOTE_DAYS = 7;
/** After a removal vote fails, no new vote on the same person for this long. */
export const REVOTE_COOLDOWN_DAYS = 30;
/** Fewest voters a removal vote needs (capped at the community's size). */
export const REMOVAL_MIN_VOTERS = 3;

export const REMOVAL_REASON_MIN = 10;
export const REMOVAL_REASON_MAX = 1000;
export const REMOVAL_RESPONSE_MAX = 2000;

export type RemovalVoteStatus = 'open' | 'passed' | 'rejected' | 'cancelled';
export type RemovalChoice = 'yes' | 'no';

export function isRemovalChoice(value: unknown): value is RemovalChoice {
  return value === 'yes' || value === 'no';
}

/** How the community removes members: by its admins, or by a vote. */
export function removalModeFor(communityType: string | null | undefined): 'admin' | 'vote' {
  return communityType === 'managed' ? 'admin' : 'vote';
}

/**
 * May `actorRole` remove `targetRole` directly in a managed community?
 * Returns null when allowed, otherwise the reason it is not.
 */
export function directRemovalBlocker(actorRole: string | undefined, targetRole: string | undefined): string | null {
  if (!targetRole) return 'not_member';
  if (targetRole === 'founder') return 'founder';
  if (actorRole !== 'admin' && actorRole !== 'founder') return 'not_admin';
  if (targetRole === 'admin' && actorRole !== 'founder') return 'admin_needs_founder';
  return null;
}

/** Voters needed for a removal vote to count. */
export function removalQuorum(eligible: number, minParticipationPct: number | string | null | undefined): number {
  if (eligible <= 0) return 0;
  const pct = Math.min(100, Math.max(0, Number(minParticipationPct) || 0));
  const byPct = Math.ceil((eligible * pct) / 100);
  return Math.min(eligible, Math.max(REMOVAL_MIN_VOTERS, byPct));
}

export interface RemovalTally {
  yes: number;
  no: number;
  /** Members who may vote: joined before the vote opened, minus the person. */
  eligible: number;
  minParticipationPct?: number | string | null;
}

/** Does this tally pass, counting only the votes cast so far? */
export function removalPasses({ yes, no, eligible, minParticipationPct }: RemovalTally): boolean {
  const cast = yes + no;
  if (yes === 0) return false;
  return cast >= removalQuorum(eligible, minParticipationPct) && 3 * yes >= 2 * cast;
}

/**
 * Where the vote stands. It settles early once the result cannot change:
 * passed if ⅔ of every eligible member already said yes, rejected if even
 * a yes from everyone left could not reach ⅔. Otherwise it waits for the
 * deadline, and at the deadline it passes or fails on the votes cast.
 */
export function removalOutcome(tally: RemovalTally, deadlinePassed: boolean): RemovalVoteStatus {
  const { yes, no } = tally;
  const eligible = Math.max(tally.eligible, yes + no);
  if (eligible === 0) return 'rejected';
  const remaining = eligible - yes - no;
  const quorum = removalQuorum(eligible, tally.minParticipationPct);

  // ⅔ of everyone already said yes: no number of late "no" votes changes it.

  if (3 * yes >= 2 * eligible && yes >= quorum) return 'passed';
  // More than a third of everyone said no: ⅔ is out of reach for good.
  if (3 * (yes + remaining) < 2 * eligible) return 'rejected';
  if (!deadlinePassed) return 'open';
  return removalPasses({ ...tally, eligible }) ? 'passed' : 'rejected';
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
