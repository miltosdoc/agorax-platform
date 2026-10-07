/** Create or resume a survey draft; publication freezes the questionnaire. */
import { useEffect, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState } from '@/components/ui/empty-state';
import { AlertTriangle, ArrowLeft, Plus, Save, Sparkles, Send, Trash2, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { canEditSurveyDraft, hydrateSurveyDraft, isFixedSurveyItem, surveyDraftPatch, validSurveyDraft, type SurveyDraftItem, type SurveyDraftResponse } from '@/lib/survey-draft';

export default function SurveyCreatePage() {
  const [, navigate] = useLocation();
  const [editing, params] = useRoute('/surveys/:id/edit');
  const draftId = editing && params?.id ? Number(params.id) : null;
  const { user } = useAuth();
  const { t } = useTranslation();
  const [intent, setIntent] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [saved, setSaved] = useState(false);
  const [compiled, setCompiled] = useState<SurveyDraftResponse | null>(null);
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<SurveyDraftItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setCompiled(null);
    setError(null);
    setUnavailable(false);
    setSaved(false);
    if (!editing) {
      setLoading(false);
      return;
    }
    if (!draftId || !Number.isInteger(draftId) || draftId < 1) {
      setUnavailable(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.get<SurveyDraftResponse>(`/api/surveys/${draftId}`)
      .then(({ data }) => {
        if (cancelled) return;
        if (!canEditSurveyDraft(data.poll, user?.id)) {
          setUnavailable(true);
          return;
        }
        const draft = hydrateSurveyDraft(data);
        setCompiled(data);
        setTitle(draft.title);
        setItems(draft.items);
      })
      .catch((e) => {
        if (!cancelled) {
          setUnavailable(true);
          setError(e instanceof ApiError ? e.message : t('surveys.detail.loadError'));
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [draftId, editing, user?.id]);

  async function compile() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<SurveyDraftResponse>('/api/surveys', { intent });
      const draft = hydrateSurveyDraft(data);
      setCompiled(data);
      setTitle(draft.title);
      setItems(draft.items);
      setSaved(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('surveys.create.compileFailed'));
    } finally {
      setBusy(false);
    }
  }

  function patchItem(id: number, patch: Partial<SurveyDraftItem>) {
    setSaved(false);
    setItems((list) => list.map((item) => item.id === id && !isFixedSurveyItem(item) ? { ...item, ...patch } : item));
  }

  const editedValid = validSurveyDraft(title, items);
  const editableItems = items.filter((item) => !item.deleted && !isFixedSurveyItem(item));
  const fixedItems = items.filter(isFixedSurveyItem);
  const verdict = compiled ? hydrateSurveyDraft(compiled).verdict : null;

  async function save(publish: boolean) {
    if (!compiled || !editedValid || !canEditSurveyDraft(compiled.poll, user?.id)) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { data } = await api.patch<SurveyDraftResponse>(`/api/surveys/${compiled.poll.id}`, surveyDraftPatch(title, items));
      const draft = hydrateSurveyDraft(data);
      setCompiled(data);
      setTitle(draft.title);
      setItems(draft.items);
      if (publish) {
        await api.post(`/api/surveys/${compiled.poll.id}/field`, {});
        navigate(`/surveys/${compiled.poll.id}`);
      } else {
        setSaved(true);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t(publish ? 'surveys.create.publishFailed' : 'redesign.surveys.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={t(editing ? 'redesign.surveys.editTitle' : 'surveys.create.title')}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/surveys" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />{t('redesign.surveys.back')}
        </Link>
        {loading ? <LoadingState label={t('redesign.surveys.loadingDraft')} /> : unavailable ? (
          <Card><CardContent className="space-y-4 py-6">
            <p role="alert" className="text-base">{error ?? t('redesign.surveys.cannotEdit')}</p>
            {draftId && <Button variant="outline" onClick={() => navigate(`/surveys/${draftId}`)}>{t('redesign.surveys.viewPoll')}</Button>}
          </CardContent></Card>
        ) : (
          <>
            <ol className="grid grid-cols-3 gap-2 text-sm" aria-label={t('surveys.create.title')}>
              {['Describe', 'Edit', 'Publish'].map((step, i) => (
                <li key={step} aria-current={(compiled ? i === 1 : i === 0) ? 'step' : undefined} className={`min-w-0 break-words rounded-lg px-2 py-3 text-xs sm:px-3 sm:text-sm ${((compiled ? 1 : 0) === i) ? 'bg-primary/10 font-semibold text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {t(`redesign.surveys.step${step}`)}
                </li>
              ))}
            </ol>
            {!compiled ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">{t('surveys.create.promptTitle')}</CardTitle>
                  <CardDescription className="text-base leading-relaxed">{t('surveys.create.intro')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Label htmlFor="survey-intent">{t('surveys.create.promptTitle')}</Label>
                  <Textarea id="survey-intent" value={intent} onChange={(e) => setIntent(e.target.value)} rows={5} maxLength={2000} placeholder={t('surveys.create.promptHint')} className="text-base" disabled={busy} aria-describedby="survey-intent-hint" />
                  <p id="survey-intent-hint" className="text-sm text-muted-foreground">{t('redesign.surveys.intentHint')}</p>
                  {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                  <Button onClick={compile} disabled={intent.trim().length < 10 || busy} size="lg">
                    <Sparkles className="mr-2 h-4 w-4" />{busy ? t('surveys.create.compiling') : t('surveys.create.compile')}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">{t('redesign.surveys.editTitle')}</CardTitle>
                  <CardDescription className="text-base leading-relaxed">{t('redesign.surveys.editHint')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <fieldset disabled={busy} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="survey-title">{t('redesign.surveys.titleLabel')}</Label>
                      <Input id="survey-title" value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} maxLength={200} className="h-11 text-base" />
                    </div>
                    {verdict && verdict.flags.length > 0 && (
                      <details className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <summary className="cursor-pointer font-medium">{t('surveys.detail.gkWarn')}</summary>
                        <div className="mt-3 space-y-2">
                          {!verdict.approved && <p>{t('surveys.create.flagsBlocked')}</p>}
                          {verdict.flags.map((flag, i) => <p key={i}><strong>{flag.issue}</strong>: {flag.explanation}</p>)}
                        </div>
                      </details>
                    )}
                    <ol className="space-y-4">
                      {editableItems.map((item, i) => (
                        <li key={item.id} className="space-y-3 rounded-lg border p-4 sm:p-5">
                          <div className="flex items-center justify-between gap-3">
                            <Label htmlFor={`survey-question-${item.id}`} className="text-base font-semibold">{t('redesign.surveys.question', { n: i + 1 })}</Label>
                            <Button variant="ghost" size="icon" className="text-red-700" aria-label={t('redesign.surveys.removeQuestion', { n: i + 1 })} disabled={editableItems.length <= 1} onClick={() => patchItem(item.id, { deleted: true })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <Textarea id={`survey-question-${item.id}`} value={item.text} onChange={(e) => patchItem(item.id, { text: e.target.value })} rows={2} maxLength={500} className="text-base" />
                          <Badge variant="outline">{t(`surveys.itemType.${item.itemType}`)}</Badge>
                          {item.options && (
                            <div className="space-y-3">
                              {item.options.map((option, j) => (
                                <div key={j} className="flex items-center gap-2">
                                  <Label className="sr-only" htmlFor={`survey-answer-${item.id}-${j}`}>{t('redesign.surveys.answer', { n: j + 1 })}</Label>
                                  <Input id={`survey-answer-${item.id}-${j}`} value={option} maxLength={200} className="h-11 text-base" placeholder={t('redesign.surveys.answer', { n: j + 1 })} onChange={(e) => patchItem(item.id, { options: item.options!.map((value, index) => index === j ? e.target.value : value) })} />
                                  <Button variant="ghost" size="icon" disabled={item.options!.length <= 2} aria-label={t('redesign.surveys.removeAnswer', { n: j + 1 })} onClick={() => patchItem(item.id, { options: item.options!.filter((_, index) => index !== j) })}><X className="h-4 w-4" /></Button>
                                </div>
                              ))}
                              {item.options.length < 12 && <Button variant="outline" onClick={() => patchItem(item.id, { options: [...item.options!, ''] })}><Plus className="mr-2 h-4 w-4" />{t('surveys.create.addOption')}</Button>}
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  </fieldset>
                  <details className="rounded-lg border bg-muted/30 p-4 text-sm">
                    <summary className="cursor-pointer font-medium">{t('redesign.surveys.fixedTitle')}</summary>
                    <div className="mt-3 space-y-3 text-muted-foreground">
                      <p>{t('redesign.surveys.fixedHint')}</p>
                      {fixedItems.map((item) => <p key={item.id}>{item.text}</p>)}
                      <p>{t('surveys.create.moduleNote')}</p>
                    </div>
                  </details>
                  {error && <p role="alert" className="flex items-start gap-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
                  {saved && <p role="status" className="text-sm text-primary">{t('redesign.surveys.saved')}</p>}
                  {!editedValid && <p className="text-sm text-muted-foreground">{t('redesign.surveys.validation')}</p>}
                  <div className="border-t pt-5 space-y-4">
                    <p className="text-sm text-muted-foreground">{t('redesign.surveys.publishHint')}</p>
                    <div className="flex flex-wrap gap-3">
                      <Button variant="outline" onClick={() => save(false)} disabled={busy || !editedValid} size="lg"><Save className="mr-2 h-4 w-4" />{t(busy ? 'redesign.surveys.saving' : 'redesign.surveys.saveDraft')}</Button>
                      <Button onClick={() => save(true)} disabled={busy || !editedValid} size="lg"><Send className="mr-2 h-4 w-4" />{t('surveys.create.publish')}</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
