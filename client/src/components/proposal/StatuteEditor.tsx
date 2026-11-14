/**
 * The statute editor in the proposal form: the document's title and
 * introduction, then chapters and articles as cards — add, remove, move,
 * title and text for each. It reads and writes the proposal's text through
 * shared/statute-doc.ts, so whatever the author pastes, attaches or the AI
 * fills in shows up here as cards, and everything downstream (the ballot by
 * article, amendments by article, the constitution) reads what it writes.
 *
 * The text is only rewritten when the author edits a card: a pasted statute
 * keeps its own wording until then.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ListOrdered, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/hooks/use-translation';
import {
  chapterNumeral, composeStatuteDoc, emptyStatuteDoc, nextNumber, parseStatuteDoc, renumberArticles,
  repeatedNumbers, type StatuteBlock, type StatuteDoc,
} from '@shared/statute-doc';
import { StatuteStructureHint } from '@/components/proposal/ArticlePreview';

interface StatuteEditorProps {
  text: string;
  onChange: (text: string) => void;
}

const docFrom = (text: string): StatuteDoc | null => (text.trim() ? parseStatuteDoc(text) : emptyStatuteDoc());

const iconButton = 'h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground';

export function StatuteEditor({ text, onChange }: StatuteEditorProps) {
  const { t } = useTranslation();
  const [doc, setDoc] = useState<StatuteDoc | null>(() => docFrom(text));
  const written = useRef<string | null>(null);

  // Text that changed from outside — a paste in the text view, a document,
  // the AI — is read again; text this editor just wrote is not.
  useEffect(() => {
    if (text === written.current) return;
    setDoc(docFrom(text));
  }, [text]);

  if (!doc) {
    return (
      <div className="space-y-3" data-testid="statute-editor-unread">
        <StatuteStructureHint text={text} onChange={onChange} />
        <p className="text-sm text-muted-foreground">{t('statute.unread_hint')}</p>
      </div>
    );
  }

  const update = (next: StatuteDoc) => {
    setDoc(next);
    const composed = composeStatuteDoc(next);
    written.current = composed;
    onChange(composed);
  };
  const setBlock = (i: number, patch: Partial<StatuteBlock>) =>
    update({ ...doc, blocks: doc.blocks.map((b, j) => (j === i ? ({ ...b, ...patch } as StatuteBlock) : b)) });
  const insert = (at: number, block: StatuteBlock) =>
    update({ ...doc, blocks: [...doc.blocks.slice(0, at), block, ...doc.blocks.slice(at)] });
  const remove = (i: number) => {
    const b = doc.blocks[i];
    const filled = b.kind === 'article' ? (b.title || b.body).trim() : b.title.trim();
    if (filled && !window.confirm(t(b.kind === 'article' ? 'statute.remove_article_confirm' : 'statute.remove_chapter_confirm'))) return;
    update({ ...doc, blocks: doc.blocks.filter((_, j) => j !== i) });
  };
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= doc.blocks.length) return;
    const blocks = [...doc.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    update({ ...doc, blocks });
  };
  const newArticle = (): StatuteBlock => ({ kind: 'article', number: nextNumber(doc), title: '', body: '' });

  const articles = doc.blocks.filter((b) => b.kind === 'article').length;
  const repeated = new Set(repeatedNumbers(doc));
  let chapterIndex = 0;

  const controls = (i: number, label: string) => (
    <div className="flex shrink-0 items-center">
      <Button type="button" variant="ghost" size="icon" className={iconButton} disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('statute.move_up', { item: label })}><ArrowUp className="h-4 w-4" /></Button>
      <Button type="button" variant="ghost" size="icon" className={iconButton} disabled={i === doc.blocks.length - 1} onClick={() => move(i, 1)} aria-label={t('statute.move_down', { item: label })}><ArrowDown className="h-4 w-4" /></Button>
      <Button type="button" variant="ghost" size="icon" className={`${iconButton} hover:text-destructive`} onClick={() => remove(i)} aria-label={t('statute.remove', { item: label })}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="statute-editor">
      <div className="space-y-2">
        <Input
          value={doc.title}
          onChange={(e) => update({ ...doc, title: e.target.value })}
          placeholder={t('statute.title_ph')}
          aria-label={t('statute.title')}
          className="text-base font-semibold"
          data-testid="statute-title"
        />
        <Textarea
          value={doc.intro}
          onChange={(e) => update({ ...doc, intro: e.target.value })}
          placeholder={t('statute.intro_ph')}
          aria-label={t('statute.intro')}
          rows={doc.intro ? Math.min(8, doc.intro.split('\n').length + 1) : 2}
          className="text-sm"
          data-testid="statute-intro"
        />
      </div>

      <p className={`rounded-md px-3 py-2 text-sm ${repeated.size ? 'border border-destructive/40 bg-destructive/5 text-destructive' : 'bg-muted/50 text-foreground/80'}`} data-testid="statute-ballot-summary">
        {repeated.size
          ? t('statute.repeated', { refs: [...repeated].join(', ') })
          : articles >= 2 ? t('statute.ballot_summary', { n: articles }) : t('statute.ballot_needs_two')}
      </p>

      <ol className="space-y-3">
        {doc.blocks.map((b, i) => {
          if (b.kind === 'chapter') {
            const numeral = chapterNumeral(chapterIndex++);
            const label = t('statute.chapter_label', { n: numeral });
            return (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2" data-testid={`statute-chapter-${i}`}>
                <span className="shrink-0 text-sm font-semibold uppercase tracking-wide">{label}</span>
                <Input value={b.title} onChange={(e) => setBlock(i, { title: e.target.value })} placeholder={t('statute.chapter_title_ph')} aria-label={t('statute.chapter_title', { n: numeral })} className="h-9 flex-1 bg-background" />
                {controls(i, label)}
              </li>
            );
          }
          const label = t('statute.article_label', { n: b.number });
          const dup = repeated.has(b.number);
          return (
            <li key={i} className={`space-y-2 rounded-lg border p-3 ${dup ? 'border-destructive/60' : ''}`} data-testid={`statute-article-${i}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{t('statute.article_word')}</span>
                <Input value={b.number} onChange={(e) => setBlock(i, { number: e.target.value.replace(/[^0-9Α-ΩA-Z]/g, '').slice(0, 4) })} aria-label={t('statute.article_number')} aria-invalid={dup || undefined} className={`h-9 w-16 text-center ${dup ? 'border-destructive text-destructive' : ''}`} />
                <Input value={b.title} onChange={(e) => setBlock(i, { title: e.target.value })} placeholder={t('statute.article_title_ph')} aria-label={t('statute.article_title', { n: b.number })} className="h-9 min-w-[10rem] flex-1" />
                {controls(i, label)}
              </div>
              <Textarea
                value={b.body}
                onChange={(e) => setBlock(i, { body: e.target.value })}
                placeholder={t('statute.article_body_ph')}
                aria-label={t('statute.article_body', { n: b.number })}
                rows={Math.min(14, Math.max(3, b.body.split('\n').length + 1))}
                className="text-sm leading-relaxed"
              />
              <button type="button" onClick={() => insert(i + 1, newArticle())} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Plus className="h-3 w-3" />{t('statute.add_article_after')}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="gap-1.5" onClick={() => insert(doc.blocks.length, newArticle())} data-testid="statute-add-article">
          <Plus className="h-4 w-4" />{t('statute.add_article')}
        </Button>
        <Button type="button" variant="outline" className="gap-1.5" onClick={() => insert(doc.blocks.length, { kind: 'chapter', title: '' })} data-testid="statute-add-chapter">
          <Plus className="h-4 w-4" />{t('statute.add_chapter')}
        </Button>
        {articles > 1 && (
          <Button type="button" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => { if (window.confirm(t('statute.renumber_confirm'))) update(renumberArticles(doc)); }} data-testid="statute-renumber">
            <ListOrdered className="h-4 w-4" />{t('statute.renumber')}
          </Button>
        )}
      </div>
    </div>
  );
}
