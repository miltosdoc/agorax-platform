/**
 * Constitution: the statute in force.
 *
 * Approved statutes written in articles read as one statute: each article
 * in the wording of the latest decision that adopted it, in article order,
 * with the decision it comes from. Every other decision stays in the list.
 * The layout is pure; the database behind buildConstitution is not touched.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../server/db', () => ({ db: {} }));
vi.mock('../../server/utils/community-visibility', () => ({ canViewCommunityContentById: async () => true }));
vi.mock('../../server/utils/constitution-ai', () => ({
  aiAvailable: () => false, ensureArticles: () => {}, getCachedArticles: async () => new Map(), pendingCount: () => 0,
}));

const { layout } = await import('../../server/utils/constitution');
type Doc = Parameters<typeof layout>[0];

function doc(decisions: Doc['decisions']): Doc {
  return {
    communityId: 1, communityName: 'Δοκιμή', description: null, lang: 'el',
    articles: [{ title: 'Διακυβέρνηση', body: '…' }],
    decisions, ai: null, fingerprint: '', generatedAt: new Date(0).toISOString(),
  };
}

const decision = (proposalId: number, kind: 'statute' | 'decision', text: string, date: string) => ({
  proposalId, kind, question: `Πρόταση ${proposalId}`, text, result: 'Ναι 3', participation: '3', date,
});

describe('constitution — the statute in force', () => {
  it('takes each article from the latest decision that adopted it', () => {
    const l = layout(doc([
      decision(1, 'statute', 'ΚΑΤΑΣΤΑΤΙΚΟ\n\nΆρθρο 1 - Επωνυμία\nΑγορά.\n\nΆρθρο 2 - Σκοπός\nΗ δημοκρατία.', '2026-01-01'),
      decision(2, 'decision', 'Να γίνει γιορτή.', '2026-02-01'),
      decision(3, 'statute', 'Άρθρο 2 - Σκοπός\nΗ άμεση δημοκρατία.\n\nΆρθρο 10 - Πόροι\nΣυνδρομές.', '2026-03-01'),
    ]), 'raw');

    expect(l.parts.map((p) => p.heading)).toEqual(['Μέρος Α — Κανόνες', 'Μέρος Β — Καταστατικό', 'Μέρος Γ — Αποφάσεις']);
    const statute = l.parts[1].blocks;
    expect(statute.map((b) => b.heading)).toEqual(['Άρθρο 1 - Επωνυμία', 'Άρθρο 2 - Σκοπός', 'Άρθρο 10 - Πόροι']);
    expect(statute.map((b) => b.body)).toEqual(['Αγορά.', 'Η άμεση δημοκρατία.', 'Συνδρομές.']);
    expect(statute.map((b) => b.proposalId)).toEqual([1, 3, 3]);
    expect(l.parts[2].blocks.map((b) => b.proposalId)).toEqual([2]);
  });

  it('stays a plain list of decisions when no statute is written in articles', () => {
    const l = layout(doc([
      decision(1, 'statute', 'Τροποποιείται η έδρα σε Πειραιά.', '2026-01-01'),
      decision(2, 'decision', 'Να γίνει γιορτή.', '2026-02-01'),
    ]), 'raw');
    expect(l.parts.map((p) => p.heading)).toEqual(['Μέρος Α — Κανόνες', 'Μέρος Β — Αποφάσεις']);
    expect(l.parts[1].blocks.map((b) => b.proposalId)).toEqual([1, 2]);
  });
});
