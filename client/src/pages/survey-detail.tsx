/**
 * Survey detail — preview (creator), lifecycle actions (field/close),
 * results (raw + weighted side by side, k-anonymity floor respected
 * server-side) and the auto-generated methodology block.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertTriangle, Lock, Send } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import TierBadge from '@/components/surveys/TierBadge';
import ShareButton from '@/components/ShareButton';

interface PollDetail {
  poll: {
    id: number; tier: string; title: string; topicTag: string; status: string;
    creatorId: number | null; opensAt: string | null; closedAt: string | null;
    methodology: Record<string, any> | null;
  };
  items: Array<{ id: number; text: string; itemType: string; options: string[] | null; isModuleItem: boolean; isAttentionCheck: boolean }>;
  completion: { completed: number; qualityPassed: number };
}

interface Marginal {
  itemId: number; text: string; itemType: string; isModuleItem: boolean;
  options: string[] | null; answered: number;
  shares: number[] | null; weightedShares: number[] | null; openTextCount?: number;
}

interface ResultsPayload {
  suppressed: boolean;
  message?: string;
  completes: number;
  qualityExcluded?: number;
  marginals?: Marginal[];
  weighting?: {
    applied: boolean; effectiveN: number | null; designEffect: number | null;
    variablesUsed: string[]; engine: string | null; reason?: string;
  };
}

function Bar({ share, weighted }: { share: number; weighted: number | null }) {
  return (
    <div className="space-y-0.5">
      <div className="h-2 bg-muted rounded overflow-hidden">
        <div className="h-full bg-primary/50" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      {weighted !== null && (
        <div className="h-2 bg-muted rounded overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${Math.round(weighted * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

export default function SurveyDetailPage() {
  const [, params] = useRoute('/surveys/:id');
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const id = params?.id ? parseInt(params.id, 10) : NaN;

  const [detail, setDetail] = useState<PollDetail | null>(null);
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!Number.isFinite(id)) return;
    api.get<PollDetail>(`/api/surveys/${id}`)
      .then((r) => {
        setDetail(r.data);
        const p = r.data.poll;
        const isCreator = user && p.creatorId === user.id;
        if (p.status === 'closed' || (p.status === 'live' && isCreator)) {
          api.get<ResultsPayload>(`/api/surveys/${id}/results`)
            .then((res) => setResults(res.data))
            .catch(() => {});
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : t('surveys.detail.loadError')));
  }, [id, user]);

  useEffect(load, [load]);

  async function action(path: 'field' | 'close') {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/surveys/${id}/${path}`, {});
      setResults(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('surveys.detail.actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <AppShell title={t('surveys.detail.title')}>
        {error
          ? <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
          : <div className="py-12 text-center text-sm text-muted-foreground">{t('surveys.loading')}</div>}
      </AppShell>
    );
  }

  const { poll, items, completion } = detail;
  const isCreator = user && poll.creatorId === user.id;
  const weighting = results?.weighting;

  return (
    <AppShell title={poll.title} breadcrumb={[{ label: t('surveys.title'), href: '/surveys' }, { label: `#${poll.id}` }]}>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <TierBadge tier={poll.tier} />
        <Badge variant="secondary">{t(`surveys.status.${poll.status}`)}</Badge>
        <span className="text-xs text-muted-foreground">{t('surveys.detail.completions', { completed: completion.completed, passed: completion.qualityPassed })}</span>
        {(poll.status === 'live' || poll.status === 'closed') && (
          <ShareButton url={`/surveys/${poll.id}`} title={poll.title} text={poll.topicTag} variant="ghost" iconOnly />
        )}
      </div>

      {poll.tier === 'community' && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 mb-4">
          {t('surveys.detail.unofficialNote')}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {isCreator && poll.status === 'draft' && (
        <Card className="mb-4">
          <CardContent className="py-4 flex items-center justify-between gap-3">
            <p className="text-sm">{t('surveys.detail.draftReady')}</p>
            <Button onClick={() => action('field')} disabled={busy}>
              <Send className="w-4 h-4 mr-1" /> {t('surveys.detail.publish')}
            </Button>
          </CardContent>
        </Card>
      )}
      {isCreator && poll.status === 'live' && (
        <Card className="mb-4">
          <CardContent className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm">{t('surveys.detail.liveNote')}</p>
            <div className="flex gap-2 shrink-0">
              <Button onClick={() => navigate(`/surveys/${poll.id}/take`)} disabled={busy}>
                {t('surveys.take')}
              </Button>
              <Button variant="outline" onClick={() => action('close')} disabled={busy}>
                <Lock className="w-4 h-4 mr-1" /> {t('surveys.detail.close')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Results ── */}
      {results && results.suppressed && (
        <Card className="mb-4">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{results.message}</CardContent>
        </Card>
      )}

      {results && !results.suppressed && results.marginals && (
        <div className="grid gap-4 mb-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('surveys.results')}</CardTitle>
              <CardDescription>
                n={results.completes}
                {typeof results.qualityExcluded === 'number' && results.qualityExcluded > 0 && ` ${t('surveys.detail.qualityExcluded', { n: results.qualityExcluded })}`}
                {weighting?.applied
                  ? ` · ${t('surveys.detail.weighted', { effn: weighting.effectiveN ?? '—', deff: weighting.designEffect ?? '—' })}`
                  : ` · ${t('surveys.detail.unweighted')}`}
              </CardDescription>
              {weighting?.applied && (
                <p className="text-xs text-muted-foreground">
                  {t('surveys.detail.barsLegend', { vars: weighting.variablesUsed.join(', ') })}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {results.marginals.map((m) => (
                <div key={m.itemId}>
                  <p className="text-sm font-medium mb-2">
                    {m.isModuleItem && <Badge variant="outline" className="mr-1 text-xs">{t('surveys.detail.module')}</Badge>}
                    {m.text}
                  </p>
                  {m.itemType === 'open_text' ? (
                    <p className="text-xs text-muted-foreground">{t('surveys.detail.openTextCount', { n: m.openTextCount ?? 0 })}</p>
                  ) : m.options && m.shares ? (
                    <div className="space-y-2">
                      {m.options.map((opt, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                          <div>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span>{opt}</span>
                              <span className="text-muted-foreground">
                                {(m.shares![idx] * 100).toFixed(0)}%
                                {m.weightedShares ? ` → ${(m.weightedShares[idx] * 100).toFixed(0)}%` : ''}
                              </span>
                            </div>
                            <Bar share={m.shares![idx]} weighted={m.weightedShares?.[idx] ?? null} />
                          </div>
                        </div>
                      ))}
                      <p className="text-[11px] text-muted-foreground">n={m.answered}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Methodology (auto-generated, frozen at close) ── */}
      {poll.status === 'closed' && poll.methodology && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('surveys.detail.methodology')}</CardTitle>
            <CardDescription>{t('surveys.detail.methodologySub')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-3 text-sm mb-3">
              <div><span className="text-muted-foreground">{t('surveys.detail.sample')}</span> {poll.methodology.n}</div>
              <div><span className="text-muted-foreground">{t('surveys.detail.excluded')}</span> {poll.methodology.qualityExcluded}</div>
              <div><span className="text-muted-foreground">{t('surveys.detail.period')}</span> {poll.methodology.fieldStart ? new Date(poll.methodology.fieldStart).toLocaleDateString(locale === 'en' ? 'en-US' : 'el-GR') : '—'} – {poll.methodology.fieldEnd ? new Date(poll.methodology.fieldEnd).toLocaleDateString(locale === 'en' ? 'en-US' : 'el-GR') : '—'}</div>
              <div><span className="text-muted-foreground">{t('surveys.detail.cohort')}</span> {poll.methodology.cohortNote}</div>
              {poll.methodology.weighting?.method !== 'none' ? (
                <>
                  <div><span className="text-muted-foreground">{t('surveys.detail.weighting')}</span> {poll.methodology.weighting.method}</div>
                  <div><span className="text-muted-foreground">{t('surveys.detail.variables')}</span> {poll.methodology.weighting.variables?.join(', ')}</div>
                  <div><span className="text-muted-foreground">Effective n:</span> {poll.methodology.weighting.effectiveN}</div>
                  <div><span className="text-muted-foreground">Design effect:</span> {poll.methodology.weighting.designEffect}</div>
                </>
              ) : (
                <div className="sm:col-span-2"><span className="text-muted-foreground">{t('surveys.detail.weighting')}</span> {t('surveys.detail.noWeighting', { reason: poll.methodology.weighting?.reason })}</div>
              )}
            </div>
            <Accordion type="single" collapsible>
              <AccordionItem value="wording">
                <AccordionTrigger className="text-sm">{t('surveys.detail.wording')}</AccordionTrigger>
                <AccordionContent>
                  <ol className="space-y-2 text-xs">
                    {(poll.methodology.questionWording ?? []).map((q: any, i: number) => (
                      <li key={i}>
                        <p className="font-medium">{q.isModuleItem ? `[${t('surveys.detail.module')}] ` : ''}{q.text}</p>
                        {q.options && <p className="text-muted-foreground">{q.options.join(' · ')}</p>}
                      </li>
                    ))}
                  </ol>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="disclosure">
                <AccordionTrigger className="text-sm">{t('surveys.detail.provenance')}</AccordionTrigger>
                <AccordionContent className="text-xs space-y-2">
                  <p>{poll.methodology.disclosure}</p>
                  {poll.methodology.compiler && (
                    <p className="text-muted-foreground">
                      {poll.methodology.compiler.generator === 'llm' ? t('surveys.detail.compilerLlm') : poll.methodology.compiler.generator}
                    </p>
                  )}
                  {poll.methodology.weighting?.marginsSource && (
                    <p className="text-muted-foreground">{t('surveys.detail.marginsSource', { src: poll.methodology.weighting.marginsSource })}</p>
                  )}
                  {poll.methodology.gatekeeper?.flags?.length > 0 && (
                    <div className={poll.methodology.gatekeeper.approved ? 'text-muted-foreground' : 'text-red-700'}>
                      <p className="font-medium">
                        {poll.methodology.gatekeeper.approved
                          ? t('surveys.detail.gkWarn')
                          : t('surveys.detail.gkBlocked')}
                      </p>
                      <ul className="list-disc pl-4">
                        {poll.methodology.gatekeeper.flags.map((f: any, i: number) => (
                          <li key={i}><strong>{f.issue}</strong>: {f.explanation}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* ── Item preview for drafts ── */}
      {poll.status === 'draft' && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t('surveys.detail.questions')}</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {items.map((item, i) => (
                <li key={item.id}>
                  <p className="font-medium">{i + 1}. {item.text} {item.isAttentionCheck && <Badge variant="secondary" className="ml-1 text-xs">{t('surveys.create.attention')}</Badge>}</p>
                  {item.options && <p className="text-xs text-muted-foreground">{item.options.join(' · ')}</p>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Creators already get a take button in the lifecycle card above. */}
      {poll.status === 'live' && !isCreator && (
        <Button onClick={() => navigate(`/surveys/${poll.id}/take`)}>{t('surveys.detail.takeCta')}</Button>
      )}
    </AppShell>
  );
}
