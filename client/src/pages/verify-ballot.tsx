/**
 * Public ballot-certificate verification — /verify
 *
 * Anyone holding an inclusion certificate (or just a chain fingerprint) can
 * check it here without an account: paste the fingerprint, get a clear
 * genuine / not-found verdict with the recorded cast time. Prefills from
 * ?proposal=&hash= so certificates can link straight to a filled-in check.
 *
 * Deliberate properties, explained on the page: the check proves a ballot
 * is COUNTED, never WHO cast it (possession is not authorship — that
 * deniability protects voters), and never WHAT it chose (receipt-freeness).
 */

import { useEffect, useState } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck, ShieldX, Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

type Lang = 'el' | 'en';
const L: Record<Lang, Record<string, string>> = {
  el: {
    title: 'Επαλήθευση ψηφοδελτίου',
    subtitle: 'Ελέγξτε αν ένα πιστοποιητικό καταχώρησης είναι γνήσιο — χωρίς λογαριασμό.',
    proposal: 'Αριθμός πρότασης',
    hash: 'Αποτύπωμα αλυσίδας (SHA-256)',
    hashHint: 'Όπως αναγράφεται στο πιστοποιητικό ή στην απόδειξη — κενά και αλλαγές γραμμής αγνοούνται.',
    check: 'Έλεγχος',
    genuine: 'Γνήσιο — το ψηφοδέλτιο έχει καταμετρηθεί',
    genuineAt: 'Καταχωρήθηκε:',
    notFound: 'Δεν βρέθηκε',
    notFoundBody: 'Αυτό το αποτύπωμα δεν υπάρχει στην αλυσίδα της συγκεκριμένης πρότασης. Είτε το πιστοποιητικό δεν είναι γνήσιο, είτε αναφέρεται σε άλλη πρόταση.',
    error: 'Ο έλεγχος απέτυχε — δοκιμάστε ξανά.',
    what1: 'Τι αποδεικνύει ο έλεγχος: ότι το συγκεκριμένο σφραγισμένο ψηφοδέλτιο βρίσκεται στην κάλπη και μετρήθηκε.',
    what2: 'Τι ΔΕΝ αποδεικνύει: ούτε ποιος το έριξε (η κατοχή του πιστοποιητικού δεν αποδεικνύει ιδιοκτησία — αυτό προστατεύει τους ψηφοφόρους από πιέσεις), ούτε τι ψήφισε.',
  },
  en: {
    title: 'Ballot verification',
    subtitle: 'Check whether an inclusion certificate is genuine — no account needed.',
    proposal: 'Proposal number',
    hash: 'Chain fingerprint (SHA-256)',
    hashHint: 'As printed on the certificate or receipt — spaces and line breaks are ignored.',
    check: 'Verify',
    genuine: 'Genuine — this ballot is counted',
    genuineAt: 'Cast at:',
    notFound: 'Not found',
    notFoundBody: 'This fingerprint does not exist in this proposal’s chain. Either the certificate is not genuine, or it refers to a different proposal.',
    error: 'Verification failed — try again.',
    what1: 'What this check proves: that this exact sealed ballot is in the ballot box and was counted.',
    what2: 'What it does NOT prove: who cast it (possession of a certificate is not authorship — that deniability protects voters from pressure), nor what it chose.',
  },
};

export default function VerifyBallotPage() {
  const { locale } = useTranslation();
  const s = L[locale === 'en' ? 'en' : 'el'];

  const params = new URLSearchParams(window.location.search);
  const [proposalId, setProposalId] = useState(params.get('proposal') ?? '');
  const [hash, setHash] = useState(params.get('hash') ?? '');
  const [state, setState] = useState<'idle' | 'loading' | 'genuine' | 'notfound' | 'error'>('idle');
  const [castAt, setCastAt] = useState<string | null>(null);

  async function verify() {
    const pid = parseInt(proposalId, 10);
    const clean = hash.replace(/[^a-f0-9]/gi, '').toLowerCase();
    if (!Number.isFinite(pid) || clean.length < 16) return;
    setState('loading');
    try {
      const resp = await fetch(`/api/proposals/${pid}/receipt-inclusion?rowHash=${clean}`);
      const data = await resp.json();
      if (data.found) {
        setCastAt(data.castAt ?? null);
        setState('genuine');
      } else {
        setState('notfound');
      }
    } catch {
      setState('error');
    }
  }

  // Auto-verify when arriving from a certificate link with both params.
  useEffect(() => {
    if (params.get('proposal') && params.get('hash')) void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow pt-16 pb-16">
        <div className="container mx-auto px-4 max-w-xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-serif font-bold mb-2">{s.title}</h1>
            <p className="text-muted-foreground text-sm">{s.subtitle}</p>
          </div>

          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verify-proposal">{s.proposal}</Label>
                <Input
                  id="verify-proposal"
                  type="number"
                  min={1}
                  value={proposalId}
                  onChange={(e) => setProposalId(e.target.value)}
                  className="max-w-[10rem]"
                  data-testid="verify-proposal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="verify-hash">{s.hash}</Label>
                <Input
                  id="verify-hash"
                  value={hash}
                  onChange={(e) => setHash(e.target.value)}
                  placeholder="48851ed2 325ebd45 …"
                  className="font-mono"
                  data-testid="verify-hash"
                />
                <p className="text-xs text-muted-foreground">{s.hashHint}</p>
              </div>
              <Button
                onClick={verify}
                disabled={state === 'loading' || !proposalId || hash.replace(/[^a-f0-9]/gi, '').length < 16}
                data-testid="verify-submit"
              >
                {state === 'loading' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {s.check}
              </Button>

              {state === 'genuine' && (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 flex gap-3 items-start" data-testid="verify-genuine">
                  <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-800">{s.genuine}</p>
                    {castAt && (
                      <p className="text-sm text-emerald-800/80 mt-1">
                        {s.genuineAt} {new Date(castAt).toLocaleString(locale === 'en' ? 'en-GB' : 'el-GR')}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {state === 'notfound' && (
                <div className="rounded-md border border-red-300 bg-red-50 p-4 flex gap-3 items-start" data-testid="verify-notfound">
                  <ShieldX className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-800">{s.notFound}</p>
                    <p className="text-sm text-red-800/80 mt-1">{s.notFoundBody}</p>
                  </div>
                </div>
              )}
              {state === 'error' && (
                <p className="text-sm text-red-600">{s.error}</p>
              )}
            </CardContent>
          </Card>

          <div className="mt-6 space-y-2 text-xs text-muted-foreground">
            <p>{s.what1}</p>
            <p>{s.what2}</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
