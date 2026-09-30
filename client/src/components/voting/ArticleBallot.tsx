/**
 * The ballot and the results of a statute voted article by article and on
 * the whole — see shared/article-ballot.ts.
 *
 * Kept short on purpose. The voter answers the whole first; «Ναι» there
 * marks every article Yes, so most voters are done in one tap. The articles
 * stay folded until someone wants to change one, and an article left
 * unanswered counts as an abstention.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Vote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/use-translation';
import {
  encodeArticleChoice,
  type ArticleAnswer,
  type ArticleBallot,
  type ArticleChoice,
  type ArticleResult,
  type WholeAnswer,
} from '@shared/article-ballot';

type Translate = (key: string, params?: Record<string, string | number>) => string;

const VERSION_NAMES = 'ΑΒΓΔΕΖΗΘΙΚΛΜ';
export const versionName = (index: number) => VERSION_NAMES[index] ?? String(index + 1);

/** «Άρθρο 5», from the heading «Άρθρο 5 - Αποβολή μέλους». */
const shortHeading = (heading: string) => heading.split(/\s+[-–—:.]\s*/)[0] || heading;

/** One line for a ballot: how the whole and the articles were answered. */
export function describeArticleChoice(t: Translate, choice: ArticleChoice): string {
  const count = { yes: 0, no: 0, abstain: 0 };
  for (const a of choice.articles) {
    if (a === 'no') count.no++;
    else if (a === 'abstain') count.abstain++;
    else count.yes++;
  }
  const whole = choice.whole === 'yes' ? t('vote.article_yes') : choice.whole === 'no' ? t('vote.article_no') : t('proposal.abstain');
  return t('vote.article_choice_summary', { whole, yes: count.yes, no: count.no, abstain: count.abstain });
}

interface ArticleBallotFormProps {
  ballot: ArticleBallot;
  /** A ballot already cast, when a pseudonymous voter changes it. */
  initial?: ArticleChoice | null;
  disabled?: boolean;
  onSubmit: (choice: string) => void;
  onCancel?: () => void;
}

