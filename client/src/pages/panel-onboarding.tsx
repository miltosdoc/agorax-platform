/**
 * Panel onboarding — consent + one-time demographic profile + blind-signature
 * enrollment. The profile is submitted on the ANONYMOUS path together with
 * the unblinded token; it never travels with the user's session.
 *
 * Device transfer: the panel identity is the token in localStorage. Because
 * the server cannot link it to the account (that's the whole point), moving
 * to a second device is manual — reveal the code here, paste it on the
 * other device's /panel page. The import path validates against /api/panel/me
 * before storing.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { ShieldCheck, AlertTriangle, KeyRound, Smartphone } from 'lucide-react';
import {
  AGE_BANDS, GENDERS, NUTS2_REGIONS, EDUCATION_LEVELS, URBANITY_LEVELS, PAST_VOTE_2023,
  type PanelProfileInput,
} from '@shared/polling';
import { enrollInPanel, fetchEnrollKey, fetchPanelMe, getPanelToken, importPanelToken } from '@/lib/panel-client';

export default function PanelOnboardingPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t, locale } = useTranslation();
  const [consentText, setConsentText] = useState<Record<'el' | 'en', string> | null>(null);
  const [consentVersion, setConsentVersion] = useState<string | null>(null);
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);
  const [isPanelist, setIsPanelist] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [importBusy, setImportBusy] = useState(false);

  const [profile, setProfile] = useState<Partial<PanelProfileInput>>({});
  const [smoker, setSmoker] = useState<string>('');
  const [car, setCar] = useState<string>('');
  const [householdSize, setHouseholdSize] = useState<string>('');

  useEffect(() => {
    fetchPanelMe().then((me) => setIsPanelist(!!me)).catch(() => {});
    fetchEnrollKey()
      .then((info) => {
        setConsentText(info.consentText);
        setConsentVersion(info.consentVersion);
        setAlreadyEnrolled(info.alreadyEnrolled);
      })
      .catch((e) => setError(e?.message ?? t('panel.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key: keyof PanelProfileInput) => (value: string) =>
    setProfile((p) => ({ ...p, [key]: value }));

  const complete =
    profile.ageBand && profile.gender && profile.region && profile.education &&
    profile.urbanity && profile.pastVote2023 && smoker && car && householdSize && agreed;

  async function submit() {
    if (!complete || !consentVersion) return;
    setBusy(true);
    setError(null);
    try {
      await enrollInPanel(
        {
          ...(profile as Omit<PanelProfileInput, 'benchmarks'>),
          benchmarks: {
            smoker: smoker === 'yes',
            household_car: car === 'yes',
            household_size: parseInt(householdSize, 10),
          },
        } as PanelProfileInput,
        consentVersion,
        locale === 'en' ? 'en' : 'el',
      );
      toast({ title: t('panel.welcomeToast'), description: t('panel.welcomeToastSub') });
      navigate('/surveys');
    } catch (e: any) {
      setError(e?.message ?? t('panel.enrollFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setImportBusy(true);
    setError(null);
    const ok = await importPanelToken(importValue).catch(() => false);
    setImportBusy(false);
    if (ok) {
      toast({ title: t('panel.importOk') });
      navigate('/surveys');
    } else {
      setError(t('panel.importInvalid'));
    }
  }

  const selectField = (
    label: string, value: string | undefined, onChange: (v: string) => void,
    entries: ReadonlyArray<string>, labelFor: (entry: string) => string,
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value ?? ''} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={t('panel.choose')} /></SelectTrigger>
        <SelectContent>
          {entries.map((e) => <SelectItem key={e} value={e}>{labelFor(e)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  // The import card — shown both to stuck users (enrolled elsewhere, no
  // local token) and as an option for fresh visitors with a second device.
  const importCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Smartphone className="w-4 h-4" /> {t('panel.importTitle')}
        </CardTitle>
        <CardDescription>{t('panel.importBody')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-2">
        <Input
          value={importValue}
          onChange={(e) => setImportValue(e.target.value)}
          placeholder={t('panel.importPlaceholder')}
          className="font-mono text-xs"
        />
        <Button onClick={doImport} disabled={!importValue.trim() || importBusy} className="shrink-0">
          {t('panel.importButton')}
        </Button>
      </CardContent>
    </Card>
  );

  if (isPanelist) {
    const token = getPanelToken();
    return (
      <AppShell title={t('panel.pageTitle')}>
        <div className="grid gap-4">
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <ShieldCheck className="w-10 h-10 mx-auto text-green-600" />
              <p className="font-medium">{t('panel.alreadyMember')}</p>
              <Button onClick={() => navigate('/surveys')}>{t('panel.goToSurveys')}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="w-4 h-4" /> {t('panel.transferTitle')}
              </CardTitle>
              <CardDescription>{t('panel.transferBody')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!showToken ? (
                <Button variant="outline" size="sm" onClick={() => setShowToken(true)}>
                  {t('panel.revealToken')}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input readOnly value={token ?? ''} className="font-mono text-xs" />
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(token ?? '');
                          toast({ title: t('media.linkCopied') });
                        } catch {
                          toast({ title: t('media.copyFailed'), variant: 'destructive' });
                        }
                      }}
                    >
                      {t('panel.copy')}
                    </Button>
                  </div>
                  <p className="text-xs text-amber-700">{t('panel.tokenWarning')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t('panel.title')}>
      <p className="text-sm text-muted-foreground -mt-4 mb-6">{t('panel.intro')}</p>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {alreadyEnrolled && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 mb-4">
          {t('panel.alreadyEnrolled')}
        </div>
      )}

      <div className="grid gap-6">
        {importCard}

        {!alreadyEnrolled && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('panel.profileTitle')}</CardTitle>
                <CardDescription>{t('panel.profileSub')}</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                {selectField(t('panel.field.ageBand'), profile.ageBand, set('ageBand'), AGE_BANDS, (e) => e)}
                {selectField(t('panel.field.gender'), profile.gender, set('gender'), GENDERS, (e) => t(`panel.gender.${e}`))}
                {selectField(t('panel.field.region'), profile.region, set('region'), NUTS2_REGIONS, (e) => t(`panel.region.${e}`))}
                {selectField(t('panel.field.education'), profile.education, set('education'), EDUCATION_LEVELS, (e) => t(`panel.education.${e}`))}
                {selectField(t('panel.field.urbanity'), profile.urbanity, set('urbanity'), URBANITY_LEVELS, (e) => t(`panel.urbanity.${e}`))}
                {selectField(t('panel.field.pastVote'), profile.pastVote2023, set('pastVote2023'), PAST_VOTE_2023, (e) => t(`panel.pastVote.${e}`))}
                {selectField(t('panel.field.smoker'), smoker, setSmoker, ['yes', 'no'], (e) => (e === 'yes' ? t('panel.yes') : t('panel.no')))}
                {selectField(t('panel.field.car'), car, setCar, ['yes', 'no'], (e) => (e === 'yes' ? t('panel.yes') : t('panel.no')))}
                {selectField(t('panel.field.householdSize'), householdSize, setHouseholdSize,
                  ['1', '2', '3', '4', '5', '6'], (e) => t(`panel.household.${e}`))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('panel.consentTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <pre className="whitespace-pre-wrap text-xs bg-muted rounded p-3 max-h-56 overflow-y-auto font-sans">
                  {consentText ? consentText[locale === 'en' ? 'en' : 'el'] : t('surveys.loading')}
                </pre>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
                  <span>{t('panel.consentAgree')}</span>
                </label>
                <Button onClick={submit} disabled={!complete || busy} className="w-full sm:w-auto">
                  {busy ? t('panel.enrolling') : t('panel.enrollButton')}
                </Button>
                <p className="text-xs text-muted-foreground">{t('panel.blindNote')}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
