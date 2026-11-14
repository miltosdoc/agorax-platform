/**
 * A proposal's text laid out for reading: headings, paragraphs and list
 * items, from plain text as members write or paste it. Display only — the
 * stored text is never changed.
 *
 * - «Άρθρο N …», «ΚΕΦΑΛΑΙΟ Α΄ …», a line in capitals, «## …» or a line in
 *   **bold** become headings; a statute gets its document title, chapters and
 *   articles as such (with anchors for a table of contents).
 * - «1.», «2)», «α)», «(β)», «-», «•» at the start of a line become list
 *   items with a hanging indent.
 * - Text pasted from a PDF breaks its lines mid-sentence at the page width.
 *   When a text reads that way, those lines are joined back into paragraphs;
 *   otherwise the author's line breaks are kept as they are.
 */

export type ReadableBlock =
  | { kind: 'title'; text: string }
  | { kind: 'chapter'; text: string }
  | { kind: 'article'; id: string; number: string; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'item'; marker: string; depth: 0 | 1; lines: string[] };

const ARTICLE = /^(?:\*\*|__|#{1,6}\s+)?(?:Άρθρο|Άρθρο|ΑΡΘΡΟ|ΆΡΘΡΟ|Αρθρο)\s+(\d{1,3}[Α-ΩA-Z]?)(?:ον|ο)?(?=\s|$|[-–—:.,()*_])/u;
const CHAPTER = /^(?:\*\*|__|#{1,6}\s+)?(?:ΚΕΦΑΛΑΙΟ|Κεφάλαιο|ΜΕΡΟΣ|Μέρος|ΤΜΗΜΑ|Τμήμα)\s+(?:[Α-Ω]{1,4}|\d{1,3}|[IVXLC]{1,6})(?=\s|$|[΄'’ʹ.:–—-])/u;
const MD_HEADING = /^#{1,6}\s+(.+)$/;
const BOLD_LINE = /^(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/;
// «1.», «12)», «α)», «στ.», «(β)», «-», «•», «–». A number must be followed by
// text, so «1.» alone or a date is not taken for a list.
const MARKER = /^(\d{1,2}[.)]|[α-ωά-ώ]{1,2}[.)]|\([α-ωά-ώ\d]{1,2}\)|[-•–])\s*(?=\S)/u;
const TERMINAL = /[.:;!?»"”…)]$/;

const isCaps = (line: string) => {
  const letters = line.match(/\p{L}/gu) ?? [];
  return letters.length >= 3 && line.length <= 120 && !/\p{Ll}/u.test(line);
};
const stripBold = (s: string) => s.replace(/^(?:\*\*|__)/, '').replace(/(?:\*\*|__)\s*$/, '').trim();

/** Whether the text is hard-wrapped, as text copied out of a PDF is. */
export function looksHardWrapped(lines: string[]): boolean {
  const long = lines.map((l) => l.trim()).filter((l) => l.length >= 40);
  if (long.length < 6) return false;
  const open = long.filter((l) => !TERMINAL.test(l)).length / long.length;
  const lengths = long.map((l) => l.length).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];
  return open >= 0.35 && median >= 50 && median <= 120;
}

function lineKind(line: string): 'blank' | 'article' | 'chapter' | 'heading' | 'item' | 'text' {
  const l = line.trim();
  if (!l) return 'blank';
  if (ARTICLE.test(l) && l.length <= 160) return 'article';
  if (CHAPTER.test(l) && l.length <= 200) return 'chapter';
  if (MD_HEADING.test(l) || (BOLD_LINE.test(l) && l.length <= 160) || isCaps(l)) return 'heading';
  if (MARKER.test(l)) return 'item';
  return 'text';
}

export function readableBlocks(text: string): ReadableBlock[] {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const unwrap = looksHardWrapped(raw);
  const blocks: ReadableBlock[] = [];
  const seenIds = new Map<string, number>();
  let last: ReadableBlock | null = null;
  let afterBreak = true; // a blank line or a heading came last

  const push = (b: ReadableBlock) => { blocks.push(b); last = b; };

  for (const original of raw) {
    const line = original.trim();
    const kind = lineKind(line);
    if (kind === 'blank') { afterBreak = true; continue; }

    if (kind === 'article') {
      const number = line.match(ARTICLE)![1];
      const n = (seenIds.get(number) ?? 0) + 1;
      seenIds.set(number, n);
      push({ kind: 'article', id: `article-${number}${n > 1 ? `-${n}` : ''}`, number, text: stripBold(line) });
      afterBreak = true;
      continue;
    }
    if (kind === 'chapter') { push({ kind: 'chapter', text: stripBold(line) }); afterBreak = true; continue; }
    if (kind === 'heading') {
      const textOf = stripBold(line.replace(MD_HEADING, '$1'));
      // «Άρθρο 19ο» / «ΣΥΝΘΕΣΗ ΚΑΙ ΘΗΤΕΙΑ»: the line in capitals is the article's title.
      const prev = last as ReadableBlock | null;
      if (prev && (prev.kind === 'article' || prev.kind === 'chapter') && blocks[blocks.length - 1] === prev && isCaps(line)) {
        prev.text = `${prev.text} ${textOf}`;
      } else if (blocks.length === 0) {
        push({ kind: 'title', text: textOf });
      } else {
        push({ kind: 'heading', text: textOf });
      }
      afterBreak = true;
      continue;
    }
    if (kind === 'item') {
      const m = line.match(MARKER)!;
      const marker = m[1];
      // Letters («α)», «(β)») sit under the numbered points they belong to.
      const depth: 0 | 1 = /^\(?[α-ωά-ώ]/u.test(marker) ? 1 : 0;
      push({ kind: 'item', marker, depth, lines: [line.slice(m[0].length)] });
      afterBreak = false;
      continue;
    }
    // Plain text: continues the paragraph or item before it, or starts one.
    const prev = last as ReadableBlock | null;
    if (!afterBreak && prev && (prev.kind === 'paragraph' || prev.kind === 'item')) {
      const lines = prev.lines;
      const before = lines[lines.length - 1];
      if (unwrap && !(TERMINAL.test(before) && /^[\p{Lu}«"(\d]/u.test(line))) {
        // A word split at the line's end («συμφερό-» / «ντων») is joined whole.
        lines[lines.length - 1] = /\p{L}-$/u.test(before) ? before.slice(0, -1) + line : `${before} ${line}`;
      } else {
        lines.push(line);
      }
    } else {
      push({ kind: 'paragraph', lines: [line] });
    }
    afterBreak = false;
  }
  // «Καταστατικό ΕΜΕΙΣ» on its own above the articles is the document's title.
  const first = blocks[0];
  if (first?.kind === 'paragraph' && first.lines.length === 1 && first.lines[0].length <= 120
    && !/[.;!?,]$/.test(first.lines[0]) && blocks.some((b) => b.kind === 'article')) {
    blocks[0] = { kind: 'title', text: stripBold(first.lines[0]) };
  }
  return blocks;
}

/** The headings worth a table of contents: chapters and articles. */
export function readableOutline(blocks: ReadableBlock[]) {
  return blocks.filter((b): b is Extract<ReadableBlock, { kind: 'article' | 'chapter' }> => b.kind === 'article' || b.kind === 'chapter');
}
