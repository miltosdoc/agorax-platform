/**
 * Email notification settings.
 *
 * Master switch plus one switch per category. The categories come from the
 * server, not from a list hard-coded here — shared/email-categories.ts is the
 * single catalogue, so adding a category never means editing this page.
 *
 * The per-category switches stay visible but disabled while the master switch
 * is off. Hiding them would lose the member's answers from view and make
 * turning email back on feel like starting over; greying them out says
 * "these are still your choices, they just don't apply right now".
 *
 * This is also where every optional email's "Notification settings" link
 * lands, so it has to make sense to someone arriving cold from an inbox.
 */
import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Loader2, MailWarning, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useErrorToast } from '@/hooks/use-error-toast';
import { useAuth } from '@/hooks/use-auth';

interface CategoryRow {
  key: string;
  labelKey: string;
  descriptionKey: string;
  enabled: boolean;
}

interface PrefsResponse {
  masterEnabled: boolean;
  mailConfigured: boolean;
  categories: CategoryRow[];
}

export default function NotificationSettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const errorToast = useErrorToast();
  const { user } = useAuth();
  const [resending, setResending] = useState(false);

  const emailVerified = !!(user as { emailVerifiedAt?: string | null } | null)?.emailVerifiedAt;

  const resendVerification = async () => {
    setResending(true);
    try {
      await api.post('/api/email-verification/resend');
      toast({ title: t('verifyEmail.resentTitle'), description: t('verifyEmail.resentBody') });
    } catch (err: any) {
      errorToast(t('verifyEmail.resendFailed'), err?.message);
    } finally {
      setResending(false);
    }
  };

  const [prefs, setPrefs] = useState<PrefsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.get<PrefsResponse>('/api/email-preferences')
      .then((r) => setPrefs(r.data))
      .catch((err: any) => errorToast(t('emailPrefs.loadFailed'), err?.message))
      .finally(() => setLoading(false));
    // errorToast/t are stable for the lifetime of the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMaster = (value: boolean) => {
    setPrefs((p) => (p ? { ...p, masterEnabled: value } : p));
    setDirty(true);
  };

  const setCategory = (key: string, value: boolean) => {
    setPrefs((p) => p && ({
      ...p,
      categories: p.categories.map((c) => (c.key === key ? { ...c, enabled: value } : c)),
    }));
    setDirty(true);
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      const categories = Object.fromEntries(prefs.categories.map((c) => [c.key, c.enabled]));
      const res = await api.put<PrefsResponse>('/api/email-preferences', {
        masterEnabled: prefs.masterEnabled,
        categories,
      });
      setPrefs(res.data);
      setDirty(false);
      toast({ title: t('emailPrefs.savedTitle'), description: t('emailPrefs.savedBody') });
    } catch (err: any) {
      errorToast(t('emailPrefs.saveFailed'), err?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title={t('emailPrefs.title')}>
      <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
        <p className="text-sm text-muted-foreground">{t('emailPrefs.intro')}</p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('general.loading')}…
          </div>
        )}

        {prefs && !prefs.mailConfigured && (
          <div
            className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900"
            data-testid="email-prefs-unconfigured"
          >
            <MailWarning className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">{t('emailPrefs.notConfigured')}</p>
          </div>
        )}

        {prefs && (
          <>
            {/* Address confirmation sits above the preferences on purpose:
                choosing which emails to receive is beside the point if the
                address they would go to was never proved. */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {emailVerified
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : <ShieldAlert className="h-4 w-4 text-amber-600" />}
                  {t('verifyEmail.statusTitle')}
                </CardTitle>
                <CardDescription>
                  {emailVerified ? t('verifyEmail.statusVerified') : t('verifyEmail.statusUnverified')}
                </CardDescription>
              </CardHeader>
              {!emailVerified && (
                <CardContent>
                  <Button
                    variant="outline"
                    onClick={resendVerification}
                    disabled={resending}
                    data-testid="resend-verification"
                  >
                    {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('verifyEmail.resend')}
                  </Button>
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('emailPrefs.masterTitle')}</CardTitle>
                <CardDescription>{t('emailPrefs.masterHint')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="email-master" className="text-sm font-medium">
                    {t('emailPrefs.masterLabel')}
                  </Label>
                  <Switch
                    id="email-master"
                    checked={prefs.masterEnabled}
                    onCheckedChange={setMaster}
                    data-testid="email-master-switch"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('emailPrefs.categoriesTitle')}</CardTitle>
                <CardDescription>{t('emailPrefs.categoriesHint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {prefs.categories.map((c, i) => (
                  <div key={c.key}>
                    {i > 0 && <Separator className="my-3" />}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label htmlFor={`cat-${c.key}`} className="text-sm font-medium">
                          {t(c.labelKey as any)}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {t(c.descriptionKey as any)}
                        </p>
                      </div>
                      <Switch
                        id={`cat-${c.key}`}
                        checked={c.enabled}
                        disabled={!prefs.masterEnabled}
                        onCheckedChange={(v) => setCategory(c.key, v)}
                        data-testid={`email-category-${c.key}`}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('emailPrefs.languageTitle')}</CardTitle>
                <CardDescription>{t('emailPrefs.languageHint')}</CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('emailPrefs.alwaysTitle')}</CardTitle>
                <CardDescription>{t('emailPrefs.alwaysHint')}</CardDescription>
              </CardHeader>
            </Card>

            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving || !dirty} data-testid="email-prefs-save">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('emailPrefs.save')}
              </Button>
              {dirty && (
                <span className="text-xs text-muted-foreground">{t('emailPrefs.unsaved')}</span>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
