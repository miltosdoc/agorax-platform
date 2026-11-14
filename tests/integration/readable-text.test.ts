/** Proposal text laid out for reading (shared/readable-text.ts), never reworded. */
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { looksHardWrapped, readableBlocks, readableOutline } from '../../shared/readable-text';

const words = (s: string) => s.replace(/\*\*/g, '').match(/[\p{L}\p{N}]+/gu) ?? [];
const blockWords = (text: string) => readableBlocks(text).flatMap((b) => words(
  'text' in b ? b.text : `${'marker' in b ? b.marker : ''} ${b.lines.join(' ')}`));

describe('readableBlocks', () => {
  it('reads a statute: title, chapters, articles, numbered and lettered points', () => {
    const text = [
      'Καταστατικό ΕΜΕΙΣ', '',
      'ΚΕΦΑΛΑΙΟ Α΄ – Αρχές', '',
      '**Άρθρο 1, βασικές αρχές.**', '',
      '1. Πρώτη αρχή.', '2. Δεύτερη αρχή:', 'α) ένα,', 'β) δύο.', '',
      'Άρθρο 2ο', 'ΛΗΨΗ ΑΠΟΦΑΣΕΩΝ', 'Αποφασίζουμε μαζί.',
    ].join('\n');
    const b = readableBlocks(text);
    expect(b.map((x) => x.kind)).toEqual(['title', 'chapter', 'article', 'item', 'item', 'item', 'item', 'article', 'paragraph']);
    expect(b[2]).toMatchObject({ kind: 'article', number: '1', text: 'Άρθρο 1, βασικές αρχές.', id: 'article-1' });
    expect(b[5]).toMatchObject({ marker: 'α)', depth: 1, lines: ['ένα,'] });
    expect(b[7]).toMatchObject({ text: 'Άρθρο 2ο ΛΗΨΗ ΑΠΟΦΑΣΕΩΝ' });
    expect(readableOutline(b).map((x) => x.kind)).toEqual(['chapter', 'article', 'article']);
  });

  it('keeps the author’s line breaks in ordinary text', () => {
    const text = 'Προτείνω:\nπράσινο\nμπλε\n\nΜε εκτίμηση,\nΜαρία';
    const b = readableBlocks(text);
    expect(b).toEqual([
      { kind: 'paragraph', lines: ['Προτείνω:', 'πράσινο', 'μπλε'] },
      { kind: 'paragraph', lines: ['Με εκτίμηση,', 'Μαρία'] },
    ]);
  });

  it('joins lines a PDF broke mid-sentence, and a word split by a hyphen', () => {
    const wrapped = Array.from({ length: 8 }, (_, i) =>
      `${i}. Σύμφωνα με τις διατάξεις του νόμου η Γενική Συνέλευση συνέρχεται σε τακτική\nσυνεδρίαση μία φορά το έτος ύστερα από πρόσκληση της Διοικούσας Επιτρο-\nπής και μέσα σε τρεις μήνες.`).join('\n');
    expect(looksHardWrapped(wrapped.split('\n'))).toBe(true);
    const first = readableBlocks(wrapped)[0];
    expect(first).toMatchObject({ kind: 'item', marker: '0.' });
    expect((first as { lines: string[] }).lines).toEqual([
      'Σύμφωνα με τις διατάξεις του νόμου η Γενική Συνέλευση συνέρχεται σε τακτική συνεδρίαση μία φορά το έτος ύστερα από πρόσκληση της Διοικούσας Επιτροπής και μέσα σε τρεις μήνες.',
    ]);
  });

  it('gives repeated article numbers distinct anchors', () => {
    const b = readableBlocks('Άρθρο 3ο (για Α)\nx\nΆρθρο 3ο (για Β)\ny');
    expect(readableOutline(b).map((x) => (x as { id: string }).id)).toEqual(['article-3', 'article-3-2']);
  });

  const sample = '/tmp/claude-0/-root/829eeb38-0369-45d2-9680-56f612161c97/scratchpad/koinsep.txt';
  it.runIf(existsSync(sample))('loses no word of a long pasted statute', () => {
    const text = readFileSync(sample, 'utf8');
    const out = blockWords(text).join(' ');
    // Only hyphenated line ends join two halves into one word.
    expect(words(text).filter((w) => !out.includes(w))).toEqual([]);
  });
});
