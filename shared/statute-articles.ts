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
const HEADING = /^[ \t\u00A0]*(?:Άρθρο|Α\u0301ρθρο|ΑΡΘΡΟ|ΆΡΘΡΟ|Αρθρο)[ \t\u00A0]+(\d{1,3}[Α-ΩA-Z]?)(?:ον|ο)?(?=[ \t\u00A0]*(?:$|[-–—:.)]|\p{Lu}))[^\n]*/gmu;

/**
 * The text's sections — the preamble, if there is one, and each article —
 * or null when the text is not laid out in articles: fewer than two, or the
 * same number twice (a quoted law, say), which would leave an amendment's
 * article ambiguous.
 */
export function statuteSections(text: string): TextSection[] | null {
  const heads = Array.from(text.matchAll(HEADING));
  if (heads.length < 2) return null;
  const refs = heads.map((m) => m[1]);
  if (new Set(refs).size !== refs.length) return null;

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
