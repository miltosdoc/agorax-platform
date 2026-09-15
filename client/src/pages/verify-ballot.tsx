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
import { ShieldCheck, ShieldX, Loader2, Anchor } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

type Lang = 'el' | 'en';

interface AnchorEntry {
  phase: 'open' | 'final';
  headHash: string;
  total: number;
  verifyOk: boolean;
  anchoredAt: string;
  commit: string | null;
  url: string | null;
  bitcoin?: {
    status: 'none' | 'pending' | 'complete' | 'failed';
    blockHeight: number | null;
    proofUrl: string | null;
  };
}
interface AnchorInfo {
  configured: boolean;
  file: string | null;
  anchors: AnchorEntry[];
}
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
    anchorsTitle: 'Εξωτερική αγκύρωση της κάλπης',
    anchorsBody: 'Το αποτύπωμα ολόκληρης της κάλπης δημοσιεύεται περιοδικά σε δημόσιο αποθετήριο εκτός του διακομιστή. Αν η κάλπη αλλοιωθεί εκ των υστέρων, το δημοσιευμένο αποτύπωμα παύει να ταιριάζει.',
    anchorsLatest: 'Τελευταία δημοσίευση:',
    anchorsCount: 'δημοσιεύσεις συνολικά',
    anchorsFinal: 'σφραγισμένη μετά το κλείσιμο',
    anchorsOpen: 'ψηφοφορία σε εξέλιξη',
    anchorsView: 'Δείτε το δημόσιο αρχείο',
    anchorsNone: 'Δεν έχει δημοσιευθεί ακόμη αγκύρωση για αυτή την πρόταση.',
    anchorsOff: 'Η εξωτερική αγκύρωση δεν είναι ενεργή σε αυτή την εγκατάσταση.',
    btcConfirmed: 'Χρονοσήμανση Bitcoin: επιβεβαιωμένη στο block',
    btcPending: 'Χρονοσήμανση Bitcoin: αναμένεται επιβεβαίωση (συνήθως 1–3 ώρες)',
    btcProof: 'απόδειξη',
    howTitle: 'Πώς προστατεύεται η κάλπη',
    how1: 'Κάθε ψηφοδέλτιο σφραγίζεται πάνω στο προηγούμενο. Αν αλλάξει ή αφαιρεθεί έστω ένα, η σφραγίδα όλων των επόμενων σπάει.',
    how2: 'Το αποτύπωμα της κάλπης δημοσιεύεται κάθε 10 λεπτά σε δημόσιο αποθετήριο στο GitHub, ορατό σε όλους.',
    how3: 'Κάθε αποτύπωμα καταχωρείται και στο Bitcoin μέσω OpenTimestamps. Έτσι η ώρα και το περιεχόμενο κλειδώνουν σε ένα δίκτυο που κανείς δεν ελέγχει — ούτε εμείς.',
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
    anchorsTitle: 'External anchoring of the ballot box',
    anchorsBody: 'The fingerprint of the whole ballot box is published periodically to a public repository outside this server. If the box is altered afterwards, the published fingerprint no longer matches.',
    anchorsLatest: 'Latest publication:',
    anchorsCount: 'publications in total',
    anchorsFinal: 'sealed after close',
    anchorsOpen: 'vote in progress',
    anchorsView: 'View the public record',
    anchorsNone: 'No anchor has been published for this proposal yet.',
    anchorsOff: 'External anchoring is not enabled on this installation.',
    btcConfirmed: 'Bitcoin timestamp: confirmed in block',
    btcPending: 'Bitcoin timestamp: awaiting confirmation (usually 1–3 hours)',
    btcProof: 'proof',
    howTitle: 'How the ballot box is protected',
    how1: 'Every ballot is sealed onto the previous one. Change or remove a single one and the seal on every later ballot breaks.',
    how2: 'The fingerprint of the ballot box is published every 10 minutes to a public GitHub repository, visible to everyone.',
    how3: 'Every fingerprint is also recorded in Bitcoin through OpenTimestamps, locking its time and content into a network nobody controls — not even us.',
  },
};

export default function VerifyBallotPage() {
  const { locale } = useTranslation();
  const s = L[locale === 'en' ? 'en' : 'el'];

  const params = new URLSearchParams(window.location.search);
  const [proposalId, setProposalId] = useState(params.get('proposal') ?? '');
  const [anchors, setAnchors] = useState<AnchorInfo | null>(null);
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

  // Once a proposal has been checked, show how its whole ballot box is
  // anchored outside this server — context for the single-ballot result.
  useEffect(() => {
    if (state !== 'genuine' && state !== 'notfound') { setAnchors(null); return; }
    const pid = Number(proposalId);
    if (!Number.isFinite(pid)) return;
    let cancelled = false;
    fetch(`/api/proposals/${pid}/election/anchors`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: AnchorInfo | null) => { if (!cancelled) setAnchors(data); })
      .catch(() => { if (!cancelled) setAnchors(null); });
    return () => { cancelled = true; };
  }, [state, proposalId]);

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

          <div className="mt-6 rounded-md border p-4 text-sm" data-testid="verify-how">
            <p className="font-semibold">{s.howTitle}</p>
            <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground list-decimal pl-4">
              <li>{s.how1}</li>
              <li>{s.how2}</li>
              <li>{s.how3}</li>
            </ol>
          </div>

          {anchors && (
            <div className="mt-6 rounded-md border p-4 text-sm" data-testid="verify-anchors">
              <p className="font-semibold flex items-center gap-2">
                <Anchor className="w-4 h-4" /> {s.anchorsTitle}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{s.anchorsBody}</p>
              {!anchors.configured && (
                <p className="text-xs mt-2">{s.anchorsOff}</p>
              )}
              {anchors.configured && anchors.anchors.length === 0 && (
                <p className="text-xs mt-2">{s.anchorsNone}</p>
              )}
              {anchors.anchors.length > 0 && (() => {
                const last = anchors.anchors[anchors.anchors.length - 1];
                return (
                  <div className="mt-2 space-y-1 text-xs">
                    <p>
                      {s.anchorsLatest}{' '}
                      {new Date(last.anchoredAt).toLocaleString(locale === 'en' ? 'en-GB' : 'el-GR')}
                      {' · '}{last.phase === 'final' ? s.anchorsFinal : s.anchorsOpen}
                      {' · '}{anchors.anchors.length} {s.anchorsCount}
                    </p>
                    <p className="font-mono break-all text-muted-foreground">{last.headHash}</p>
                    {(() => {
                      const confirmed = anchors.anchors.filter(a => a.bitcoin?.status === 'complete');
                      const latestConfirmed = confirmed[confirmed.length - 1];
                      if (latestConfirmed) {
                        return (
                          <p data-testid="verify-anchors-bitcoin">
                            {s.btcConfirmed} {latestConfirmed.bitcoin!.blockHeight}
                            {latestConfirmed.bitcoin!.proofUrl && (
                              <> · <a href={latestConfirmed.bitcoin!.proofUrl} target="_blank" rel="noopener noreferrer" className="underline">{s.btcProof}</a></>
                            )}
                          </p>
                        );
                      }
                      if (last.bitcoin?.status === 'pending') {
                        return <p data-testid="verify-anchors-bitcoin">{s.btcPending}</p>;
                      }
                      return null;
                    })()}
                    {(last.url || anchors.file) && (
                      <a
                        href={last.url ?? anchors.file ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                        data-testid="verify-anchors-link"
                      >
                        {s.anchorsView}
                      </a>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
