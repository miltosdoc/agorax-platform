/**
 * Connect a community to a Discord channel (server/utils/discord.ts).
 *
 * Renders nothing for people who may not manage it (the API answers 403):
 * admins in a managed community, the founder in an autonomous one.
 */

import { useCallback, useEffect, useState } from 'react';
import { SiDiscord } from 'react-icons/si';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';

interface DiscordState {
  connected: boolean;
  webhookName: string | null;
  allowPrivate: boolean;
  contentPublic: boolean;
  posting: boolean;
  lastError: string | null;
}

const errorText = (e: any) => e?.response?.data?.message || e?.message || String(e);

export function DiscordSettingsCard({ communityId }: { communityId: string | number }) {
  const { t } = useTranslation();
  const [state, setState] = useState<DiscordState | null>(null);
  const [url, setUrl] = useState('');
  const [allowPrivate, setAllowPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  const load = useCallback(() => {
    api.get<DiscordState>(`/api/communities/${communityId}/discord`)
      .then((r) => { setState(r.data); setAllowPrivate(r.data.allowPrivate); })
      .catch(() => setState(null));
  }, [communityId]);
  useEffect(load, [load]);

  if (!state) return null;

  const run = async (fn: () => Promise<string | null | void>) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const connect = () => run(async () => {
    const r = await api.put<{ testError: string | null }>(`/api/communities/${communityId}/discord`, { webhookUrl: url, allowPrivate });
    setUrl(''); setReplacing(false);
    return r.data.testError ? r.data.testError : t('discord.connected_notice');
  });

  const privacyBox = !state.contentPublic && (
    <label className="flex items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/5">
      <Checkbox
        checked={allowPrivate}
        onCheckedChange={(v) => {
          const next = v === true;
          setAllowPrivate(next);
          if (state.connected) run(() => api.put(`/api/communities/${communityId}/discord`, { allowPrivate: next }).then(() => null));
        }}
        className="mt-0.5"
      />
      <span>{t('discord.private_confirm')}</span>
    </label>
  );

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><SiDiscord className="h-5 w-5 text-[#5865F2]" />Discord</CardTitle>
        <CardDescription>{t('discord.card_help')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.connected && !replacing ? (
          <>
            <div className="text-sm">
              <p className="font-medium">
                {state.posting ? `✓ ${t('discord.status_on')}` : t('discord.status_paused')}
              </p>
              {state.webhookName && <p className="text-muted-foreground">{t('discord.webhook_name', { name: state.webhookName })}</p>}
              {state.lastError && <p className="mt-1 text-destructive">{t('discord.last_error')}: {state.lastError}</p>}
            </div>
            {privacyBox}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy}
                onClick={() => run(() => api.post(`/api/communities/${communityId}/discord/test`).then(() => t('discord.test_sent')))}>
                {t('discord.send_test')}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setReplacing(true)}>{t('discord.change_channel')}</Button>
              <Button variant="ghost" className="text-destructive" disabled={busy}
                onClick={() => { if (window.confirm(t('discord.disconnect_confirm'))) run(() => api.delete(`/api/communities/${communityId}/discord`).then(() => null)); }}>
                {t('discord.disconnect')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>{t('discord.step1')}</li>
              <li>{t('discord.step2')}</li>
              <li>{t('discord.step3')}</li>
            </ol>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/…"
              aria-label={t('discord.url_label')}
              autoComplete="off"
              spellCheck={false}
            />
            {privacyBox}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !url.trim() || (!state.contentPublic && !allowPrivate)} onClick={connect}>
                {busy ? t('common.loading') : t('discord.connect')}
              </Button>
              {replacing && <Button variant="ghost" onClick={() => setReplacing(false)}>{t('common.cancel')}</Button>}
            </div>
          </>
        )}
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">{t('discord.posted_title')}</summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>📝 {t('discord.posted_new')}</li>
            <li>🗳️ {t('discord.posted_vote')}</li>
            <li>⏰ {t('discord.posted_closing')}</li>
            <li>✅ {t('discord.posted_decided')}</li>
            <li>🎙️ {t('discord.posted_meeting')}</li>
          </ul>
          <p className="mt-2 text-muted-foreground">{t('discord.posted_once')}</p>
        </details>
        <p className="text-xs text-muted-foreground">{t('discord.what_is_posted')}</p>
        {notice && <p className="text-sm">{notice}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