export function ArticleBallotForm({ ballot, initial, disabled, onSubmit, onCancel }: ArticleBallotFormProps) {
  const { t } = useTranslation();
  const [whole, setWhole] = useState<WholeAnswer | null>(initial?.whole ?? null);
  const [answers, setAnswers] = useState<Array<ArticleAnswer | null>>(
    () => ballot.articles.map((_, i) => initial?.articles[i] ?? null),
  );
  const [open, setOpen] = useState(false);

  const chooseWhole = (answer: WholeAnswer) => {
    setWhole(answer);
    // «Ναι» on the whole marks every article not yet answered as Yes (A);
    // the voter can still turn any of them to No.
    if (answer === 'yes') setAnswers((prev) => prev.map((a) => a ?? 0));
  };

  const tally = useMemo(() => {
    const c = { yes: 0, no: 0, abstain: 0 };
    for (const a of answers) {
      if (a === 'no') c.no++;
      else if (a === null || a === 'abstain') c.abstain++;
      else c.yes++;
    }
    return c;
  }, [answers]);

  const submit = () => {
    if (!whole) return;
    onSubmit(encodeArticleChoice(ballot, {
      whole,
      articles: answers.map((a) => a ?? 'abstain'),
    }));
  };

  const wholeButton = (answer: WholeAnswer, label: string, tone: string) => (
    <Button
      type="button"
      variant={whole === answer ? 'default' : 'outline'}
      className={whole === answer ? tone : ''}
      onClick={() => chooseWhole(answer)}
      disabled={disabled}
      aria-pressed={whole === answer}
      data-testid={`article-whole-${answer}`}
    >
      {label}
    </Button>
  );

  return (
    <div className="space-y-4" data-testid="article-ballot">
      <div className="space-y-2">
        <div className="text-sm font-medium">{t('vote.article_whole')}</div>
        <div className="grid grid-cols-3 gap-2">
          {wholeButton('yes', t('vote.article_yes'), 'bg-yper hover:bg-yper text-white border-transparent')}
          {wholeButton('no', t('vote.article_no'), 'bg-kata hover:bg-kata text-white border-transparent')}
          {wholeButton('abstain', t('proposal.abstain'), '')}
        </div>
        <p className="text-xs text-muted-foreground">{t('vote.article_whole_hint')}</p>
      </div>

      <div className="rounded-md border">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          data-testid="article-list-toggle"
        >
          <span>
            <span className="font-medium">{t('vote.article_list', { n: ballot.articles.length })}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {t('vote.article_list_summary', tally)}
            </span>
          </span>
          {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
        </button>
        {open && (
          <ul className="divide-y border-t">
            {ballot.articles.map((q, i) => {
              const answer = answers[i];
              const set = (a: ArticleAnswer) => setAnswers((prev) => prev.map((x, j) => (j === i ? a : x)));
              const choices: Array<{ value: ArticleAnswer; label: string }> = [
                ...(q.versions.length > 1
                  ? q.versions.map((_, v) => ({ value: v as ArticleAnswer, label: versionName(v) }))
                  : [{ value: 0 as ArticleAnswer, label: t('vote.article_yes') }]),
                { value: 'no', label: t('vote.article_no') },
                { value: 'abstain', label: '–' },
              ];
              return (
                <li key={q.ref} className="px-3 py-2" data-testid={`article-row-${q.ref}`}>
                  <div className="flex items-center gap-2">
                    <details className="min-w-0 flex-1">
                      <summary className="cursor-pointer truncate text-sm" title={q.heading}>
                        {q.heading}
                        {q.changed && (
                          <Badge variant="outline" className="ml-2 align-middle text-[10px]">{t('vote.article_changed')}</Badge>
                        )}
                      </summary>
                      <div className="mt-2 space-y-2">
                        {q.versions.map((text, v) => (
                          <div key={v} className="max-h-72 overflow-y-auto whitespace-pre-wrap border-l-2 pl-3 text-sm leading-relaxed text-foreground">
                            {q.versions.length > 1 && (
                              <div className="mb-1 font-medium text-foreground">{t('vote.article_version', { letter: versionName(v) })}</div>
                            )}
                            {text}
                          </div>
                        ))}
                      </div>
                    </details>
                    <div className="flex shrink-0 overflow-hidden rounded-md border" role="radiogroup" aria-label={q.heading}>
                      {choices.map((c) => (
                        <button
                          key={String(c.value)}
                          type="button"
                          role="radio"
                          aria-checked={answer === c.value}
                          disabled={disabled}
                          onClick={() => set(c.value)}
                          className={`min-w-[2.25rem] px-2 py-1 text-xs transition-colors ${
                            answer === c.value
                              ? c.value === 'no' ? 'bg-kata text-white' : c.value === 'abstain' ? 'bg-muted-foreground text-white' : 'bg-yper text-white'
                              : 'hover:bg-muted'
                          }`}
                          data-testid={`article-${q.ref}-${c.value}`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('vote.article_unanswered')}</p>

      <Button className="w-full gap-2" onClick={submit} disabled={disabled || !whole} data-testid="article-ballot-submit">
        <Vote className="h-4 w-4" />
        {t('vote.option_confirm') || 'Επιβεβαίωση ψήφου'}
      </Button>
      {onCancel && (
        <Button variant="ghost" size="sm" onClick={onCancel}>{t('general.cancel')}</Button>
      )}
    </div>
  );
}

interface ArticleResultsProps {
  ballot: ArticleBallot;
  results: ArticleResult[];
  /** The vote has closed: say adopted / not adopted instead of carrying / not. */
  closed: boolean;
  /** Where to start a new co-drafting for the articles that did not pass. */
  onRedraft?: () => void;
}

export function ArticleResults({ ballot, results, closed, onRedraft }: ArticleResultsProps) {
  const { t } = useTranslation();
  const carrying = results.filter((r) => (closed ? r.adopted : r.passes)).length;
  const rejected = closed ? results.filter((r) => !r.adopted) : [];
  return (
    <div className="space-y-3" data-testid="article-results">
      <details className="rounded-md border">
        <summary className="cursor-pointer px-3 py-2.5 text-sm">
          <span className="font-medium">{t('vote.article_results')}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {t(closed ? 'vote.article_results_adopted' : 'vote.article_results_carrying', { n: carrying, total: results.length })}
          </span>
        </summary>
        <ul className="divide-y border-t text-sm">
          {results.map((r, i) => {
            const q = ballot.articles[i];
            const ok = closed ? r.adopted : r.passes;
            const counts = q && q.versions.length > 1
              ? r.versions.map((n, v) => `${versionName(v)} ${n}`).join(' · ')
              : `${t('vote.article_yes')} ${r.versions[0] ?? 0}`;
            return (
              <li key={r.ref} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate" title={r.heading}>{r.heading}</span>
                <span className="shrink-0 text-xs tabular-nums text-foreground/80">
                  {counts} · {t('vote.article_no')} {r.no} · – {r.abstain}
                </span>
                <Badge variant={ok ? 'default' : 'secondary'} className="shrink-0">
                  {ok
                    ? q && q.versions.length > 1 && r.winner !== null
                      ? t('vote.article_version', { letter: versionName(r.winner) })
                      : t(closed ? 'vote.article_adopted' : 'vote.article_carrying')
                    : t(closed ? 'vote.article_rejected' : 'vote.article_not_carrying')}
                </Badge>
              </li>
            );
          })}
        </ul>
      </details>
      {rejected.length > 0 && rejected.length < results.length && (
        <div className="rounded-md border border-kata/30 bg-kata-wash/40 px-3 py-2.5 text-sm space-y-2" data-testid="article-rejected">
          <p>{t('vote.article_rejected_list', { list: rejected.map((r) => shortHeading(r.heading)).join(', ') })}</p>
          {onRedraft && (
            <Button size="sm" variant="outline" onClick={onRedraft} data-testid="article-redraft">
              {t('vote.article_redraft')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
