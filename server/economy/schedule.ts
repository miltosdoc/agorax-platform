/**
 * The participation → Democracy Points schedule.
 *
 * A fixed, published table — every civic action worth points and how much.
 * Designed to be honest, not speculative:
 *  - points reward the *act* of well-formed participation, never the outcome
 *    (a vote earns the same yes/no/abstain; a proposal earns for passing
 *    validation, not for winning);
 *  - substantive labour (sortition jury service) pays far more than a click;
 *  - rolling-window caps blunt farming; idempotency (one award per action +
 *    target, enforced by a unique index) prevents double-claims.
 *
 * The point values are a governance decision — tune them here. Scale:
 * `economy.pointsPerEur` (default 100), so 600 points ≈ €6 of recorded
 * contribution.
 */

/** A rolling-window cap: at most `max` awards of this action per `windowDays`. */
export interface PointCap {
  windowDays: number;
  max: number;
}

/** One row of the published schedule. */
export interface PointRule {
  /** Stable key — also the `action_key` written to the ledger. */
  actionKey: string;
  /** Points awarded each time the action qualifies. */
  points: number;
  /** Human-readable description of what earns it. */
  label: string;
  /** Optional anti-farming cap. Idempotency already prevents double-claims. */
  cap?: PointCap;
}

export const POINT_SCHEDULE: Record<string, PointRule> = {
  sortition_score: {
    actionKey: 'sortition_score',
    points: 600,
    label: 'Serve on a sortition jury — confirm attendance and submit a score',
  },
  proposal_validated: {
    actionKey: 'proposal_validated',
    points: 200,
    label: 'Author a proposal that passes quality validation',
    cap: { windowDays: 30, max: 3 },
  },
  amendment: {
    actionKey: 'amendment',
    points: 80,
    label: 'Contribute an amendment that reaches author review',
    cap: { windowDays: 30, max: 10 },
  },
  ratification_vote: {
    actionKey: 'ratification_vote',
    points: 25,
    label: 'Cast a ballot in a proposal’s final ratification vote',
  },
  signal_vote: {
    actionKey: 'signal_vote',
    points: 10,
    label: 'Vote in a community-signal round on a rejected amendment',
  },
};

/** The schedule as an ordered list (highest-value first) — for the public API. */
export function publishedSchedule(): PointRule[] {
  return Object.values(POINT_SCHEDULE).sort((a, b) => b.points - a.points);
}
