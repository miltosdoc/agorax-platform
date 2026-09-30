/**
 * Document text contract tests.
 *
 * A statute attached to the proposal form becomes the proposal's text, where
 * its articles are found. These build small DOCX and ODT files in memory and
 * pin what comes out: paragraphs as lines, numbered items numbered, each
 * article set apart, and a clear refusal for what cannot be read.
 */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { UnreadableDocumentError, documentText } from '../../server/utils/document-text';
import { statuteSections } from '../../shared/statute-articles';

async function docx(bodyXml: string, numbering?: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
${numbering ? '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' : ''}
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${numbering ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' : ''}
</Relationships>`);
  if (numbering) zip.file('word/numbering.xml', numbering);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const numbered = (text: string) =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const NUMBERING = `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

describe('document text — DOCX', () => {
  it('reads paragraphs as lines and sets each article apart', async () => {
    const file = await docx([
      para('ΚΑΤΑΣΤΑΤΙΚΟ'),
      para('Άρθρο 1 - Επωνυμία'),
      para('Ιδρύεται σωματείο &amp; έδρα η Αθήνα.'),
      para('Άρθρο 2 - Σκοπός'),
      para('Η διάδοση της δημοκρατίας.'),
    ].join(''));
    const text = await documentText(file, 'Καταστατικό.docx');
    expect(text).toBe([
      'ΚΑΤΑΣΤΑΤΙΚΟ',
      '',
      'Άρθρο 1 - Επωνυμία',
      'Ιδρύεται σωματείο & έδρα η Αθήνα.',
      '',
      'Άρθρο 2 - Σκοπός',
      'Η διάδοση της δημοκρατίας.',
    ].join('\n'));
    expect(statuteSections(text)!.map((s) => s.ref)).toEqual(['preamble', '1', '2']);
  });

  it("keeps the numbers of Word's numbered paragraphs", async () => {
    const file = await docx([para('Άρθρο 1'), numbered('Πρώτη παράγραφος.'), numbered('Δεύτερη παράγραφος.')].join(''), NUMBERING);
    const text = await documentText(file, 'a.docx');
    expect(text).toContain('1. Πρώτη παράγραφος.\n2. Δεύτερη παράγραφος.');
  });
});

describe('document text — ODT', () => {
  it('reads headings, paragraphs, list items and spaces', async () => {
    const zip = new JSZip();
    zip.file('content.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
<office:body><office:text>
<text:h text:outline-level="1">Άρθρο 1 - Επωνυμία</text:h>
<text:p>Ιδρύεται<text:s text:c="2"/>σωματείο.<text:tab/>Τέλος.</text:p>
<text:list><text:list-item><text:p>Μέλη</text:p></text:list-item></text:list>
<text:h text:outline-level="1">Άρθρο 2 - Σκοπός</text:h>
<text:p>Η δημοκρατία.</text:p>
</office:text></office:body></office:document-content>`);
    const text = await documentText(await zip.generateAsync({ type: 'nodebuffer' }), 'a.odt');
    expect(text).toBe('Άρθρο 1 - Επωνυμία\nΙδρύεται  σωματείο.\tΤέλος.\n• Μέλη\n\nΆρθρο 2 - Σκοπός\nΗ δημοκρατία.');
  });
});

describe('document text — TXT and refusals', () => {
  it('reads Greek saved by older Windows programs', async () => {
    // «Άρθρο 1» in Windows-1253.
    const text = await documentText(Buffer.from([0xa2, 0xf1, 0xe8, 0xf1, 0xef, 0x20, 0x31]), 'a.txt');
    expect(text).toBe('Άρθρο 1');
  });

  it('tidies line ends, trailing spaces and runs of blank lines', async () => {
    const text = await documentText(Buffer.from('﻿Α  \r\n\r\n\r\n\r\nΒ\r\n'), 'a.txt');
    expect(text).toBe('Α\n\nΒ');
  });

  it('asks for DOCX or PDF instead of the old .doc', async () => {
    await expect(documentText(Buffer.from('x'), 'a.doc')).rejects.toBeInstanceOf(UnreadableDocumentError);
  });

  it('says so when a file is not what it claims', async () => {
    await expect(documentText(Buffer.from('not a zip'), 'a.docx')).rejects.toThrow(/Δεν ήταν δυνατό/);
    await expect(documentText(Buffer.from('   '), 'a.txt')).rejects.toThrow(/δεν έχει κείμενο/);
  });
});
