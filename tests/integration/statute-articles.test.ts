/**
 * Statute articles contract tests.
 *
 * A statute is amended article by article: the articles are read from the
 * «Άρθρο N» headings, each amendment names one, and the merge rewrites only
 * the amended articles. These pin the parsing, the splice (every other
 * article byte for byte), and the merge's use of the LLM — which is stubbed,
 * so they check what it is asked and what is done with the answer.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NEW_ARTICLE_REF,
  PREAMBLE_REF,
  appendArticles,
  articleSectionsFor,
  isArticleRef,
  nextArticleNumber,
  opensWithHeading,
  replaceSections,
  sectionText,
  statuteSections,
} from '../../shared/statute-articles';

const chatCompletion = vi.fn();
vi.mock('../../server/utils/llm-client', () => ({
  chatCompletion: (...args: unknown[]) => chatCompletion(...args),
  isLlmConfigured: () => true,
  readLlmConfig: () => ({ url: 'http://llm.test', apiKey: 'test', model: 'test-model' }),
  LlmUnavailableError: class LlmUnavailableError extends Error {},
}));
vi.mock('../../server/db', () => ({ db: {} }));

const { mergeIntoText } = await import('../../server/utils/ai-merger');

const STATUTE = [
  'ΚΑΤΑΣΤΑΤΙΚΟ ΣΩΜΑΤΕΙΟΥ',
  'με την επωνυμία «Αγορά»',
  '',
  'Άρθρο 1 - Επωνυμία και έδρα',
  'Ιδρύεται σωματείο με έδρα την Αθήνα. Το άρθρο 5 του ν. 4624/2019 εφαρμόζεται.',
  '',
  'Άρθρο 2 - Σκοπός',
  'Σκοπός είναι η διάδοση της δημοκρατίας.',
  '',
  'Άρθρο 3: Μέλη',
  'Μέλη γίνονται ενήλικα φυσικά πρόσωπα.',
  '',
].join('\n');

describe('statute articles — reading the text', () => {
  it('finds the preamble and each article, from heading to heading', () => {
    const sections = statuteSections(STATUTE)!;
    expect(sections.map((s) => s.ref)).toEqual([PREAMBLE_REF, '1', '2', '3']);
    expect(sections[2].heading).toBe('Άρθρο 2 - Σκοπός');
    expect(sectionText(STATUTE, sections[2])).toBe('Άρθρο 2 - Σκοπός\nΣκοπός είναι η διάδοση της δημοκρατίας.');
    // The sections tile the text exactly.
    expect(sections.map((s) => STATUTE.slice(s.start, s.end)).join('')).toBe(STATUTE);
  });

  it('reads the headings pasted Word text brings', () => {
    const text = 'ΑΡΘΡΟ 1ο\nΑ.\n\n Άρθρο 2Α – Πόροι\nΒ.\n\nΆρθρο 3\nΓ.';
    expect(statuteSections(text)!.map((s) => s.ref)).toEqual(['1', '2Α', '3']);
  });

  it('takes a reference inside a paragraph for what it is', () => {
    const text = 'Άρθρο 1\nΚείμενο.\nΆρθρο 5 του ν. 4624/2019 ισχύει.\n\nΆρθρο 2\nΚείμενο.';
    expect(statuteSections(text)!.map((s) => s.ref)).toEqual(['1', '2']);
  });

  it('finds no articles in a text that is not laid out in them', () => {
    expect(statuteSections('Να φτιαχτεί ποδηλατόδρομος.')).toBeNull();
    expect(statuteSections('Άρθρο 1\nΜόνο ένα άρθρο.')).toBeNull();
    // The same number twice would leave an amendment's article ambiguous.
    expect(statuteSections('Άρθρο 1\nΑ.\n\nΆρθρο 1\nΒ.')).toBeNull();
  });

  it('amends article by article only in a statute', () => {
    expect(articleSectionsFor('statute', STATUTE)).not.toBeNull();
    expect(articleSectionsFor('decision', STATUTE)).toBeNull();
  });

  it('accepts an existing article, the preamble or a new article', () => {
    const sections = statuteSections(STATUTE)!;
    expect(isArticleRef(sections, '2')).toBe(true);
    expect(isArticleRef(sections, PREAMBLE_REF)).toBe(true);
    expect(isArticleRef(sections, NEW_ARTICLE_REF)).toBe(true);
    expect(isArticleRef(sections, '9')).toBe(false);
    expect(isArticleRef(sections, undefined)).toBe(false);
  });

  it('numbers a new article after the last one', () => {
    expect(nextArticleNumber(statuteSections(STATUTE)!)).toBe(4);
    expect(appendArticles(STATUTE, 'Άρθρο 4 - Πόροι\nΣυνδρομές.')).toBe(
      `${STATUTE.trimEnd()}\n\nΆρθρο 4 - Πόροι\nΣυνδρομές.\n`,
    );
  });

  it('knows a text that opens with its heading', () => {
    expect(opensWithHeading('\nΆρθρο 2 - Σκοπός\nΚείμενο.')).toBe(true);
    expect(opensWithHeading('Σκοπός είναι…')).toBe(false);
  });
});

describe('statute articles — splicing', () => {
  it('changes only the replaced article, byte for byte', () => {
    const sections = statuteSections(STATUTE)!;
    const out = replaceSections(STATUTE, sections, new Map([['2', 'Άρθρο 2 - Σκοπός\nΝέος σκοπός.']]));
    expect(out).toBe(STATUTE.replace('Σκοπός είναι η διάδοση της δημοκρατίας.', 'Νέος σκοπός.'));
  });

  it('gives the text back unchanged when an article is replaced by itself', () => {
    const sections = statuteSections(STATUTE)!;
    const same = new Map(sections.map((s) => [s.ref, sectionText(STATUTE, s)]));
    expect(replaceSections(STATUTE, sections, same)).toBe(STATUTE);
  });
});

describe('statute articles — merging', () => {
  beforeEach(() => chatCompletion.mockReset());

  it('rewrites only the amended article and splices it back', async () => {
    chatCompletion.mockResolvedValueOnce('Άρθρο 2 - Σκοπός\nΣκοπός είναι η διάδοση και η άσκηση της δημοκρατίας.');
    const merged = await mergeIntoText('statute', 'Καταστατικό', STATUTE, [
      { id: 1, type: 'improvement', text: 'Να προστεθεί «και η άσκηση».', articleRef: '2' },
    ]);
    expect(chatCompletion).toHaveBeenCalledTimes(1);
    const prompt = String(chatCompletion.mock.calls[0][0].messages[1].content);
    expect(prompt).toContain('Σκοπός είναι η διάδοση της δημοκρατίας.');
    expect(prompt).not.toContain('Ιδρύεται σωματείο');
    expect(prompt).not.toContain('Μέλη γίνονται');
    expect(merged.llm).toBe(true);
    expect(merged.text).toBe(STATUTE.replace(
      'Σκοπός είναι η διάδοση της δημοκρατίας.',
      'Σκοπός είναι η διάδοση και η άσκηση της δημοκρατίας.',
    ));
  });

  it('puts back a heading the model dropped', async () => {
    chatCompletion.mockResolvedValueOnce('Μέλη γίνονται ενήλικα και ανήλικα πρόσωπα.');
    const merged = await mergeIntoText('statute', 'Καταστατικό', STATUTE, [
      { id: 1, type: 'improvement', text: 'Και ανήλικοι.', articleRef: '3' },
    ]);
    expect(merged.text).toContain('Άρθρο 3: Μέλη\nΜέλη γίνονται ενήλικα και ανήλικα πρόσωπα.');
  });

  it('keeps a fallback inside its own article when the model fails', async () => {
    chatCompletion.mockRejectedValueOnce(new Error('down'));
    const merged = await mergeIntoText('statute', 'Καταστατικό', STATUTE, [
      { id: 1, type: 'improvement', text: 'Έδρα ο Πειραιάς.', articleRef: '1' },
    ]);
    expect(merged.llm).toBe(false);
    const sections = statuteSections(merged.text)!;
    const article1 = sectionText(merged.text, sections.find((s) => s.ref === '1')!);
    expect(article1).toContain('[Βελτίωση] Έδρα ο Πειραιάς.');
    expect(sectionText(merged.text, sections.find((s) => s.ref === '2')!)).toBe('Άρθρο 2 - Σκοπός\nΣκοπός είναι η διάδοση της δημοκρατίας.');
  });

  it('refuses an answer far longer than the article it was given', async () => {
    chatCompletion.mockResolvedValueOnce('Άρθρο 2\n' + 'Χ'.repeat(20_000));
    const merged = await mergeIntoText('statute', 'Καταστατικό', STATUTE, [
      { id: 1, type: 'improvement', text: 'Μικρή αλλαγή.', articleRef: '2' },
    ]);
    expect(merged.llm).toBe(false);
    expect(merged.text.length).toBeLessThan(STATUTE.length + 100);
  });

  it('adds a new article after the last one', async () => {
    chatCompletion.mockResolvedValueOnce('Άρθρο 4 - Πόροι\nΠόροι είναι οι συνδρομές.');
    const merged = await mergeIntoText('statute', 'Καταστατικό', STATUTE, [
      { id: 1, type: 'addition', text: 'Άρθρο για τους πόρους.', articleRef: NEW_ARTICLE_REF },
    ]);
    expect(String(chatCompletion.mock.calls[0][0].messages[1].content)).toContain('«Άρθρο 4»');
    expect(merged.text.startsWith(STATUTE.trimEnd())).toBe(true);
    expect(statuteSections(merged.text)!.map((s) => s.ref)).toEqual([PREAMBLE_REF, '1', '2', '3', '4']);
  });

  it('merges a text without articles, or an amendment naming none, as a whole', async () => {
    chatCompletion.mockResolvedValueOnce('Όλο το κείμενο, συγχωνευμένο.');
    const merged = await mergeIntoText('decision', 'Απόφαση', STATUTE, [
      { id: 1, type: 'improvement', text: 'Αλλαγή.', articleRef: '2' },
    ]);
    expect(merged.text).toBe('Όλο το κείμενο, συγχωνευμένο.');
    expect(String(chatCompletion.mock.calls[0][0].messages[1].content)).toContain('Ιδρύεται σωματείο');
  });
});
