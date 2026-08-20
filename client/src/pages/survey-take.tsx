/**
 * Survey runner — one item per screen, mobile-first. Module items render
 * first with a disclosure banner; option order arrives pre-randomized from
 * the server (canonical indexes travel with each option, so answers are
 * shuffle-proof). Per-item dwell time is captured for the quality gate.
 * On completion, a quality-passed response yields a one-time claim code
 * exchanged for Democracy Points on the authenticated path.
 */
import { useEffect, useRef, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { panelFetch, getPanelToken } from '@/lib/panel-client';

interface InstrumentItem {
  id: number;
  text: string;
  itemType: string;
  options: Array<{ index: number; text: string }> | null;
  required: boolean;
  isModuleItem: boolean;
}

interface Instrument {
  pollId: number;
  title: string;
  tier: string;
  responseId: number;
  status: string;
  items: InstrumentItem[];
  moduleDisclosure: boolean;
}

type AnswerValue = number | number[] | string;

export default function SurveyTakePage() {
  const [, params] = useRoute('/surveys/:id/take');
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const id = params?.id ? parseInt(params.id, 10) : NaN;

  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Map<number, AnswerValue>>(new Map());
  const [times, setTimes] = useState<Map<number, number>>(new Map());
  const [done, setDone] = useState<{ qualityPassed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const itemShownAt = useRef<number>(Date.now());

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    if (!getPanelToken()) {
      navigate('/panel');
      return;
    }
    panelFetch<Instrument>(`/api/surveys/${id}/instrument`)
      .then((inst) => {
        if (inst.status === 'completed') setError(t('surveys.take.alreadyDone'));
        else setInstrument(inst);
      })
      .catch((e) => {
        if (e instanceof Error && e.message === 'not_panelist') navigate('/panel');
        else setError(e?.message ?? t('surveys.detail.loadError'));
      });
  }, [id, navigate]);

  useEffect(() => { itemShownAt.current = Date.now(); }, [step]);

  if (error) {
    return (
      <AppShell title={t('surveys.detail.title')}>
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      </AppShell>
    );
  }
  if (!instrument) {
    return <AppShell title={t('surveys.detail.title')}><div className="py-12 text-center text-sm text-muted-foreground">{t('surveys.loading')}</div></AppShell>;
  }

  if (done) {
    return (
      <AppShell title={instrument.title}>
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-600" />
            <p className="font-medium">{t('surveys.take.thanks')}</p>
            {!done.qualityPassed && (
              <p className="text-xs text-muted-foreground">{t('surveys.take.qualityFailNote')}</p>
            )}
            <Button onClick={() => navigate('/surveys')}>{t('surveys.take.backToList')}</Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const item = instrument.items[step];
  const total = instrument.items.length;
  const current = answers.get(item.id);
  const answered = current !== undefined && (typeof current !== 'string' || current.trim().length > 0 || !item.required) &&
    (!Array.isArray(current) || current.length > 0);
  const canSkip = !item.required;

  function record(value: AnswerValue) {
    setAnswers((m) => new Map(m).set(item.id, value));
  }

  function stampTime() {
    setTimes((m) => new Map(m).set(item.id, (m.get(item.id) ?? 0) + (Date.now() - itemShownAt.current)));
  }

  async function next() {
    stampTime();
    if (step < total - 1) {
      setStep(step + 1);
      return;
    }
    // Submit
    setBusy(true);
    try {
      const payload = instrument!.items
        .filter((it) => answers.has(it.id))
        .map((it) => ({ itemId: it.id, value: answers.get(it.id), timeMs: times.get(it.id) ?? 0 }));
      const result = await panelFetch<{ qualityPassed: boolean; claimCode: string | null }>(
        `/api/surveys/${id}/respond`,
        { method: 'POST', body: { answers: payload } },
      );
      if (result.claimCode && user) {
        try {
          const claim = await api.post<{ award: { awarded: boolean; points: number } }>(
            `/api/surveys/${id}/claim`,
            { claimCode: result.claimCode },
          );
          if (claim.data.award.awarded) {
            toast({ title: t('surveys.take.pointsToast', { points: claim.data.award.points }), description: t('surveys.take.pointsToastSub') });
          }
        } catch { /* points are best-effort; the response itself is in */ }
      }
      setDone({ qualityPassed: result.qualityPassed });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : t('surveys.take.submitFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={instrument.title}>
      <div className="max-w-xl mx-auto">
        <Progress value={((step + 1) / total) * 100} className="h-1.5 mb-3" />
        <p className="text-xs text-muted-foreground mb-4">{t('surveys.take.progress', { current: step + 1, total })}</p>

        {item.isModuleItem && step === 0 && instrument.moduleDisclosure && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800 mb-4">
            {t('surveys.take.moduleBanner')}
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base leading-relaxed">
              {item.isModuleItem && <Badge variant="outline" className="mr-2 text-xs align-middle">{t('surveys.detail.module')}</Badge>}
              {item.text}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {item.itemType === 'open_text' && (
              <Textarea
                rows={4}
                value={typeof current === 'string' ? current : ''}
                onChange={(e) => record(e.target.value)}
                placeholder={t('surveys.take.openPlaceholder')}
              />
            )}

            {item.options && (item.itemType === 'single_choice' || item.itemType === 'likert') && (
              <div className="grid gap-2">
                {item.options.map((opt) => (
                  <button
                    key={opt.index}
                    type="button"
                    onClick={() => record(opt.index)}
                    className={`text-left text-sm border rounded-lg px-4 py-3 transition-colors ${
                      current === opt.index ? 'border-primary bg-primary/10 font-medium' : 'hover:border-primary/40'
                    }`}
                  >
                    {opt.text}
                  </button>
                ))}
              </div>
            )}

            {item.options && item.itemType === 'multi_choice' && (
              <div className="grid gap-2">
                {item.options.map((opt) => {
                  const selected = Array.isArray(current) && current.includes(opt.index);
                  return (
                    <label
                      key={opt.index}
                      className={`flex items-center gap-3 text-sm border rounded-lg px-4 py-3 cursor-pointer transition-colors ${
                        selected ? 'border-primary bg-primary/10 font-medium' : 'hover:border-primary/40'
                      }`}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(v) => {
                          const prev = Array.isArray(current) ? current : [];
                          record(v === true ? [...prev, opt.index] : prev.filter((x) => x !== opt.index));
                        }}
                      />
                      {opt.text}
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between mt-4">
          <Button variant="ghost" size="sm" disabled={step === 0 || busy} onClick={() => { stampTime(); setStep(step - 1); }}>
            <ChevronLeft className="w-4 h-4 mr-1" /> {t('surveys.take.back')}
          </Button>
          <Button size="sm" disabled={(!answered && !canSkip) || busy} onClick={next}>
            {busy ? t('surveys.take.submitting') : step === total - 1 ? t('surveys.take.finish') : t('surveys.take.next')}
            {step < total - 1 && <ChevronRight className="w-4 h-4 ml-1" />}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
