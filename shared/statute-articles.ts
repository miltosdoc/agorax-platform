/**
 * A statute's articles, read from its text.
 *
 * A statute is amended article by article: each amendment names the article
 * it changes, and the AI merge rewrites only that article, so every article
 * nobody amended reaches the ballot exactly as written. The articles are the
 * «Άρθρο N» headings of the text itself — nothing about them is stored. The
 * original text is frozen once co-drafting opens, so it always yields the
 * same articles, and an amendment's article number keeps pointing at the
 * article its author meant.
 */

import type { ProposalKind } from './proposal-kinds';

export interface TextSection {
  /** 'preamble', or the article's number as written ('5', '5Α'). */
  ref: string;
  /** The heading line, e.g. «Άρθρο 5 - Αποβολή μέλους»; null for the preamble. */
  heading: string | null;
  /** [start, end) in the text: from the heading up to the next heading. */
  start: number;
  end: number;
}

/** What an amendment names when it adds an article rather than changing one. */
export const NEW_ARTICLE_REF = 'new';
/** The text before the first article: title, name, introductory note. */
export const PREAMBLE_REF = 'preamble';

// «Άρθρο 5», «ΑΡΘΡΟ 5Α», «Άρθρο 1ο» at the start of a line, then the end of
// the line, a separator, or a capitalised title. «Άρθρο 5 του ν. …» inside a
// paragraph is a reference, not a heading, and does not match. Pasted Word
// text brings non-breaking spaces and, now and then, a decomposed «Ά».
// Text pasted from a chat or a Markdown editor wraps the heading in bold or
// starts it with «#», and many statutes write «Άρθρο 1, Βασικές αρχές» or
// «Άρθρο 3ο (για …)». A title in capitals on the next line belongs to the
// heading («Άρθρο 19ο» / «ΣΥΝΘΕΣΗ ΚΑΙ ΘΗΤΕΙΑ»): a line with no lower-case
// letter and at least three capitals in a row.
//
// A chapter heading right above an article («ΚΕΦΑΛΑΙΟ Β΄ – Μέλη») is taken
// into that article's heading, so it neither trails the article before it
// nor is lost: it opens the chapter's first article, and is voted with it.
const SP = '[ \\t\\u00A0]';
const MD = '(?:\\*\\*|__|#{1,6}[ \\t]+)?';
const ARTICLE_WORD = '(?:Άρθρο|Α\\u0301ρθρο|ΑΡΘΡΟ|ΆΡΘΡΟ|Αρθρο)';
const CAPS_LINE = `\\n${SP}*(?=[^\\n]*\\p{Lu}{3})[^\\n\\p{Ll}]{3,150}`;
const CHAPTER_LINE = `${MD}(?:ΚΕΦΑΛΑΙΟ|Κεφάλαιο|ΜΕΡΟΣ|Μέρος|ΤΜΗΜΑ|Τμήμα)${SP}+(?:[Α-Ω]{1,4}|\\d{1,3}|[IVXLC]{1,6})(?=${SP}|[΄'’ʹ.:–—-]|$)[^\\n]*(?:${CAPS_LINE})*`;
const ARTICLE_LINE = `${MD}${ARTICLE_WORD}${SP}+(\\d{1,3}[Α-ΩA-Z]?)(?:ον|ο)?(?=${SP}*(?:$|[-–—:.,()*_]|\\p{Lu}))[^\\n]*(?:${CAPS_LINE}(?=\\n|$))?`;
const HEADING = new RegExp(`^${SP}*(?:${CHAPTER_LINE}\\n(?:${SP}*\\n)*${SP}*)?${ARTICLE_LINE}`, 'gmu');
const ARTICLE_START = new RegExp(`(?:^|\\n)${SP}*${MD}${ARTICLE_WORD}${SP}+\\d`, 'u');

/** A heading's two parts: the chapter heading above the article, if any, and the article's own. */
export function splitHeading(heading: string): { chapter: string | null; article: string } {
  const m = heading.match(ARTICLE_START);
  if (!m || m.index === 0) return { chapter: null, article: heading.trim() };
  return { chapter: heading.slice(0, m.index).trim(), article: heading.slice(m.index).trim() };
}

