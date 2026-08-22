/**
 * Landing page for the address-confirmation link (/verify-email?token=…).
 *
 * Signed out on purpose. The link is opened from an inbox, which is very
 * often a different browser or a different device from the one that
 * registered — a page that demanded a session first would strand exactly the
 * people whose address most needs confirming.
 *
 * Confirming is a POST, not a side effect of loading: mail clients and
 * corporate link scanners fetch every URL in a message, and a GET that
 * changed account state would let a scanner "confirm" an address nobody read.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle2 } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/auth/auth-styles';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';

type State = 'confirming' | 'done' | 'invalid';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [state, setState] = useState<State>('confirming');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    api.post<{ ok: boolean }>('/api/email-verification/verify', { token })
      .then((r) => setState(r.data.ok ? 'done' : 'invalid'))
      .catch(() => setState('invalid'));
  }, [token]);

  return (
    <AuthShell title={t('verifyEmail.title')}>
      {state === 'confirming' && (
        <p className="text-sm text-ink-soft">{t('verifyEmail.checking')}</p>
      )}

      {state === 'done' && (
        <>
          <div className="flex items-start gap-3 rounded-sm border border-line bg-sunken p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-kyanos" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-ink" data-testid="verify-email-done">
              {t('verifyEmail.done')}
            </p>
          </div>
          <button
            type="button"
            className={BUTTON_PRIMARY}
            onClick={() => navigate('/feed')}
          >
            {t('verifyEmail.continue')}
          </button>
        </>
      )}

      {state === 'invalid' && (
        <>
          <p className="text-sm leading-relaxed text-ink-soft">{t('verifyEmail.invalid')}</p>
          {/* Asking for a new link needs a session — that endpoint mails the
              address on the account rather than one typed into a form, so
              there is nothing to disclose and nothing to abuse. */}
          <button
            type="button"
            className={BUTTON_PRIMARY}
            onClick={() => navigate('/notifications/settings')}
            data-testid="verify-email-resend"
          >
            {t('verifyEmail.requestNew')}
          </button>
          <button
            type="button"
            className={BUTTON_SECONDARY}
            onClick={() => navigate('/auth')}
          >
            {t('reset.backToLogin')}
          </button>
        </>
      )}
    </AuthShell>
  );
}
