/**
 * The statute editor's model (shared/statute-doc.ts) and the AI's operations
 * on it (server/utils/statute-structurer.ts): cards to text and back, and
 * operations that cut bodies from the author's own lines.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  composeStatuteDoc, nextNumber, parseStatuteDoc, renumberArticles, repeatedNumbers, type StatuteDoc,
} from '../../shared/statute-doc';
import { statuteSections } from '../../shared/statute-articles';
import { buildArticleBallot } from '../../shared/article-ballot';

vi.mock('../../server/utils/llm-client', () => ({ chatCompletion: vi.fn(), LlmUnavailableError: class extends Error {} }));
const { applyStatuteOps } = await import('../../server/utils/statute-structurer');

const doc: StatuteDoc = {
  title: 'Καταστατικό ΕΜΕΙΣ',
  intro: 'Οι ιδρυτές συμφωνούν:',
  blocks: [
    { kind: 'chapter', title: 'Αρχές' },
    { kind: 'article', number: '1', title: 'Βασικές αρχές', body: '1. Πρώτη.\n2. Δεύτερη.' },
    { kind: 'article', number: '2', title: 'Αποφάσεις', body: 'Με σύγκλιση.' },
    { kind: 'chapter', title: 'Μέλη' },
    { kind: 'article', number: '3', title: 'Νέα μέλη', body: 'Με συνάντηση.' },
  ],
};

describe('composeStatuteDoc / parseStatuteDoc', () => {
  it('writes the one heading form, chapters above their first article', () => {
    expect(composeStatuteDoc(doc)).toBe([
      'Καταστατικό ΕΜΕΙΣ', '', 'Οι ιδρυτές συμφωνούν:', '',
      'ΚΕΦΑΛΑΙΟ Α΄ – Αρχές', '', 'Άρθρο 1 - Βασικές αρχές', '1. Πρώτη.', '2. Δεύτερη.', '',
      'Άρθρο 2 - Αποφάσεις', 'Με σύγκλιση.', '',
      'ΚΕΦΑΛΑΙΟ Β΄ – Μέλη', '', 'Άρθρο 3 - Νέα μέλη', 'Με συνάντηση.',
    ].join('\n'));
  });

  it('reads its own text back into the same cards', () => {
    expect(parseStatuteDoc(composeStatuteDoc(doc))).toEqual(doc);
  });

  it('gives the ballot one question per article, chapters riding with their article', () => {
    const text = composeStatuteDoc(doc);
    expect(statuteSections(text)!.filter((s) => s.heading).map((s) => s.ref)).toEqual(['1', '2', '3']);
    const ballot = buildArticleBallot(text, text, [])!;
    expect(ballot.articles.map((a) => a.heading)).toEqual(['Άρθρο 1 - Βασικές αρχές', 'Άρθρο 2 - Αποφάσεις', 'Άρθρο 3 - Νέα μέλη']);
    expect(ballot.articles[2].versions[0]).toContain('ΚΕΦΑΛΑΙΟ Β΄ – Μέλη');
  });

  it('numbers new articles after the highest and renumbers only on request', () => {
    const gap: StatuteDoc = { ...doc, blocks: doc.blocks.filter((b) => !(b.kind === 'article' && b.number === '2')) };
    expect(nextNumber(gap)).toBe('4');
    expect(renumberArticles(gap).blocks.filter((b) => b.kind === 'article').map((b) => (b as { number: string }).number)).toEqual(['1', '2']);
  });

  it('shows repeated numbers instead of refusing the text', () => {
    const text = 'Πρότυπο\nΆρθρο 1 - Α\nx\nΆρθρο 2ο (για Α)\ny\nΆρθρο 2ο (για Β)\nz';
    expect(statuteSections(text)).toBeNull();
    const d = parseStatuteDoc(text)!;
    expect(repeatedNumbers(d)).toEqual(['2']);
  });
});

describe('applyStatuteOps', () => {
  const lines = [
    'Καταστατικό', 'Οι ιδρυτές:', 'ΚΕΦΑΛΑΙΟ Α΄ ΑΡΧΕΣ', 'Άρθρο 1ο ΣΚΟΠΟΣ', 'Ο σκοπός είναι κοινός.',
    'Άρθρο 2ο', 'ΑΠΟΦΑΣΕΙΣ', 'Αποφασίζουμε μαζί.', 'Με πλειοψηφία.', 'ΤΑ ΙΔΡΥΤΙΚΑ ΜΕΛΗ', '1) …',
  ];
  const plan = {
    preamble: [1, 2] as [number, number],
    ops: [
      { op: 'add_chapter' as const, title: 'Αρχές' },
      { op: 'add_article' as const, number: '1', title: 'Σκοπός', from: 5, to: 5 },
      { op: 'add_article' as const, number: '2', title: 'Αποφάσεις', from: 8, to: 9 },
    ],
  };

  it('cuts bodies from the lines and keeps the tail with the last article', () => {
    const out = applyStatuteOps(lines, plan, true, true);
    expect('text' in out && out.text).toBe([
      'Καταστατικό\nΟι ιδρυτές:', '', 'ΚΕΦΑΛΑΙΟ Α΄ – Αρχές', '', 'Άρθρο 1 - Σκοπός', 'Ο σκοπός είναι κοινός.', '',
      'Άρθρο 2 - Αποφάσεις', 'Αποφασίζουμε μαζί.', 'Με πλειοψηφία.', 'ΤΑ ΙΔΡΥΤΙΚΑ ΜΕΛΗ', '1) …',
    ].join('\n'));
  });

  it('asks again when content would be left out, and never loses it on the last round', () => {
    const skipping = { ...plan, ops: [plan.ops[0], plan.ops[1], { ...plan.ops[2], from: 9 }] };
    const first = applyStatuteOps(lines, skipping, false, true);
    expect('errors' in first && first.errors.join(' ')).toContain('8');
    const last = applyStatuteOps(lines, skipping, true, true);
    expect('text' in last && last.text).toContain('Αποφασίζουμε μαζί.\nΜε πλειοψηφία.');
  });

  it('refuses overlapping ranges', () => {
    const overlap = { ...plan, ops: [plan.ops[1], { ...plan.ops[2], from: 5 }] };
    expect('errors' in applyStatuteOps(lines, overlap, true, true)).toBe(true);
  });

  it('numbers 1, 2, 3 when the text has no numbers of its own', () => {
    const ones = { preamble: null, ops: [
      { op: 'add_article' as const, number: '1', title: 'Α', from: 5, to: 5 },
      { op: 'add_article' as const, number: '1', title: 'Β', from: 8, to: 11 },
    ] };
    const out = applyStatuteOps(lines, ones, true, false);
    expect('text' in out && statuteSections(out.text)!.filter((s) => s.heading).map((s) => s.ref)).toEqual(['1', '2']);
  });
});