/** A heading as shown to people: the article's own, without the Markdown around it. */
export const headingLabel = (heading: string) =>
  splitHeading(heading).article.replace(/^(?:\*\*|__|#{1,6}[ \t]+)/, '').replace(/(?:\*\*|__)[ \t]*$/, '')
    .replace(/\s*\n\s*/g, ' ').trim();

/**
 * Article numbers that head more than one article — a model statute that
 * offers alternative versions of an article («Άρθρο 3ο (για …)» three times).
 * Only the author can choose which one is put to the vote.
 */
export function repeatedArticleRefs(text: string): string[] {
  const seen = new Map<string, number>();
  for (const m of text.matchAll(HEADING)) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([ref]) => ref);
}

/**
 * The text's sections — the preamble, if there is one, and each article —
 * or null when the text is not laid out in articles: fewer than two, or the
 * same number twice (a quoted law, say), which would leave an amendment's
 * article ambiguous.
 */
export function statuteSections(text: string, opts: { allowRepeats?: boolean } = {}): TextSection[] | null {
  const heads = Array.from(text.matchAll(HEADING));
  if (heads.length < 2) return null;
  const refs = heads.map((m) => m[1]);
  // allowRepeats is for the form's editor only, which shows the repeats so
  // the author can keep one; nothing that votes or amends asks for it.
  if (!opts.allowRepeats && new Set(refs).size !== refs.length) return null;

  const sections: TextSection[] = [];
  const firstStart = heads[0].index!;
  if (text.slice(0, firstStart).trim()) {
    sections.push({ ref: PREAMBLE_REF, heading: null, start: 0, end: firstStart });
  }
  heads.forEach((m, i) => {
    sections.push({
      ref: m[1],
      heading: m[0].trim(),
      start: m.index!,
      end: i + 1 < heads.length ? heads[i + 1].index! : text.length,
    });
  });
  return sections;
}

/** Whether a text opens with an article heading. */
export function opensWithHeading(text: string): boolean {
  const first = text.trimStart().matchAll(HEADING).next().value;
  return !!first && first.index === 0;
}

/** Only a statute is amended article by article. */
export function articleSectionsFor(kind: ProposalKind, text: string): TextSection[] | null {
  return kind === 'statute' ? statuteSections(text) : null;
}

/** Whether an amendment may name `ref` on a text with these sections. */
export function isArticleRef(sections: TextSection[], ref: unknown): ref is string {
  return typeof ref === 'string' && (ref === NEW_ARTICLE_REF || sections.some((s) => s.ref === ref));
}

/** The section's own text, heading included, without the blank lines after it. */
export function sectionText(text: string, section: TextSection): string {
  return text.slice(section.start, section.end).trim();
}

/**
 * The text with some sections replaced, keyed by ref. Everything else — the
 * other sections and the whitespace between them — is copied untouched.
 */
export function replaceSections(text: string, sections: TextSection[], replacements: Map<string, string>): string {
  let out = '';
  let cursor = 0;
  for (const s of sections) {
    const replacement = replacements.get(s.ref);
    if (replacement === undefined) continue;
    const trailing = text.slice(s.start, s.end).match(/\s*$/)![0];
    out += text.slice(cursor, s.start) + replacement.trim() + (trailing || (s.end < text.length ? '\n\n' : ''));
    cursor = s.end;
  }
  return out + text.slice(cursor);
}

/** New articles go after the last one. */
export function appendArticles(text: string, articles: string): string {
  const trailing = text.match(/\s*$/)![0];
  return `${text.trimEnd()}\n\n${articles.trim()}${trailing || '\n'}`;
}

/** The number a new article takes: one past the highest. */
export function nextArticleNumber(sections: TextSection[]): number {
  const numbers = sections.map((s) => parseInt(s.ref, 10)).filter(Number.isFinite);
  return (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
}

/** One article as the AI hands it back: its number, a short title and the text under the heading. */
export interface StatuteArticle {
  number: string;
  title: string;
  body: string;
}

/**
 * A statute written out in the one heading form the platform always reads:
 * the preamble, then «Άρθρο N - Τίτλος» on its own line above each article.
 */
export function composeStatute(preamble: string, articles: StatuteArticle[]): string {
  const parts = preamble.trim() ? [preamble.trim()] : [];
  for (const a of articles) {
    const title = headingLabel(a.title).replace(/[.:]\s*$/, '').trim();
    parts.push(`${title ? `Άρθρο ${a.number} - ${title}` : `Άρθρο ${a.number}`}\n${a.body.trim()}`);
  }
  return parts.join('\n\n');
}
