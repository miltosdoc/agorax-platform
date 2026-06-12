/**
 * Panel onboarding — consent + one-time demographic profile + blind-signature
 * enrollment. The profile is submitted on the ANONYMOUS path together with
 * the unblinded token; it never travels with the user's session.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import {
  AGE_BANDS, GENDERS, NUTS2_REGIONS, EDUCATION_LEVELS, URBANITY_LEVELS, PAST_VOTE_2023,
  type PanelProfileInput,
} from '@shared/polling';
import { enrollInPanel, fetchEnrollKey, fetchPanelMe } from '@/lib/panel-client';

const GENDER_LABELS: Record<string, string> = { male: 'Άνδρας', female: 'Γυναίκα', other: 'Άλλο' };
const REGION_LABELS: Record<string, string> = {
  EL30: 'Αττική', EL41: 'Βόρειο Αιγαίο', EL42: 'Νότιο Αιγαίο', EL43: 'Κρήτη',
  EL51: 'Αν. Μακεδονία & Θράκη', EL52: 'Κεντρική Μακεδονία', EL53: 'Δυτική Μακεδονία',
  EL54: 'Ήπειρος', EL61: 'Θεσσαλία', EL62: 'Ιόνια Νησιά', EL63: 'Δυτική Ελλάδα',
  EL64: 'Στερεά Ελλάδα', EL65: 'Πελοπόννησος',
};
const EDUCATION_LABELS: Record<string, string> = {
  primary: 'Έως Γυμνάσιο', secondary: 'Λύκειο', post_secondary: 'ΙΕΚ / Μεταδευτεροβάθμια',
  tertiary: 'ΑΕΙ / ΤΕΙ', postgraduate: 'Μεταπτυχιακό / Διδακτορικό',
};
const URBANITY_LABELS: Record<string, string> = {
  urban: 'Αστική περιοχή (>50.000)', semi_urban: 'Ημιαστική (10.000–50.000)', rural: 'Αγροτική (<10.000)',
};
const PAST_VOTE_LABELS: Record<string, string> = {
  nd: 'ΝΔ', syriza: 'ΣΥΡΙΖΑ', pasok: 'ΠΑΣΟΚ', kke: 'ΚΚΕ', spartiates: 'Σπαρτιάτες',
  elliniki_lysi: 'Ελληνική Λύση', niki: 'Νίκη', plefsi: 'Πλεύση Ελευθερίας', mera25: 'ΜέΡΑ25',
  other: 'Άλλο κόμμα', blank_invalid: 'Λευκό / Άκυρο', did_not_vote: 'Δεν ψήφισα',
  not_eligible: 'Δεν είχα δικαίωμα ψήφου', prefer_not_to_say: 'Προτιμώ να μην απαντήσω',
};

export default function PanelOnboardingPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [consentText, setConsentText] = useState<string | null>(null);
  const [consentVersion, setConsentVersion] = useState<string | null>(null);
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);
  const [isPanelist, setIsPanelist] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<Partial<PanelProfileInput>>({});
  const [smoker, setSmoker] = useState<string>('');
  const [car, setCar] = useState<string>('');
  const [householdSize, setHouseholdSize] = useState<string>('');

  useEffect(() => {
    fetchPanelMe().then((me) => setIsPanelist(!!me)).catch(() => {});
    fetchEnrollKey()
      .then((info) => {
        setConsentText(info.consentText.el);
        setConsentVersion(info.consentVersion);
        setAlreadyEnrolled(info.alreadyEnrolled);
      })
      .catch((e) => setError(e?.message ?? 'Σφάλμα φόρτωσης'));
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
        'el',
      );
      toast({ title: 'Καλώς ήρθες στο πάνελ!', description: 'Η εγγραφή σου ολοκληρώθηκε ανώνυμα.' });
      navigate('/surveys');
    } catch (e: any) {
      setError(e?.message ?? 'Η εγγραφή απέτυχε');
    } finally {
      setBusy(false);
    }
  }

  const selectField = (
    label: string, value: string | undefined, onChange: (v: string) => void,
    entries: ReadonlyArray<string>, labels: Record<string, string>,
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value ?? ''} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Επίλεξε…" /></SelectTrigger>
        <SelectContent>
          {entries.map((e) => <SelectItem key={e} value={e}>{labels[e] ?? e}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  if (isPanelist) {
    return (
      <AppShell title="Πάνελ Δημοσκοπήσεων">
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <ShieldCheck className="w-10 h-10 mx-auto text-green-600" />
            <p className="font-medium">Είσαι ήδη μέλος του πάνελ σε αυτή τη συσκευή.</p>
            <Button onClick={() => navigate('/surveys')}>Δες τις ενεργές δημοσκοπήσεις</Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Εγγραφή στο Πάνελ Δημοσκοπήσεων">
      <p className="text-sm text-muted-foreground -mt-4 mb-6">
        Μία φορά, ανώνυμα. Το προφίλ σου αποθηκεύεται μόνο έναντι ανώνυμου
        αναγνωριστικού — ποτέ μαζί με το όνομά σου.
      </p>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {alreadyEnrolled && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 mb-4">
          Έχεις ήδη εγγραφεί στο πάνελ από άλλη συσκευή ή πρόγραμμα περιήγησης.
          Για λόγους ανωνυμίας κάθε λογαριασμός εγγράφεται μία μόνο φορά — η
          ταυτότητα πάνελ ζει στη συσκευή που έκανε την εγγραφή.
        </div>
      )}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Δημογραφικό προφίλ</CardTitle>
            <CardDescription>
              Χρησιμοποιείται αποκλειστικά για στατιστική στάθμιση. Ετήσια επικαιροποίηση.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            {selectField('Ηλικιακή ομάδα', profile.ageBand, set('ageBand'), AGE_BANDS, Object.fromEntries(AGE_BANDS.map(a => [a, a])))}
            {selectField('Φύλο', profile.gender, set('gender'), GENDERS, GENDER_LABELS)}
            {selectField('Περιφέρεια', profile.region, set('region'), NUTS2_REGIONS, REGION_LABELS)}
            {selectField('Εκπαίδευση', profile.education, set('education'), EDUCATION_LEVELS, EDUCATION_LABELS)}
            {selectField('Περιοχή κατοικίας', profile.urbanity, set('urbanity'), URBANITY_LEVELS, URBANITY_LABELS)}
            {selectField('Ψήφος στις εκλογές Ιουνίου 2023', profile.pastVote2023, set('pastVote2023'), PAST_VOTE_2023, PAST_VOTE_LABELS)}
            {selectField('Καπνίζετε, έστω και περιστασιακά;', smoker, setSmoker, ['yes', 'no'], { yes: 'Ναι', no: 'Όχι' })}
            {selectField('Διαθέτει το νοικοκυριό σας Ι.Χ.;', car, setCar, ['yes', 'no'], { yes: 'Ναι', no: 'Όχι' })}
            {selectField('Μέγεθος νοικοκυριού', householdSize, setHouseholdSize,
              ['1', '2', '3', '4', '5', '6'],
              { 1: '1 άτομο', 2: '2 άτομα', 3: '3 άτομα', 4: '4 άτομα', 5: '5 άτομα', 6: '6+ άτομα' })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Συγκατάθεση (ξεχωριστός σκοπός ΓΚΠΔ)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="whitespace-pre-wrap text-xs bg-muted rounded p-3 max-h-56 overflow-y-auto font-sans">
              {consentText ?? 'Φόρτωση…'}
            </pre>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
              <span>Διάβασα και συναινώ ρητά στην επεξεργασία όπως περιγράφεται παραπάνω.</span>
            </label>
            <Button onClick={submit} disabled={!complete || busy || alreadyEnrolled} className="w-full sm:w-auto">
              {busy ? 'Δημιουργία ανώνυμης ταυτότητας…' : 'Εγγραφή στο πάνελ'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Η εγγραφή χρησιμοποιεί τυφλές υπογραφές (RFC 9474): ο διακομιστής
              πιστοποιεί ότι είσαι επαληθευμένο μέλος χωρίς να μάθει ποια
              ταυτότητα πάνελ απέκτησες.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
