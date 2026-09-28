/**
 * The co-drafting phase of an election or a poll, as members see it.
 *
 * An election gathers candidacies — a member stands, or puts someone
 * forward — and a poll gathers answers the author did not think of. The list
 * is live while the phase runs; when it closes the list locks and becomes
 * the ballot, and the vote opens by itself.
 *
 * Who put a name forward is not shown (see server/routers/proposal-options):
 * each viewer only sees which entries are theirs to withdraw.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { refusalOptionLabel, type ProposalKind } from '@shared/proposal-kinds';

interface OptionsPayload {
  open: boolean;
  closesAt: string | null;
  iAmStanding: boolean;
  items: Array<{ id: number; label: string; standing: boolean; mine: boolean; canRemove: boolean }>;
}

export function OptionCollectionPanel({ proposalId, kind }: { proposalId: number; kind: Extract<ProposalKind, 'election' | 'poll'> }) {
  const { t, locale } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<OptionsPayload | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const k = kind === 'election' ? 'nominations' : 'suggestions';

  const load = useCallback(async () => {
    try {
      const resp = await api.get<OptionsPayload>(`/api/proposals/${proposalId}/options`);
      setData(resp.data);
    } catch {
      /* keep what we have */
    }
  }, [proposalId]);

  // Other members add while you read: refresh now and then.
  useEffect(() => {
    load();
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, [load]);

  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await run();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('options.error'));
    } finally {
      setBusy(false);
    }
  }

  const add = () => act(async () => {
    await api.post(`/api/proposals/${proposalId}/options`, { label: draft.trim() });
    setDraft('');
  });
  const stand = () => act(() => api.post(`/api/proposals/${proposalId}/options`, { self: true }));
  const remove = (id: number) => act(() => api.delete(`/api/proposals/${proposalId}/options/${id}`));

  const closes = data?.closesAt
    ? new Date(data.closesAt).toLocaleString(locale === 'el' ? 'el-GR' : 'en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      })
    : null;

  return (
    <section className="mb-8 rounded-lg border bg-background p-5 space-y-4" data-testid="option-collection">
      <div>
        <h2 className="text-lg font-semibold">{t(`options.${k}_title`)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {closes ? t(`options.${k}_help`, { date: closes }) : t(`options.${k}_help_nodate`)}
        </p>
      </div>

      {data === null ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <ul className="space-y-2" data-testid="option-collection-list">
          {data.items.length === 0 && (
            <li className="text-sm text-muted-foreground">{t(`options.${k}_empty`)}</li>
          )}
          {data.items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="flex-1 min-w-0 truncate">{item.label}</span>
              {item.standing && kind === 'election' && (
                <span className="shrink-0 text-xs text-muted-foreground">{t('options.self_nominated')}</span>
              )}
              {item.mine && <span className="shrink-0 text-xs text-kyanos">{t('options.yours')}</span>}
              {data.open && item.canRemove && (
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  disabled={busy}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={t('options.remove')}
                  data-testid={`option-remove-${item.id}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
          <li className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            <span>{refusalOptionLabel(kind)}</span>
            <span className="text-xs">{t('proposal.form_auto_option')}</span>
          </li>
        </ul>
      )}

      {data?.open && user && (
        <div className="space-y-3 border-t pt-4">
          {kind === 'election' && !data.iAmStanding && (
            <Button type="button" onClick={stand} disabled={busy} data-testid="option-stand">
              <UserCheck className="mr-2 h-4 w-4" />
              {t('options.stand')}
            </Button>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); if (draft.trim()) add(); }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={200}
              placeholder={t(`options.${k}_placeholder`)}
              data-testid="option-input"
            />
            <Button type="submit" variant="outline" disabled={busy || !draft.trim()} data-testid="option-add">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-1">{t(`options.${k}_add`)}</span>
            </Button>
          </form>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </section>
  );
}
