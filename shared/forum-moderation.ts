/**
 * Who takes a post down, and on what evidence.
 *
 * A managed community has administrators and they decide. An autonomous
 * community has none — by its own definition, not by omission — so the
 * members decide, the same way they decide every other rule there: by
 * majority of those who bothered to vote, with ties keeping the current
 * state (see shared/governable-settings.ts).
 *
 * Two guards keep that from being a heckler's veto:
 *
 *   MIN_FLAG_VOTES — one offended member cannot hide a post 1–0. A verdict
 *   needs a quorum, however small, so that "the members decided" is true.
 *
 *   strictly more hide than keep — a tie leaves the post standing. Silence is
 *   not consent to removal, and the burden sits with whoever wants the text
 *   gone, not with whoever wrote it.
 *
 * The rule is pure and lives here so both the server and the tests read the
 * same sentence, and so nobody has to reconstruct the threshold from a SQL
 * query when they wonder why something disappeared.
 */

export const MIN_FLAG_VOTES = 3;

export type FlagDirection = 'hide' | 'keep';

export interface FlagTally {
  hide: number;
  keep: number;
}

/** Verdict of the members on a reported post. */
export function shouldHideByFlags(tally: FlagTally): boolean {
  const cast = tally.hide + tally.keep;
  if (cast < MIN_FLAG_VOTES) return false;
  return tally.hide > tally.keep;
}

/**
 * How many more `hide` votes would be needed before the post comes down.
 * Shown to members so a moderation vote is never a black box: they can see
 * whether their vote is the one that decides.
 */
export function flagVotesRemaining(tally: FlagTally): number {
  if (shouldHideByFlags(tally)) return 0;
  // Each further `hide` adds one to both the cast count and the margin, so
  // step forward until both conditions hold rather than solving two
  // inequalities and getting one of them subtly wrong.
  let hide = tally.hide;
  let needed = 0;
  while (!shouldHideByFlags({ hide, keep: tally.keep })) {
    hide += 1;
    needed += 1;
    // A community cannot produce an unbounded number of votes; this only
    // guards against a caller passing nonsense.
    if (needed > 10_000) return needed;
  }
  return needed;
}

export function isFlagDirection(value: unknown): value is FlagDirection {
  return value === 'hide' || value === 'keep';
}
