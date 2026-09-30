/**
 * The ballot a statute will have, shown in the proposal form before anyone
 * presses «Έναρξη ψηφοφορίας»: one question on the whole, one per article
 * (shared/article-ballot.ts). The articles are read from the text as the
 * author writes it, so a heading the platform does not recognise, or two
 * articles run together, show up here while they can still be fixed —
 * each article can be corrected in place, and the text follows.
 */

import { useState } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/hooks/use-translation';
import { replaceSections, sectionText, statuteSections } from '@shared/statute-articles';

interface ArticlePreviewProps {
  text: string;
  onChange: (text: string) => void;
  /** The author chose options of their own, which rule out voting by article. */
  withOptions: boolean;
  /** Co-drafting comes first, so the text may still change before the vote. */
  codrafted: boolean;
}

export function ArticlePreview({ text, onChange, withOptions, codrafted }: ArticlePreviewProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<{ ref: string; value: string } | null>(null);
  const sections = statuteSections(text);
  if (!sections) return null;
  const articles = sections.filter((s) => s.heading);

  const save = () => {
    if (!editing) return;
    const current = statuteSections(text);
    if (current?.some((s) => s.ref === editing.ref)) {
      onChange(replaceSections(text, current, new Map([[editing.ref, editing.value]])));
    }
    setEditing(null);
  };

  return (
    <section className="rounded-lg border bg-muted/30 p-4 space-y-3" data-testid="article-preview">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{t('proposal.ballot_preview_title')}</h3>
        <p className="text-sm text-foreground/80">{t('proposal.ballot_preview_intro', { n: articles.length })}</p>
        {codrafted && <p className="text-xs text-foreground/70">{t('proposal.ballot_preview_codrafted')}</p>}
      </div>

      {withOptions && (
        <p className="flex items-start gap-2 rounded-md border border-kata/30 bg-kata-wash/50 px-3 py-2 text-sm text-kata" data-testid="article-preview-options">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('proposal.ballot_preview_options')}
        </p>
      )}

      <ol className="divide-y rounded-md border bg-background">
        {sections.map((s) => {
          const body = sectionText(text, s);
          const isEditing = editing?.ref === s.ref;
          return (
            <li key={s.ref} data-testid={`article-preview-${s.ref}`}>
              <details open={isEditing || undefined}>
                <summary className="cursor-pointer px-3 py-2 text-sm">
                  {s.heading ?? <span className="text-foreground/70">{t('proposal.ballot_preview_preamble')}</span>}
                </summary>
                <div className="space-y-2 px-3 pb-3">
                  {isEditing ? (
                    <>
                      <Textarea
                        value={editing.value}
                        onChange={(e) => setEditing({ ref: s.ref, value: e.target.value })}
                        className="min-h-[160px] text-sm"
                        data-testid={`article-preview-edit-${s.ref}`}
                      />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={save} data-testid={`article-preview-save-${s.ref}`}>
                          {t('proposal.ballot_preview_save')}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          {t('general.cancel')}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="whitespace-pre-wrap border-l-2 pl-3 text-sm leading-relaxed text-foreground">
                        {s.heading ? body.slice(s.heading.length).trim() : body}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setEditing({ ref: s.ref, value: body })}
                        data-testid={`article-preview-fix-${s.ref}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t('proposal.ballot_preview_fix')}
                      </Button>
                    </>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-foreground/70">{t('proposal.ballot_preview_headings')}</p>
    </section>
  );
}
