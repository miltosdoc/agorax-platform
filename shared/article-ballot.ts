/**
 * Article-by-article ballot for a statute: one question on the whole text,
 * then one per article — «κατ' άρθρο και στο σύνολο».
 *
 * An article whose co-drafting produced a counter-proposal is put as a
 * choice between versions (A, the co-drafted text; B, the counter), or No;
 * any other article as Yes or No. Abstain is always there. An article enters
 * the statute only if it carries its own vote *and* the whole carries.
 *
 * All the answers travel as one ballot. The anonymous voting machinery — one
 * blind signature, one receipt, one entry in the vote chain — takes a single
 * choice string, so the answers are written into it one letter per question
 * («art_» + whole + articles). Tallies are still counted per choice string;
 * the per-article results are read out of them here. Only the per-question
 * totals are ever shown, never a whole ballot.
 */

import { meetsMajority, type MajorityRule } from './proposal-kinds';
import {
  NEW_ARTICLE_REF, PREAMBLE_REF, sectionText, statuteSections, type TextSection,
} from './statute-articles';

export interface ArticleQuestion {
  /** The article's number as written ('5', '5Α'). */
  ref: string;
  /** Its heading, e.g. «Άρθρο 5 - Αποβολή μέλους». */
  heading: string;
  /** The versions on the ballot: [A] alone, or [A, B, …] — A is always the co-drafted text. */
  versions: string[];
  /** The counter-proposals behind versions B, C, … (amendment ids, in order). */
  counterIds: number[];
  /** Whether co-drafting changed the article from the text first proposed. */
  changed: boolean;
}

export interface ArticleBallot {
  /** The text before the first article; it stands or falls with the whole. */
  preamble: string;
  articles: ArticleQuestion[];
}

export type WholeAnswer = 'yes' | 'no' | 'abstain';
/** A version index (0 = A), or No, or Abstain. */
export type ArticleAnswer = number | 'no' | 'abstain';

export interface ArticleChoice {
  whole: WholeAnswer;
  articles: ArticleAnswer[];
}

const PREFIX = 'art_';
// Version letters after A. 'a', 'n' and 'y' are taken by Abstain, No and A.
const VERSION_LETTERS = 'bcdefghijklm';
export const MAX_VERSIONS = VERSION_LETTERS.length + 1;

export function isArticleBallot(value: unknown): value is ArticleBallot {
  return !!value && typeof value === 'object'
    && Array.isArray((value as ArticleBallot).articles)
    && (value as ArticleBallot).articles.length > 0;
}

/** The ballot as the choice string the vote machinery carries. */
export function encodeArticleChoice(ballot: ArticleBallot, choice: ArticleChoice): string {
  const whole = choice.whole === 'yes' ? 'y' : choice.whole === 'no' ? 'n' : 'a';
  const articles = ballot.articles.map((q, i) => {
    const answer = choice.articles[i] ?? 'abstain';
    if (answer === 'no') return 'n';
    if (answer === 'abstain') return 'a';
    if (answer === 0) return 'y';
    if (answer >= 1 && answer < q.versions.length) return VERSION_LETTERS[answer - 1];
    return 'a';
  });
  return PREFIX + whole + articles.join('');
}

/** The answers in a choice string, or null when it is not a valid ballot for this statute. */
export function decodeArticleChoice(ballot: ArticleBallot, choice: string): ArticleChoice | null {
  // A plain yes/no/abstain comes from a page loaded before the ballot was
  // frozen — co-drafting ends, the vote opens, and the final text is merged
  // in the moments after. It answers the question the voter saw, on the
  // whole, and says nothing about the articles.
  if (choice === 'yes' || choice === 'no' || choice === 'abstain') {
    return { whole: choice, articles: ballot.articles.map((): ArticleAnswer => 'abstain') };
  }
  if (!choice.startsWith(PREFIX)) return null;
  const body = choice.slice(PREFIX.length);
  if (body.length !== ballot.articles.length + 1) return null;
  const wholeChar = body[0];
  const whole: WholeAnswer | null = wholeChar === 'y' ? 'yes' : wholeChar === 'n' ? 'no' : wholeChar === 'a' ? 'abstain' : null;
  if (!whole) return null;
  const articles: ArticleAnswer[] = [];
  for (let i = 0; i < ballot.articles.length; i++) {
    const c = body[i + 1];
    if (c === 'y') articles.push(0);
    else if (c === 'n') articles.push('no');
    else if (c === 'a') articles.push('abstain');
    else {
      const index = VERSION_LETTERS.indexOf(c) + 1;
      if (index < 1 || index >= ballot.articles[i].versions.length) return null;
      articles.push(index);
    }
  }
  return { whole, articles };
}

export interface ArticleResult {
  ref: string;
  heading: string;
  /** Votes for each version (A, B, …). */
  versions: number[];
  no: number;
  abstain: number;
  /** Whether the article carries its own vote under the statute majority. */
  passes: boolean;
  /** The winning version when it passes; ties go to the earlier (A). */
  winner: number | null;
  /** Passes *and* the whole passes: the article enters the statute. */
  adopted: boolean;
}

