/**
 * "I forgot my password" — the request half of the reset flow.
 *
 * The confirmation is deliberately the same whatever happened on the server:
 * account or no account, rate-limited or not, mail accepted or refused. This
 * page must never become a way to find out whether an address has an AgoraX
 * account — on a political platform that is worth more than the password it
 * would unlock.
 *
 * The link itself lands on /reset-password, which is shared with the
 * admin-issued route.
 */
import { useState } from 'react';
import { Link } from 'wouter';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MailCheck } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { BUTTON_PRIMARY, INPUT_CLASS, LINK_CLASS } from '@/components/auth/auth-styles';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    try {
      await api.post('/api/password-reset/request', { email: email.trim() });
    } catch {
      // Even a failure shows the same acknowledgement. A visible error here
      // would leak the very thing the uniform response protects — and the
      // member's next move is the same either way: check the inbox.
    } finally {
      setSending(false);
      setSent(true);
    }
  };

  return (
    <AuthShell title={t('forgot.title')} subtitle={sent ? undefined : t('forgot.intro')}>
      {sent ? (
        <>
          <div className="flex items-start gap-3 rounded-sm border border-line bg-sunken p-4">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-kyanos" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-ink" data-testid="forgot-ack">
              {t('forgot.ack')}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-ink-faint">{t('forgot.ackHint')}</p>
          <Link href="/auth" className={LINK_CLASS}>
            {t('reset.backToLogin')}
          </Link>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email" className="text-sm font-medium text-ink">
              {t('auth.email')}
            </Label>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              className={INPUT_CLASS}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder') as string}
              data-testid="forgot-email"
            />
          </div>

          <button
            type="submit"
            className={BUTTON_PRIMARY}
            disabled={sending || !email.trim()}
            data-testid="forgot-submit"
          >
            {sending ? t('general.loading') + '…' : t('forgot.submit')}
          </button>

          <div className="pt-1">
            <Link href="/auth" className={LINK_CLASS}>
              {t('reset.backToLogin')}
            </Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
