/**
 * Landing page for an admin-issued reset link (/reset-password?token=…).
 *
 * The token is checked before the form is shown, so an expired or already-used
 * link says so immediately instead of after someone types a password twice.
 * Completing a reset drops every existing session for that account server-side.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
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

  const submit = async () => {
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('reset.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'checking' && (
            <p className="text-sm text-muted-foreground">{t('reset.checking')}</p>
          )}

          {state === 'invalid' && (
            <>
              <p className="text-sm text-muted-foreground">{t('reset.invalid')}</p>
              <Button type="button" variant="outline" onClick={() => navigate('/auth')}>
                {t('reset.backToLogin')}
              </Button>
            </>
          )}

          {state === 'done' && (
            <>
              <p className="text-sm text-muted-foreground">{t('reset.doneBody')}</p>
              <Button type="button" onClick={() => navigate('/auth')} data-testid="reset-to-login">
                {t('reset.backToLogin')}
              </Button>
            </>
          )}

          {state === 'valid' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="reset-password">{t('reset.newPassword')}</Label>
                <PasswordInput
                  id="reset-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  data-testid="reset-password"
                />
                <p className="text-xs text-muted-foreground">{t('auth.passwordMinLength')}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reset-confirm">{t('auth.confirmPassword')}</Label>
                <PasswordInput
                  id="reset-confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  data-testid="reset-confirm"
                />
                {mismatch && (
                  <p className="text-xs text-destructive">{t('auth.passwordsDoNotMatch')}</p>
                )}
              </div>

              <Button
                type="button"
                onClick={submit}
                disabled={saving || tooShort || password !== confirm}
                data-testid="reset-submit"
              >
                {t('reset.submit')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
