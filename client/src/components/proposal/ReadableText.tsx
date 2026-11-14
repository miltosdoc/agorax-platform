/**
 * A proposal's text as people read it: a comfortable measure and size,
 * headings for a statute's title, chapters and articles, list items with a
 * hanging indent, and — for a long statute — a table of contents.
 * The layout is read from the plain text (shared/readable-text.ts); the
 * text itself is shown word for word.
 */

import { Fragment, useMemo, type ReactNode } from 'react';
import { ListTree } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { readableBlocks, readableOutline, type ReadableBlock } from '@shared/readable-text';

interface ReadableTextProps {
  text: string;
  /** 'base' for the proposal itself; 'sm' inside ballots, amendments and lists. */
  size?: 'base' | 'sm';
  /** A table of contents above a statute with many articles. */
  outline?: boolean;
  /** Prefix for heading anchors, so two texts on one page do not clash. */
  idPrefix?: string;
  className?: string;
}

/** «**bold**» inside a line, the one inline mark worth keeping. */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((p, i) => (/^\*\*[^*\n]+\*\*$/.test(p) ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

const lines = (ls: string[]) => ls.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l)}</Fragment>);

export function ReadableText({ text, size = 'base', outline = false, idPrefix = 'text', className = '' }: ReadableTextProps) {
  const { t } = useTranslation();
  const blocks = useMemo(() => readableBlocks(text), [text]);
  const toc = useMemo(() => readableOutline(blocks), [blocks]);
  const articleCount = toc.filter((b) => b.kind === 'article').length;
  const sm = size === 'sm';

  const block = (b: ReadableBlock, i: number) => {
    switch (b.kind) {
      case 'title':
        return <h2 key={i} className={`${sm ? 'text-base' : 'text-xl sm:text-2xl'} mb-4 font-semibold leading-snug text-ink`}>{inline(b.text)}</h2>;
      case 'chapter':
        return (
          <h3 key={i} className={`${i === 0 ? '' : sm ? 'mt-5' : 'mt-10'} mb-2 border-b border-line pb-1 ${sm ? 'text-[11px]' : 'text-xs'} font-semibold uppercase tracking-[0.08em] text-kyanos`}>
            {inline(b.text)}
          </h3>
        );
      case 'article':
        return (
          <h4 key={i} id={`${idPrefix}-${b.id}`} className={`${i === 0 ? '' : sm ? 'mt-4' : 'mt-8'} mb-2 scroll-mt-24 ${sm ? 'text-sm' : 'text-lg'} font-semibold leading-snug text-ink`}>
            {inline(b.text)}
          </h4>
        );
      case 'heading':
        return <h4 key={i} className={`${i === 0 ? '' : sm ? 'mt-4' : 'mt-6'} mb-2 ${sm ? 'text-sm' : 'text-base'} font-semibold text-ink`}>{inline(b.text)}</h4>;
      case 'paragraph':
        return <p key={i} className={sm ? 'my-2' : 'my-4'}>{lines(b.lines)}</p>;
      case 'item':
        return (
          <div key={i} className={`flex gap-2 ${sm ? 'my-1.5' : 'my-3'} ${b.depth ? (sm ? 'pl-5' : 'pl-8') : ''}`}>
            <span className={`${sm ? 'w-6' : 'w-8'} shrink-0 text-right tabular-nums text-ink-soft`} aria-hidden="true">{b.marker}</span>
            <span className="min-w-0 flex-1"><span className="sr-only">{b.marker} </span>{lines(b.lines)}</span>
          </div>
        );
    }
  };

  return (
    <div className={`max-w-[70ch] break-words text-ink ${sm ? 'text-sm leading-relaxed' : 'text-[1.0625rem] leading-[1.75]'} ${className}`} data-testid="readable-text">
      {outline && articleCount >= 4 && (
        <details className="mb-6 rounded-xl border border-line bg-surface px-4 py-2 text-sm" data-testid="readable-outline">
          <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-medium text-ink">
            <ListTree className="h-4 w-4 text-kyanos" />
            {t('readable.outline', { n: articleCount })}
          </summary>
          <ol className="mb-2 mt-1 space-y-0.5">
            {toc.map((b, i) => b.kind === 'chapter'
              ? <li key={i} className="pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-kyanos">{b.text}</li>
              : (
                <li key={i}>
                  <a href={`#${idPrefix}-${b.id}`} className="block truncate rounded px-1 py-1 text-ink-soft hover:bg-sunken hover:text-ink"
                    onClick={(e) => { e.preventDefault(); document.getElementById(`${idPrefix}-${b.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                    {b.text}
                  </a>
                </li>
              ))}
          </ol>
        </details>
      )}
      {blocks.map(block)}
    </div>
  );
}
