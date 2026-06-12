/**
 * Survey creation — natural-language intent → LLM Poll Compiler → EDITABLE
 * preview → field. The compiler produces a starting point; every text field
 * (title, question wording, options) belongs to the creator before
 * publication. The attention check keeps its canonical machine-checkable
 * wording; the piggyback module is added at fielding and is not editable.
 * Creator edits are recorded in the methodology (compilerMeta.creatorEdited).
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Plus, Sparkles, Send, Trash2, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { TierBadge } from './surveys-page';

interface CompiledItem {
  id: number;
  text: string;
  itemType: string;
  options: string[] | null;
  randomizeOptions: boolean;
  isAttentionCheck: boolean;
}

interface CompiledPollResponse {
  poll: { id: number; title: string; topicTag: string; tier: string };
  items: CompiledItem[];
  verdict: { approved: boolean; flags: Array<{ issue: string; explanation: string; severity: string }>; reasoning: string };
}

interface EditableItem extends CompiledItem {
  deleted: boolean;
}

export default function SurveyCreatePage() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const [intent, setIntent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compiled, setCompiled] = useState<CompiledPollResponse | null>(null);
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<EditableItem[]>([]);

  async function compile() {
    setBusy(true);
    setError(null);
    try {
      const resp = await api.post<CompiledPollResponse>('/api/surveys', { intent });
      setCompiled(resp.data);
      setTitle(resp.data.poll.title);
      setItems(resp.data.items.map((i) => ({ ...i, deleted: false })));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('surveys.create.compileFailed'));
    } finally {
      setBusy(false);
    }
  }

  function patchItem(id: number, patch: Partial<EditableItem>) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function patchOption(id: number, idx: number, value: string) {
    setItems((list) => list.map((i) =>
      i.id === id && i.options ? { ...i, options: i.options.map((o, j) => (j === idx ? value : o)) } : i,
    ));
  }

  const editedValid = title.trim().length >= 5 && items.some((i) => !i.deleted && !i.isAttentionCheck) &&
    items.every((i) => i.deleted || i.isAttentionCheck || (
      i.text.trim().length >= 5 &&
      (i.itemType === 'open_text' || ((i.options?.filter((o) => o.trim()).length ?? 0) >= 2))
    ));

  async function publish() {
    if (!compiled || !editedValid) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/surveys/${compiled.poll.id}`, {
        title: title.trim(),
        items: items
          .filter((i) => !i.deleted && !i.isAttentionCheck)
          .map((i) => ({
            id: i.id,
            text: i.text.trim(),
            options: i.itemType === 'open_text' ? undefined : i.options?.map((o) => o.trim()).filter(Boolean),
          })),
        deleteItemIds: items.filter((i) => i.deleted).map((i) => i.id),
      });
      await api.post(`/api/surveys/${compiled.poll.id}/field`, {});
      navigate(`/surveys/${compiled.poll.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('surveys.create.publishFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={t('surveys.create.title')}>
      <p className="text-sm text-muted-foreground -mt-4 mb-6">{t('surveys.create.intro')}</p>

      {!compiled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> {t('surveys.create.promptTitle')}
            </CardTitle>
            <CardDescription>{t('surveys.create.promptHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={t('surveys.create.placeholder')}
            />
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
              </div>
            )}
            <Button onClick={compile} disabled={intent.trim().length < 10 || busy}>
              {busy ? t('surveys.create.compiling') : t('surveys.create.compile')}
            </Button>
          </CardContent>
        </Card>
      )}

      {compiled && (
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    className="text-base font-semibold"
                  />
                  <CardDescription>{t('surveys.create.topic', { topic: compiled.poll.topicTag })}</CardDescription>
                </div>
                <TierBadge tier={compiled.poll.tier} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {compiled.verdict.flags.length > 0 && (
                <div className={`p-3 rounded text-xs space-y-1 border ${
                  compiled.verdict.approved
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {!compiled.verdict.approved && (
                    <p className="font-medium">{t('surveys.create.flagsBlocked')}</p>
                  )}
                  {compiled.verdict.flags.map((f, i) => (
                    <p key={i}><strong>{f.issue}</strong>: {f.explanation}</p>
                  ))}
                </div>
              )}

              <ol className="space-y-3">
                {items.filter((i) => !i.deleted).map((item, i) => (
                  <li key={item.id} className="border rounded p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-muted-foreground shrink-0 pt-2">{i + 1}.</span>
                      {item.isAttentionCheck ? (
                        <p className="text-sm flex-1 pt-2">{item.text}</p>
                      ) : (
                        <Textarea
                          value={item.text}
                          onChange={(e) => patchItem(item.id, { text: e.target.value })}
                          rows={2}
                          maxLength={500}
                          className="text-sm flex-1"
                        />
                      )}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className="text-xs">{t(`surveys.itemType.${item.itemType}`)}</Badge>
                        {item.isAttentionCheck && <Badge variant="secondary" className="text-xs">{t('surveys.create.attention')}</Badge>}
                        {item.randomizeOptions && <Badge variant="secondary" className="text-xs">{t('surveys.create.randomized')}</Badge>}
                        {!item.isAttentionCheck && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 h-7 px-2"
                            onClick={() => patchItem(item.id, { deleted: true })}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {item.options && (
                      <div className="space-y-1.5 pl-6">
                        {item.options.map((opt, j) => (
                          item.isAttentionCheck ? (
                            <p key={j} className="text-xs text-muted-foreground">• {opt}</p>
                          ) : (
                            <div key={j} className="flex items-center gap-1.5">
                              <Input
                                value={opt}
                                onChange={(e) => patchOption(item.id, j, e.target.value)}
                                maxLength={200}
                                className="text-xs h-8"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 shrink-0"
                                disabled={(item.options?.length ?? 0) <= 2}
                                onClick={() => patchItem(item.id, { options: item.options!.filter((_, k) => k !== j) })}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )
                        ))}
                        {!item.isAttentionCheck && (item.options.length < 12) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => patchItem(item.id, { options: [...item.options!, ''] })}
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" /> {t('surveys.create.addOption')}
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>

              <p className="text-xs text-muted-foreground">{t('surveys.create.moduleNote')}</p>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
              )}
              <div className="flex gap-2">
                <Button onClick={publish} disabled={busy || !editedValid}>
                  <Send className="w-4 h-4 mr-1" /> {busy ? t('surveys.create.publishing') : t('surveys.create.publish')}
                </Button>
                <Button variant="outline" onClick={() => { setCompiled(null); setError(null); }}>
                  {t('surveys.create.retry')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
