import { describe, expect, it } from 'vitest';
import {
  directRemovalBlocker,
  removalModeFor,
  removalOutcome,
  removalPasses,
  removalQuorum,
} from '../../shared/member-removal';

describe('member removal — who decides', () => {
  it('managed communities use admins, everything else votes', () => {
    expect(removalModeFor('managed')).toBe('admin');
    expect(removalModeFor('autonomous')).toBe('vote');
    expect(removalModeFor(undefined)).toBe('vote');
  });

  it('admins remove members, only the founder removes admins, nobody removes the founder', () => {
    expect(directRemovalBlocker('admin', 'member')).toBeNull();
    expect(directRemovalBlocker('founder', 'admin')).toBeNull();
    expect(directRemovalBlocker('admin', 'admin')).toBe('admin_needs_founder');
    expect(directRemovalBlocker('founder', 'founder')).toBe('founder');
    expect(directRemovalBlocker('member', 'member')).toBe('not_admin');
    expect(directRemovalBlocker('admin', undefined)).toBe('not_member');
  });
});

describe('member removal — the vote', () => {
  it('quorum is at least 3 voters, capped at community size, raised by the community setting', () => {
    expect(removalQuorum(0, 0)).toBe(0);
    expect(removalQuorum(2, 0)).toBe(2);
    expect(removalQuorum(50, 0)).toBe(3);
    expect(removalQuorum(50, '20')).toBe(10);
  });

  it('needs two thirds of votes cast', () => {
    expect(removalPasses({ yes: 2, no: 1, eligible: 20 })).toBe(true);
    expect(removalPasses({ yes: 3, no: 2, eligible: 20 })).toBe(false);
    expect(removalPasses({ yes: 2, no: 0, eligible: 20 })).toBe(false); // below quorum of 3
  });

  it('stays open until the result is certain or time runs out', () => {
    expect(removalOutcome({ yes: 1, no: 0, eligible: 10 }, false)).toBe('open');
    expect(removalOutcome({ yes: 1, no: 0, eligible: 10 }, true)).toBe('rejected');
    expect(removalOutcome({ yes: 4, no: 1, eligible: 10 }, true)).toBe('passed');
  });

  it('passes early once two thirds of everyone said yes', () => {
    expect(removalOutcome({ yes: 7, no: 0, eligible: 10 }, false)).toBe('passed');
    expect(removalOutcome({ yes: 6, no: 0, eligible: 10 }, false)).toBe('open');
  });

  it('fails early once more than a third of everyone said no', () => {
    expect(removalOutcome({ yes: 1, no: 4, eligible: 10 }, false)).toBe('rejected');
    expect(removalOutcome({ yes: 1, no: 3, eligible: 10 }, false)).toBe('open');
  });

  it('early results never contradict what the deadline would decide', () => {
    for (let eligible = 1; eligible <= 12; eligible++) {
      for (let yes = 0; yes <= eligible; yes++) {
        for (let no = 0; yes + no <= eligible; no++) {
          const early = removalOutcome({ yes, no, eligible }, false);
          if (early === 'open') continue;
          // Whatever the rest do, the deadline result must match.
          const rest = eligible - yes - no;
          for (let lateYes = 0; lateYes <= rest; lateYes++) {
            for (let lateNo = 0; lateYes + lateNo <= rest; lateNo++) {
              expect(removalOutcome({ yes: yes + lateYes, no: no + lateNo, eligible }, true)).toBe(early);
            }
          }
        }
      }
    }
  });

  it('a two-person community: the other member decides alone', () => {
    expect(removalOutcome({ yes: 1, no: 0, eligible: 1 }, false)).toBe('passed');
  });

  it('nobody eligible means nothing to decide', () => {
    expect(removalOutcome({ yes: 0, no: 0, eligible: 0 }, false)).toBe('rejected');
  });
});
