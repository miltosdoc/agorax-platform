/**
 * Landing page for the "stop all optional email" link in every optional email.
 *
 * No session required and none created: the signed token in the URL is the
 * whole authorisation, and it authorises exactly one thing. This page cannot
 * show whose account it belongs to, and confirming does not sign anyone in.
 *
 * There is a confirm button rather than an unsubscribe-on-load, because mail
 * clients and corporate scanners prefetch links, and a GET that changed
 * settings would silently switch people's email off for them. The RFC 8058
 * one-click header path is separate: that is a POST straight to the API,
 * which is what a mail client's own "unsubscribe" button uses.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AuthShell } from '@/components/auth/AuthShell';
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/auth/auth-styles';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';

type State = 'checking' | 'ready' | 'invalid' | 'done';

export default function UnsubscribePage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get('t') ?? '';
  const [state, setState] = useState<State>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    api.get<{ valid: boolean }>(`/api/unsubscribe?t=${encodeURIComponent(token)}`)
      .then((r) => setState(r.data.valid ? 'ready' : 'invalid'))
      .catch(() => setState('invalid'));
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    try {
      await api.post('/api/unsubscribe', { token });
      setState('done');
    } catch {
      setState('invalid');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('unsubscribe.title')}>
      {state === 'checking' && (
        <p className="text-sm text-ink-soft">{t('unsubscribe.checking')}</p>
      )}

      {state === 'invalid' && (
        <>
          <p className="text-sm leading-relaxed text-ink-soft">{t('unsubscribe.invalid')}</p>
          <button
            type="button"
            className={BUTTON_SECONDARY}
            onClick={() => navigate('/notifications/settings')}
          >
            {t('emailPrefs.title')}
          </button>
        </>
      )}

      {state === 'ready' && (
        <>
          <p className="text-sm leading-relaxed text-ink-soft">{t('unsubscribe.confirmBody')}</p>
          <p className="text-xs leading-relaxed text-ink-faint">{t('unsubscribe.securityNote')}</p>
          <button
            type="button"
            className={BUTTON_PRIMARY}
            onClick={confirm}
            disabled={busy}
            data-testid="unsubscribe-confirm"
          >
            {busy ? t('general.loading') + '…' : t('unsubscribe.confirm')}
          </button>
        </>
      )}

      {state === 'done' && (
        <>
          <p className="text-sm leading-relaxed text-ink" data-testid="unsubscribe-done">
            {t('unsubscribe.done')}
          </p>
          <p className="text-xs leading-relaxed text-ink-faint">{t('unsubscribe.doneHint')}</p>
          <button
            type="button"
            className={BUTTON_SECONDARY}
            onClick={() => navigate('/notifications/settings')}
          >
            {t('emailPrefs.title')}
          </button>
        </>
      )}
    </AuthShell>
  );
}
