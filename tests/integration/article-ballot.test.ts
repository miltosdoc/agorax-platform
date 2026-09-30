/**
 * Article-by-article ballot contract tests.
 *
 * A statute is voted «κατ' άρθρο και στο σύνολο»: one question on the
 * whole, one per article, versions A/B where co-drafting produced a
 * counter-proposal. The answers travel as one choice string through the
 * ordinary anonymous machinery. These pin the encoding, the tally rules
 * (the statute majority per article, plurality between versions, adoption
 * only when the whole carries) and how the ballot is built from the text.
 */

import { describe, expect, it } from 'vitest';
import {
  adoptedText,
  buildArticleBallot,
  decodeArticleChoice,
  encodeArticleChoice,
  isArticleBallot,
  rejectedArticles,
  tallyArticleBallot,
  type ArticleBallot,
} from '../../shared/article-ballot';
import { proposalVoteChoiceSchema } from '../../shared/schema';

const ORIGINAL = [
  'ΚΑΤΑΣΤΑΤΙΚΟ',
  '',
  'Άρθρο 1 - Επωνυμία',
  'Ιδρύεται σωματείο.',
  '',
  'Άρθρο 2 - Σκοπός',
  'Η δημοκρατία.',
  '',
  'Άρθρο 3 - Μέλη',
  'Ενήλικα πρόσωπα.',
].join('\n');

// Co-drafting changed article 2.
const FINAL = ORIGINAL.replace('Η δημοκρατία.', 'Η άμεση δημοκρατία.');
// A counter-proposal on article 3, as the complete alternative text.
const COUNTER_3 = FINAL.replace('Ενήλικα πρόσωπα.', 'Κάθε πρόσωπο άνω των 16.');

function ballot(): ArticleBallot {
  return buildArticleBallot(FINAL, ORIGINAL, [{ id: 42, articleRef: '3', text: COUNTER_3 }])!;
}

describe('article ballot — building', () => {
  it('puts each article to the vote, with versions where there is a counter-proposal', () => {
    const b = ballot();
    expect(isArticleBallot(b)).toBe(true);
    expect(b.preamble).toBe('ΚΑΤΑΣΤΑΤΙΚΟ');
    expect(b.articles.map((q) => q.ref)).toEqual(['1', '2', '3']);
    expect(b.articles.map((q) => q.changed)).toEqual([false, true, false]);
    expect(b.articles[2].versions).toEqual(['Άρθρο 3 - Μέλη\nΕνήλικα πρόσωπα.', 'Άρθρο 3 - Μέλη\nΚάθε πρόσωπο άνω των 16.']);
    expect(b.articles[2].counterIds).toEqual([42]);
  });

  it('adds a counter-proposal for a new article as a question of its own', () => {
    const withNew = `${FINAL}\n\nΆρθρο 4 - Πόροι\nΣυνδρομές.`;
    const b = buildArticleBallot(FINAL, ORIGINAL, [{ id: 7, articleRef: 'new', text: withNew }])!;
    expect(b.articles.map((q) => q.ref)).toEqual(['1', '2', '3', '4']);
    expect(b.articles[3]).toMatchObject({ versions: ['Άρθρο 4 - Πόροι\nΣυνδρομές.'], counterIds: [7] });
  });

  it('stays an ordinary ballot when the text has no articles or a counter names none', () => {
    expect(buildArticleBallot('Να φτιαχτεί ποδηλατόδρομος.', '', [])).toBeNull();
    expect(buildArticleBallot(FINAL, ORIGINAL, [{ id: 1, articleRef: null, text: COUNTER_3 }])).toBeNull();
    expect(buildArticleBallot(FINAL, ORIGINAL, [{ id: 1, articleRef: '9', text: COUNTER_3 }])).toBeNull();
  });
});