export interface ArticleTally {
  whole: { yes: number; no: number; abstain: number };
  articles: ArticleResult[];
}

/**
 * Per-question totals from the per-choice counts. An article carries when
 * its versions together reach the majority against No (abstentions count
 * for neither side, as everywhere); the version with most votes is the one
 * adopted. `adopted` is left false here — it also needs the whole to pass,
 * which depends on quorum, and is set by the caller.
 */
export function tallyArticleBallot(
  ballot: ArticleBallot,
  counts: Record<string, number>,
  majority: MajorityRule,
): ArticleTally {
  const whole = { yes: 0, no: 0, abstain: 0 };
  const articles: ArticleResult[] = ballot.articles.map((q) => ({
    ref: q.ref,
    heading: q.heading,
    versions: q.versions.map(() => 0),
    no: 0,
    abstain: 0,
    passes: false,
    winner: null,
    adopted: false,
  }));
  for (const [choice, n] of Object.entries(counts)) {
    const decoded = decodeArticleChoice(ballot, choice);
    if (!decoded || !(n > 0)) continue;
    whole[decoded.whole] += n;
    decoded.articles.forEach((answer, i) => {
      const r = articles[i];
      if (answer === 'no') r.no += n;
      else if (answer === 'abstain') r.abstain += n;
      else r.versions[answer] += n;
    });
  }
  for (const r of articles) {
    const forIt = r.versions.reduce((sum, v) => sum + v, 0);
    r.passes = meetsMajority(forIt, r.no, majority);
    if (r.passes) {
      r.winner = r.versions.reduce((best, v, i) => (v > r.versions[best] ? i : best), 0);
    }
  }
  return { whole, articles };
}

/**
 * The statute as adopted: the preamble and every adopted article in its
 * winning version, in the text's order. Empty when nothing was adopted.
 */
export function adoptedText(ballot: ArticleBallot, results: ArticleResult[]): string {
  const articles = ballot.articles
    .map((q, i) => (results[i]?.adopted ? q.versions[results[i].winner ?? 0] : null))
    .filter((t): t is string => !!t);
  if (articles.length === 0) return '';
  return [ballot.preamble, ...articles].filter((t) => t.trim()).join('\n\n');
}

/** The articles that were put to the vote and did not enter the statute. */
export function rejectedArticles(ballot: ArticleBallot, results: ArticleResult[]): ArticleQuestion[] {
  return ballot.articles.filter((_, i) => results[i] && !results[i].adopted);
}

const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The ballot for a statute's vote-ready text, or null when it should be an
 * ordinary vote: the text is not laid out in articles, or a counter-proposal
 * names no article of it (filed before articles were asked for), which only
 * the whole-text ballot can offer.
 *
 * `counters` are the qualifying counter-proposals, each with the complete
 * alternative text it stands for — the final text with its article changed
 * (see articleAlternative in server/utils/ai-merger.ts).
 */
export function buildArticleBallot(
  finalText: string,
  originalText: string,
  counters: Array<{ id: number; articleRef: string | null; text: string }>,
): ArticleBallot | null {
  const sections = statuteSections(finalText);
  if (!sections) return null;
  const articles = sections.filter((s): s is TextSection & { heading: string } => !!s.heading);
  const original = statuteSections(originalText) ?? [];
  const originalOf = (ref: string) => {
    const s = original.find((o) => o.ref === ref);
    return s ? normalise(sectionText(originalText, s)) : null;
  };

  const questions: ArticleQuestion[] = articles.map((s) => {
    const text = sectionText(finalText, s);
    return {
      ref: s.ref,
      heading: s.heading,
      versions: [text],
      counterIds: [],
      changed: originalOf(s.ref) !== normalise(text),
    };
  });

  for (const counter of counters) {
    if (!counter.articleRef || counter.articleRef === PREAMBLE_REF) return null;
    const alt = statuteSections(counter.text);
    if (!alt) return null;
    if (counter.articleRef === NEW_ARTICLE_REF) {
      // A counter that adds an article: each article it adds is its own
      // question, Yes or No, after the others.
      for (const s of alt) {
        if (!s.heading || questions.some((q) => q.ref === s.ref)) continue;
        questions.push({
          ref: s.ref, heading: s.heading, versions: [sectionText(counter.text, s)], counterIds: [counter.id], changed: true,
        });
      }
      continue;
    }
    const question = questions.find((q) => q.ref === counter.articleRef);
    const version = alt.find((s) => s.ref === counter.articleRef);
    if (!question || !version || question.versions.length >= MAX_VERSIONS) return null;
    question.versions.push(sectionText(counter.text, version));
    question.counterIds.push(counter.id);
  }

  const preambleSection = sections.find((s) => s.ref === PREAMBLE_REF);
  return {
    preamble: preambleSection ? sectionText(finalText, preambleSection) : '',
    articles: questions,
  };
}
