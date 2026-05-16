/**
 * Democracy Points — schedule logic + participation-hook wiring.
 *
 * The award engine's runtime behaviour (idempotency, caps, balances) is
 * covered by scripts/points-smoke.ts against a live DB; here we pin the
 * pure schedule and that every participation hook is wired.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { POINT_SCHEDULE, publishedSchedule } from '../../server/economy/schedule';

describe('Democracy Points — schedule', () => {
  it('defines the five participation actions', () => {
    expect(Object.keys(POINT_SCHEDULE).sort()).toEqual([
      'amendment',
      'proposal_validated',
      'ratification_vote',
      'signal_vote',
      'sortition_score',
    ]);
  });

  it('rewards substantive labour most, a one-tap action least', () => {
    expect(POINT_SCHEDULE.sortition_score.points).toBeGreaterThan(
      POINT_SCHEDULE.proposal_validated.points,
    );
    expect(POINT_SCHEDULE.proposal_validated.points).toBeGreaterThan(
      POINT_SCHEDULE.ratification_vote.points,
    );
    expect(POINT_SCHEDULE.ratification_vote.points).toBeGreaterThan(
      POINT_SCHEDULE.signal_vote.points,
    );
  });

  it('publishes the schedule ordered high → low', () => {
    const pts = publishedSchedule().map((r) => r.points);
    expect(pts).toEqual([...pts].sort((a, b) => b - a));
  });

  it('caps the farmable actions; idempotency covers one-per-target ones', () => {
    expect(POINT_SCHEDULE.proposal_validated.cap).toBeDefined();
    expect(POINT_SCHEDULE.amendment.cap).toBeDefined();
    expect(POINT_SCHEDULE.ratification_vote.cap).toBeUndefined();
    expect(POINT_SCHEDULE.sortition_score.cap).toBeUndefined();
  });
});

describe('Democracy Points — participation hooks are wired', () => {
  const root = join(__dirname, '../..');
  const read = (p: string) => readFileSync(join(root, p), 'utf8');

  it('awards on a ratification vote', () => {
    const src = read('server/routers/proposals.ts');
    expect(src).toContain('awardPoints');
    expect(src).toContain("actionKey: 'ratification_vote'");
  });

  it('awards on an amendment contribution', () => {
    const src = read('server/routers/amendments.ts');
    expect(src).toContain('awardPoints');
    expect(src).toContain("actionKey: 'amendment'");
  });

  it('awards sortition jury service', () => {
    const src = read('server/routers/sortition.ts');
    expect(src).toContain("actionKey: 'sortition_score'");
  });

  it('awards a community-signal vote', () => {
    expect(read('server/utils/amendment-processor.ts')).toContain(
      "actionKey: 'signal_vote'",
    );
  });

  it('awards a proposal that passes validation', () => {
    expect(read('server/utils/proposal-state-machine.ts')).toContain(
      "actionKey: 'proposal_validated'",
    );
  });

  it('registers the economy router', () => {
    expect(read('server/routes.ts')).toContain('registerEconomyRoutes');
  });
});
