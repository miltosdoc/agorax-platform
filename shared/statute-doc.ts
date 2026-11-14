/**
 * A statute as the form's editor holds it: a title, an introduction, and a
 * list of chapters and articles — each article a number, a title and a body.
 *
 * The proposal still stores plain text. composeStatuteDoc writes the editor's
 * cards out with one heading form the platform always reads
 * (shared/statute-articles.ts), so the article-by-article ballot, amendments
 * by article, the AI merge and the constitution work on it unchanged;
 * parseStatuteDoc reads any recognised statute back into cards.
 *
 * Numbers are the author's: a new article takes the next free number, but
 * nothing is renumbered behind their back — the text refers to its own
 * articles («άρθρου 14 του παρόντος»). renumberArticles does it on request.
 */

import { splitHeading, statuteSections } from './statute-articles';

export type StatuteBlock =
  | { kind: 'chapter'; title: string }
  | { kind: 'article'; number: string; title: string; body: string };

export interface StatuteDoc {
  /** The document's name, e.g. «Καταστατικό του Συλλόγου …». */
  title: string;
  /** Anything before the first article: founders, date, a short preamble. */
  intro: string;
  blocks: StatuteBlock[];
}

const NUMERALS = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ', 'Ζ', 'Η', 'Θ', 'Ι', 'ΙΑ', 'ΙΒ', 'ΙΓ', 'ΙΔ', 'ΙΕ', 'ΙΣΤ', 'ΙΖ', 'ΙΗ', 'ΙΘ', 'Κ'];

/** Α΄, Β΄, … for the n-th chapter (0-based). */
export const chapterNumeral = (index: number) => (index < NUMERALS.length ? `${NUMERALS[index]}΄` : String(index + 1));

export const emptyStatuteDoc = (): StatuteDoc => ({
  title: '',
  intro: '',
  blocks: [{ kind: 'article', number: '1', title: '', body: '' }],
});

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();

/** The editor's cards as statute text, in the form statute-articles reads. */
export function composeStatuteDoc(doc: StatuteDoc): string {
  const parts: string[] = [];
  const head = [oneLine(doc.title), doc.intro.trim()].filter(Boolean).join('\n\n');
  if (head) parts.push(head);
  let chapters = 0;
  let pending: string | null = null;
  for (const block of doc.blocks) {
    if (block.kind === 'chapter') {
      const title = oneLine(block.title);
      const line = `ΚΕΦΑΛΑΙΟ ${chapterNumeral(chapters++)}${title ? ` – ${title}` : ''}`;
      // A chapter with no article of its own is kept, with the next one's.
      pending = pending ? `${pending}\n\n${line}` : line;
      continue;
    }
    const title = oneLine(block.title).replace(/[.:]$/, '');
    const heading = title ? `Άρθρο ${block.number} - ${title}` : `Άρθρο ${block.number}`;
    const article = block.body.trim() ? `${heading}\n${block.body.trim()}` : heading;
    parts.push(pending ? `${pending}\n\n${article}` : article);
    pending = null;
  }
  if (pending) parts.push(pending);
  return parts.join('\n\n');
}

const ARTICLE_PREFIX = /^(?:\*\*|__|#{1,6}[ \t]+)?(?:Άρθρο|Άρθρο|ΑΡΘΡΟ|ΆΡΘΡΟ|Αρθρο)[ \t ]+\d{1,3}[Α-ΩA-Z]?(?:ον|ο)?[ \t ]*(?:[-–—:.,][ \t ]*)?/u;
const CHAPTER_PREFIX = /^(?:\*\*|__|#{1,6}[ \t]+)?(?:ΚΕΦΑΛΑΙΟ|Κεφάλαιο|ΜΕΡΟΣ|Μέρος|ΤΜΗΜΑ|Τμήμα)[ \t ]+(?:[Α-Ω]{1,4}|\d{1,3}|[IVXLC]{1,6})[ \t ]*[΄'’ʹ]?[ \t ]*(?:[-–—:.][ \t ]*)?/u;
const unwrap = (s: string) => s.replace(/(?:\*\*|__)\s*$/, '').trim();

/**
 * A statute's text as the editor's cards, or null when the platform cannot
 * find its articles. Repeated numbers are allowed here — the editor marks
 * them for the author to resolve.
 */
export function parseStatuteDoc(text: string): StatuteDoc | null {
  const sections = statuteSections(text, { allowRepeats: true });
  if (!sections) return null;
  const doc: StatuteDoc = { title: '', intro: '', blocks: [] };
  for (const s of sections) {
    const raw = text.slice(s.start, s.end).trim();
    if (!s.heading) {
      const [first, ...rest] = raw.split('\n');
      if (first.trim().length <= 200) {
        doc.title = unwrap(first.replace(/^(?:\*\*|__|#{1,6}[ \t]+)/, ''));
        doc.intro = rest.join('\n').trim();
      } else {
        doc.intro = raw;
      }
      continue;
    }
    const { chapter, article } = splitHeading(s.heading);
    if (chapter) {
      for (const line of chapter.split(/\n\s*\n/)) {
        doc.blocks.push({ kind: 'chapter', title: oneLine(unwrap(line.trim().replace(CHAPTER_PREFIX, ''))) });
      }
    }
    doc.blocks.push({
      kind: 'article',
      number: s.ref,
      title: oneLine(unwrap(article.replace(ARTICLE_PREFIX, ''))).replace(/[.:]$/, ''),
      body: raw.slice(s.heading.length).trim(),
    });
  }
  return doc;
}

const articleNumbers = (doc: StatuteDoc) =>
  doc.blocks.filter((b): b is Extract<StatuteBlock, { kind: 'article' }> => b.kind === 'article').map((b) => b.number);

/** The number a new article takes: one past the highest. */
export function nextNumber(doc: StatuteDoc): string {
  const max = Math.max(0, ...articleNumbers(doc).map((n) => parseInt(n, 10)).filter(Number.isFinite));
  return String(max + 1);
}

/** Numbers used by more than one article. */
export function repeatedNumbers(doc: StatuteDoc): string[] {
  const seen = new Map<string, number>();
  for (const n of articleNumbers(doc)) seen.set(n, (seen.get(n) ?? 0) + 1);
  return [...seen].filter(([, c]) => c > 1).map(([n]) => n);
}

/** Articles numbered 1, 2, 3… in their order. */
export function renumberArticles(doc: StatuteDoc): StatuteDoc {
  let n = 0;
  return { ...doc, blocks: doc.blocks.map((b) => (b.kind === 'article' ? { ...b, number: String(++n) } : b)) };
}
