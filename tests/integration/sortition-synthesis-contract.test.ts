/**
 * Synthesis jury contract tests.
 *
 * The charter tells members how a jury that writes a final text is drawn:
 * its size, its time, and when it is drawn at all. These tests pin that the
 * draw reads the same settings the charter states, that the deadline job and
 * the manual advance apply one rule, and that the jurors are told.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { synthesisJuryTerms } from '../../shared/community-settings';

type BuildArticles = typeof import('../../server/utils/constitution').buildArticles;
let buildArticles: BuildArticles;

beforeAll(async () => {
  // constitution.ts imports the DB pool, which only connects on first query.
  process.env.DATABASE_URL ??= 'postgres://unused@127.0.0.1:1/unused';
  ({ buildArticles } = await import('../../server/utils/constitution'));
});

const source = (path: string) => readFileSync(join(__dirname, '../..', path), 'utf8');

function finalTextArticle(overrides: Record<string, unknown>, lang: 'el' | 'en' = 'el'): string {
  const community = {
    id: 1,
    name: 'Test',
    type: 'autonomous',
    synthesisMode: 'sortition',
    sortitionSize: 40,
    sortitionMode: 'absolute',
    sortitionResponseHours: 48,
    amendmentThreshold: '0.5',
    amendmentInclusionThreshold: '0.6',
    ...overrides,
  };
  const articles = buildArticles(community as any, lang);
  const article = articles.find(a => a.title === (lang === 'el' ? 'Τελικό κείμενο' : 'Final text'));
  if (!article) throw new Error('no final-text article');
  return article.body;
}

describe('synthesisJuryTerms', () => {
  it('passes the community settings through, with no cap below the setting', () => {
    expect(synthesisJuryTerms({ sortitionSize: 120, sortitionMode: 'absolute', sortitionResponseHours: 48 }))
      .toEqual({ size: 120, mode: 'absolute', responseHours: 48 });
  });

  it('falls back to the platform defaults for NULL columns', () => {
    expect(synthesisJuryTerms({ sortitionSize: null, sortitionMode: null, sortitionResponseHours: null }))
      .toEqual({ size: 12, mode: 'absolute', responseHours: 72 });
  });

  it('reads percentage mode, and anything unknown as absolute', () => {
    expect(synthesisJuryTerms({ sortitionMode: 'percentage' }).mode).toBe('percentage');
    expect(synthesisJuryTerms({ sortitionMode: 'bogus' }).mode).toBe('absolute');
  });
});

describe('charter: final text', () => {
  it('states the jury size, time and trigger from the settings', () => {
    const el = finalTextArticle({});
    expect(el).toContain('σώμα 40 μελών');
    expect(el).toContain('2 ημέρες');
    // threshold 0.5 on the net score = 75% of those who voted.
    expect(el).toContain('75%');
    expect(el).toContain('τουλάχιστον 3 ψήφους');
    expect(el).toContain('συντίθεται αυτόματα');

    const en = finalTextArticle({}, 'en');
    expect(en).toContain('a jury of 40 members');
    expect(en).toContain('2 days');
    expect(en).toContain('75%');
  });

  it('states a percentage jury with its floor, capped at 100%', () => {
    expect(finalTextArticle({ sortitionMode: 'percentage', sortitionSize: 10 }))
      .toContain('με το 10% των μελών (τουλάχιστον 3)');
    expect(finalTextArticle({ sortitionMode: 'percentage', sortitionSize: 150 }))
      .toContain('με το 100% των μελών');
  });

  it('follows the amendment threshold', () => {
    expect(finalTextArticle({ amendmentThreshold: '0.2' })).toContain('60%');
  });

  it('says nothing about a jury when the community merges with AI', () => {
    const el = finalTextArticle({ synthesisMode: 'ai' });
    expect(el).not.toContain('κληρώνεται');
    expect(el).toContain('συντίθεται αυτόματα');
  });
});

describe('the draw does what the charter says', () => {
  it('draws with the community settings, not a fixed size', () => {
    const handlers = source('server/utils/job-handlers.ts');
    expect(handlers).toMatch(/synthesisJuryTerms\(community\)/);
    expect(handlers).toMatch(/\{ mode, responseHours \}/);
    expect(source('server/utils/proposal-state-machine.ts'))
      .toMatch(/enqueueCreateSortition\(proposal\.communityId, proposal\.id, 'text_synthesis'\)/);
  });

  it('does not cap the jury below the setting', () => {
    expect(source('server/utils/sortition.ts')).not.toMatch(/Math\.min\(23/);
  });

  it('applies one rule whether the deadline or a person closes co-drafting', () => {
    expect(source('server/utils/job-handlers.ts')).toMatch(/shouldDrawSynthesisJury\(proposal\)/);
    expect(source('server/routers/proposals.ts')).toMatch(/shouldDrawSynthesisJury\(proposal\)/);
  });

  it('tells the jurors they were drawn', () => {
    expect(source('server/utils/job-handlers.ts')).toMatch(/notifySortitionMembers\(result\.bodyId/);
  });

  it('closes the jury when the vote opens, and never swaps members as it closes', () => {
    const machine = source('server/utils/proposal-state-machine.ts');
    const toVoting = machine.slice(machine.indexOf("case 'sortition_synthesis->voting':"));
    expect(toVoting.slice(0, 800)).toMatch(/eq\(sortitionBodies\.purpose, 'text_synthesis'\)/);
    expect(source('server/utils/job-handlers.ts')).not.toMatch(/replaceNonRespondingMembers/);
  });
});