describe('article ballot — the choice string', () => {
  it('round-trips every answer', () => {
    const b = ballot();
    const choice = encodeArticleChoice(b, { whole: 'yes', articles: [0, 'no', 1] });
    expect(choice).toBe('art_yynb');
    expect(decodeArticleChoice(b, choice)).toEqual({ whole: 'yes', articles: [0, 'no', 1] });
  });

  it('counts an unanswered article as an abstention', () => {
    expect(encodeArticleChoice(ballot(), { whole: 'no', articles: [0] })).toBe('art_nyaa');
  });

  it('reads a plain yes/no/abstain as an answer on the whole alone', () => {
    // Cast from a page loaded before the ballot was frozen.
    expect(decodeArticleChoice(ballot(), 'yes')).toEqual({ whole: 'yes', articles: ['abstain', 'abstain', 'abstain'] });
  });

  it('refuses a string that is not a ballot for this statute', () => {
    const b = ballot();
    expect(decodeArticleChoice(b, 'final')).toBeNull();
    expect(decodeArticleChoice(b, 'art_yyy')).toBeNull(); // one answer short
    expect(decodeArticleChoice(b, 'art_yybb')).toBeNull(); // article 2 has no version B
    expect(decodeArticleChoice(b, 'art_xyyy')).toBeNull();
  });

  it('fits the vote machinery for a long statute', () => {
    const long: ArticleBallot = {
      preamble: '',
      articles: Array.from({ length: 120 }, (_, i) => ({
        ref: String(i + 1), heading: `Άρθρο ${i + 1}`, versions: ['x'], counterIds: [], changed: false,
      })),
    };
    const choice = encodeArticleChoice(long, { whole: 'yes', articles: [] });
    expect(proposalVoteChoiceSchema.safeParse(choice).success).toBe(true);
  });
});

describe('article ballot — the tally', () => {
  it('passes an article on the statute majority and picks the version with most votes', () => {
    const b = ballot();
    const tally = tallyArticleBallot(b, {
      art_yyyb: 5, // whole yes, 1 A, 2 A, 3 B
      art_yynb: 2, // whole yes, 1 A, 2 No, 3 B
      art_nnny: 1, // whole no, 1 No, 2 No, 3 A
      art_aaaa: 3, // abstains throughout
    }, 'two_thirds');
    expect(tally.whole).toEqual({ yes: 7, no: 1, abstain: 3 });
    const [a1, a2, a3] = tally.articles;
    expect(a1).toMatchObject({ versions: [7], no: 1, abstain: 3, passes: true, winner: 0 });
    expect(a2).toMatchObject({ versions: [5], no: 3, passes: false, winner: null });
    expect(a3).toMatchObject({ versions: [1, 7], no: 0, passes: true, winner: 1 });
  });

  it('gives a tie between versions to A, the co-drafted text', () => {
    const tally = tallyArticleBallot(ballot(), { art_yyyy: 2, art_yyyb: 2 }, 'simple');
    expect(tally.articles[2]).toMatchObject({ versions: [2, 2], winner: 0 });
  });

  it('ignores anything that is not a ballot for this statute', () => {
    const tally = tallyArticleBallot(ballot(), { final: 4, art_zzzz: 1, yes: 2 }, 'simple');
    expect(tally.whole).toEqual({ yes: 2, no: 0, abstain: 0 });
    expect(tally.articles[0]).toMatchObject({ versions: [0], no: 0, abstain: 2 });
  });

  it('writes the adopted statute from the adopted articles in their winning versions', () => {
    const b = ballot();
    const tally = tallyArticleBallot(b, { art_yyyb: 5, art_yynb: 2, art_nnny: 1 }, 'two_thirds');
    for (const r of tally.articles) r.adopted = r.passes; // the whole carried
    expect(adoptedText(b, tally.articles)).toBe(
      'ΚΑΤΑΣΤΑΤΙΚΟ\n\nΆρθρο 1 - Επωνυμία\nΙδρύεται σωματείο.\n\nΆρθρο 3 - Μέλη\nΚάθε πρόσωπο άνω των 16.',
    );
    expect(rejectedArticles(b, tally.articles).map((q) => q.ref)).toEqual(['2']);
  });

  it('adopts nothing when the whole fails', () => {
    const b = ballot();
    const tally = tallyArticleBallot(b, { art_nyyy: 3 }, 'simple');
    expect(adoptedText(b, tally.articles)).toBe('');
  });
});
