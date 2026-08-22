/**
 * Landing page for a reset link (/reset-password?token=…).
 *
 * Serves both routes to a new password: the self-service link a member asks
 * for at /forgot-password and receives by email (30 minutes), and the one an
 * admin mints and delivers out of band (24 hours). The page cannot tell them
 * apart and does not need to.
 *
 * The token is checked before the form is shown, so an expired or already-used
 * link says so immediately instead of after someone types a password twice —
 * and checked again on submit, because the link can expire while the form is
 * open. Completing a reset drops every existing session for that account
 * server-side and does not sign anyone in.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { AuthShell } from '@/components/auth/AuthShell';
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  INPUT_CLASS,
} from '@/components/auth/auth-styles';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useErrorToast } from '@/hooks/use-error-toast';

const MIN_PASSWORD = 8;

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const errorToast = useErrorToast();
  const [, navigate] = useLocation();

  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [state, setState] = useState<'checking' | 'valid' | 'invalid' | 'done'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    api.post<{ valid: boolean }>('/api/password-reset/check', { token })
      .then((r) => setState(r.data.valid ? 'valid' : 'invalid'))
      .catch(() => setState('invalid'));
  }, [token]);

  const tooShort = password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && password !== confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tooShort || password !== confirm) return;
    setSaving(true);
    try {
      await api.post('/api/password-reset', { token, password });
      setState('done');
      toast({ title: t('reset.doneTitle'), description: t('reset.doneBody') });
    } catch (err: any) {
      errorToast(t('reset.failed'), err?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell title={t('reset.title')}>
      {state === 'checking' && (
        <p className="text-sm text-ink-soft">{t('reset.checking')}</p>
      )}

      {state === 'invalid' && (
        <>
          <p className="text-sm leading-relaxed text-ink-soft">{t('reset.invalid')}</p>
          {/* A dead link is the most common way to arrive here — an hour late,
              or after clicking the same message twice. Offer the way forward,
              not just the way back. */}
          <button
            type="button"
            className={BUTTON_PRIMARY}
            onClick={() => navigate('/forgot-password')}
            data-testid="reset-request-new"
          >
            {t('reset.requestNew')}
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

      {state === 'done' && (
        <>
          <p className="text-sm leading-relaxed text-ink-soft">{t('reset.doneBody')}</p>
          <button
            type="button"
            className={BUTTON_PRIMARY}
            onClick={() => navigate('/auth')}
            data-testid="reset-to-login"
          >
            {t('reset.backToLogin')}
          </button>
        </>
      )}

      {state === 'valid' && (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-password" className="text-sm font-medium text-ink">
              {t('reset.newPassword')}
            </Label>
            <PasswordInput
              id="reset-password"
              className={INPUT_CLASS}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              data-testid="reset-password"
            />
            <p className="text-xs text-ink-faint">{t('auth.passwordMinLength')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reset-confirm" className="text-sm font-medium text-ink">
              {t('auth.confirmPassword')}
            </Label>
            <PasswordInput
              id="reset-confirm"
              className={INPUT_CLASS}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              data-testid="reset-confirm"
            />
            {mismatch && (
              <p className="text-xs text-destructive">{t('auth.passwordsDoNotMatch')}</p>
            )}
          </div>

          <button
            type="submit"
            className={BUTTON_PRIMARY}
            disabled={saving || tooShort || password !== confirm}
            data-testid="reset-submit"
          >
            {saving ? t('general.loading') + '…' : t('reset.submit')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
