/**
 * Ballot-choice invariant (QA checklist Γ.3α).
 *
 * A vote's choice must always be validated against the proposal's actual
 * ballot — classic yes/no/abstain, the ballotOptions list built from
 * deliberation alternatives, or a statute's article-by-article ballot.
 * Pins both the pure function and the wiring: every vote-casting route in
 * proposals.ts must consult the proposal's ballot (ballotRefusal, which
 * falls back to validBallotChoices) before recording a vote.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BALLOT_CHOICE_MAX_LENGTH,
  CLASSIC_BALLOT_CHOICES,
  proposalVoteChoiceSchema,
  validBallotChoices,
} from '../../shared/schema';

describe('validBallotChoices', () => {
  it('defaults to the classic trio when a proposal has no ballotOptions', () => {
    expect(validBallotChoices({})).toEqual(['yes', 'no', 'abstain']);
    expect(validBallotChoices({ ballotOptions: null })).toEqual([...CLASSIC_BALLOT_CHOICES]);
    expect(validBallotChoices({ ballotOptions: [] })).toEqual([...CLASSIC_BALLOT_CHOICES]);
  });

  it('returns exactly the configured option ids for option ballots', () => {
    const proposal = {
      ballotOptions: [
        { id: 'final', label: 'Τελικό κείμενο' },
        { id: 'counter_12', label: 'Αντιπρόταση' },
        { id: 'status_quo', label: 'Καμία αλλαγή' },
      ],
    };
    expect(validBallotChoices(proposal)).toEqual(['final', 'counter_12', 'status_quo']);
    // classic ids are NOT valid on an option ballot
    expect(validBallotChoices(proposal)).not.toContain('yes');
  });

  it('never returns an empty choice set', () => {
    for (const opts of [undefined, null, [], 'garbage', 42]) {
      expect(validBallotChoices({ ballotOptions: opts as unknown }).length).toBeGreaterThan(0);
    }
  });
});

describe('proposalVoteChoiceSchema shape', () => {
  it('accepts well-formed choice ids', () => {
    for (const good of ['yes', 'status_quo', 'counter_12']) {
      expect(proposalVoteChoiceSchema.safeParse(good).success).toBe(true);
    }
  });

  it('rejects malformed or dangerous input', () => {
    for (const bad of ['', 'YES', 'a b', 'x'.repeat(BALLOT_CHOICE_MAX_LENGTH + 1), "1;drop table votes", '<script>']) {
      expect(proposalVoteChoiceSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('vote route wiring', () => {
  it('every vote-casting route validates against the proposal\'s ballot', () => {
    const src = readFileSync(
      resolve(__dirname, '../../server/routers/proposals.ts'),
      'utf8',
    );
    // Both casting endpoints exist…
    expect(src).toMatch(/app\.post\("\/api\/proposals\/:id\/vote"/);
    expect(src).toMatch(/app\.post\("\/api\/proposals\/:id\/anonymous-vote"/);
    // …and each consults the proposal's ballot before casting…
    const calls = src.match(/ballotRefusal\(proposal as any,/g) ?? []; // the two routes, not the definition
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // …which, for anything but an article ballot, is its option set.
    const helper = src.slice(src.indexOf('function ballotRefusal('), src.indexOf('function ballotRefusal(') + 800);
    expect(helper).toMatch(/validBallotChoices\(proposal\)/);
    expect(helper).toMatch(/decodeArticleChoice\(/);
  });
});
