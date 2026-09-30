/**
 * The text of an attached document, for the proposal form.
 *
 * A member attaches their statute as a Word file or a PDF and expects it to
 * become the proposal's text — that is where the articles are found, amended
 * one by one and voted on. The form sends the file here, puts what comes back
 * into the text field, and still attaches the file itself as before.
 *
 * DOCX goes through mammoth's HTML rather than its raw text, which drops the
 * numbers of Word's numbered paragraphs; ODT is read from its content.xml;
 * PDF through pdf.js; TXT as UTF-8, or Windows Greek when it is not. The old
 * binary .doc is not read: the member is asked for DOCX or PDF instead.
 */

import path from 'path';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { opensWithHeading } from '../../shared/statute-articles';

/** A document whose text cannot be read; `message` is for the member. */
export class UnreadableDocumentError extends Error {}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/**
 * Lines of text from a document's markup: one line per paragraph, heading,
 * list item or table row, with numbered items numbered and bullets as «•».
 * Handles both mammoth's HTML and ODT's content.xml — the tags differ, the
 * shape does not.
 */
function markupToLines(markup: string, tags: {
  block: RegExp; list: RegExp; ordered: RegExp; item: RegExp; row: RegExp; cell: RegExp;
  lineBreak: RegExp; tab: RegExp; spaces?: RegExp;
}): string[] {
  const lines: string[] = [];
  const lists: Array<{ ordered: boolean; n: number }> = [];
  let line = '';
  // A list item's number waits for its text; a paragraph opening inside the
  // item must not flush the number onto a line of its own.
  let markerOnly = false;
  const flush = () => {
    if (markerOnly) return;
    const text = line.replace(/[ \t]+$/g, '');
    if (text.trim()) lines.push(text);
    line = '';
  };
  for (const part of markup.split(/(<[^>]+>)/)) {
    if (!part) continue;
    if (part[0] !== '<') {
      const text = decodeEntities(part);
      if (text) {
        line += text;
        if (text.trim()) markerOnly = false;
      }
      continue;
    }
    const m = part.match(/^<(\/?)([a-z0-9:_-]+)/i);
    if (!m) continue;
    const closing = m[1] === '/';
    const selfClosing = part.endsWith('/>');
    const tag = m[2].toLowerCase();
    if (tags.lineBreak.test(tag)) {
      line += '\n';
    } else if (tags.tab.test(tag)) {
      line += '\t';
    } else if (tags.spaces?.test(tag)) {
      const count = Number(part.match(/text:c="(\d+)"/)?.[1] ?? 1);
      line += ' '.repeat(Math.min(count, 50));
    } else if (tags.list.test(tag)) {
      markerOnly = false;
      flush();
      if (closing) lists.pop();
      else if (!selfClosing) lists.push({ ordered: tags.ordered.test(tag), n: 0 });
    } else if (tags.item.test(tag)) {
      markerOnly = false;
      flush();
      if (!closing && !selfClosing) {
        const list = lists[lists.length - 1];
        const indent = '  '.repeat(Math.max(0, lists.length - 1));
        line = `${indent}${list?.ordered ? `${++list.n}.` : '•'} `;
        markerOnly = true;
      }
    } else if (tags.block.test(tag) || tags.row.test(tag)) {
      if (closing || !markerOnly) flush();
    } else if (tags.cell.test(tag) && closing) {
      line += '\t';
    }
  }
  markerOnly = false;
  flush();
  return lines;
}

/** The lines as a text, each article set apart by a blank line. */
function joinLines(lines: string[]): string {
  return lines.map((l, i) => (i > 0 && opensWithHeading(l) ? `\n${l}` : l)).join('\n');
}

async function docxText(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml({ buffer }, { ignoreEmptyParagraphs: true });
  return joinLines(markupToLines(value, {
    block: /^(p|h[1-6])$/,
    list: /^(ol|ul)$/,
    ordered: /^ol$/,
    item: /^li$/,
    row: /^tr$/,
    cell: /^(td|th)$/,
    lineBreak: /^br$/,
    tab: /^$/,
  }));
}

async function odtText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('content.xml')?.async('string');
  if (!xml) throw new UnreadableDocumentError('Το αρχείο ODT δεν έχει κείμενο.');
  const body = xml.slice(Math.max(0, xml.indexOf('<office:body')));
  return joinLines(markupToLines(body, {
    block: /^text:(p|h)$/,
    // ODT does not say whether a list is numbered without its styles; every
    // item gets a bullet, and a number typed into the text stays as typed.
    list: /^text:list$/,
    ordered: /^$/,
    item: /^text:list-item$/,
    row: /^table:table-row$/,
    cell: /^table:table-cell$/,
    lineBreak: /^text:line-break$/,
    tab: /^text:tab$/,
    spaces: /^text:s$/,
  }));
}

async function pdfText(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  try {
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        text += item.str;
        if (item.hasEOL) text += '\n';
      }
      pages.push(text);
      page.cleanup();
    }
    const lines = pages.join('\n').split('\n').map((l) => l.replace(/[ \t]+$/g, '')).filter((l) => l.trim());
    if (lines.length === 0) {
      throw new UnreadableDocumentError('Το PDF δεν έχει κείμενο — ίσως είναι σκαναρισμένο. Επικολλήστε το κείμενο.');
    }
    return joinLines(lines);
  } finally {
    await doc.destroy();
  }
}

function plainText(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // Greek text saved by older Windows programs.
    return new TextDecoder('windows-1253').decode(buffer);
  }
}

/**
 * The document's text, tidied: Unix line ends, no trailing spaces, at most
 * one blank line in a row. Throws UnreadableDocumentError for a format it
 * does not read or a document without text.
 */
export async function documentText(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  let text: string;
  try {
    switch (ext) {
      case '.docx': text = await docxText(buffer); break;
      case '.odt': text = await odtText(buffer); break;
      case '.pdf': text = await pdfText(buffer); break;
      case '.txt': text = plainText(buffer); break;
      case '.doc':
        throw new UnreadableDocumentError('Το παλιό .doc δεν διαβάζεται· αποθηκεύστε το ως DOCX ή PDF και επισυνάψτε το ξανά.');
      default:
        throw new UnreadableDocumentError('Διαβάζεται κείμενο μόνο από DOCX, ODT, PDF και TXT.');
    }
  } catch (err) {
    if (err instanceof UnreadableDocumentError) throw err;
    console.warn(`[document-text] ${ext} unreadable: ${err instanceof Error ? err.message : err}`);
    throw new UnreadableDocumentError('Δεν ήταν δυνατό να διαβαστεί το κείμενο του εγγράφου. Επικολλήστε το κείμενο.');
  }
  const tidy = text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!tidy) throw new UnreadableDocumentError('Το έγγραφο δεν έχει κείμενο.');
  return tidy;
}
