/**
 * Public verification — /verify
 *
 * Two checks, no account needed:
 *
 *   Ballot box — enter a proposal number. The browser itself cross-checks
 *   three independent records: the live chain on this server, the anchors
 *   published to GitHub (fetched from GitHub), and the Bitcoin timestamps of
 *   those anchors (checked against a public block explorer). The server is
 *   not trusted for the comparison.
 *
 *   Ballot — paste the fingerprint from a receipt or certificate and learn
 *   whether that sealed ballot is in the box. It proves the ballot is
 *   COUNTED, never who cast it nor what it chose.
 *
 * Prefills from ?proposal= (box check) and ?proposal=&hash= (ballot check).
 *
 * Written for members, not auditors: each result leads with a plain-Greek
 * answer and three plain checks; the cryptographic detail sits in a
 * collapsed "technical details" section. The explanation of what protects
 * a vote reuses the FAQ's text (faq.q15_*) so the two never disagree.
 */

import { useEffect, useState } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ShieldCheck, ShieldX, ShieldAlert, Loader2, Copy, Check, ExternalLink, ChevronDown,
  EyeOff, UserCheck, Link2, Receipt, Globe, Clock, Vote, Boxes,
} from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { auditBallotBox, type AuditReport } from '@/lib/ballot-box-audit';

type Lang = 'el' | 'en';
type Mode = 'box' | 'ballot';

const L: Record<Lang, Record<string, string>> = {
  el: {
    title: 'Επαλήθευση ψήφου',
    subtitle: 'Έλεγξε μόνος σου ότι η ψήφος σου μετρήθηκε και ότι κανείς δεν πείραξε την κάλπη — ούτε εμείς. Δεν χρειάζεται λογαριασμός.',
    pickBallotTitle: 'Μετρήθηκε η ψήφος μου;',
    pickBallotBody: 'Με το αποτύπωμα από την απόδειξη που πήρες όταν ψήφισες.',
    pickBoxTitle: 'Είναι ακέραιη η κάλπη;',
    pickBoxBody: 'Για οποιαδήποτε πρόταση, μόνο με τον αριθμό της.',
    plainChain: 'Καμία ψήφος δεν άλλαξε ούτε σβήστηκε',
    plainChainBad: 'Κάποια ψήφος άλλαξε ή σβήστηκε',
    plainChainUnknown: 'Δεν ήταν δυνατός ο έλεγχος των ψήφων',
    plainChecked: 'ψηφοδέλτια ελέγχθηκαν ένα προς ένα',
    plainGithub: 'Ταιριάζει με όσα δημοσιεύσαμε δημόσια στο GitHub',
    plainGithubBad: 'ΔΕΝ ταιριάζει με όσα δημοσιεύσαμε στο GitHub',
    plainGithubWait: 'Δεν υπάρχει ακόμη δημόσια καταγραφή για σύγκριση',
    plainBitcoin: 'Η ώρα και το περιεχόμενο είναι κλειδωμένα στο Bitcoin',
    plainBitcoinBad: 'Η καταγραφή στο Bitcoin ΔΕΝ ταιριάζει',
    plainBitcoinWait: 'Αναμένεται η καταγραφή στο Bitcoin (συνήθως 1–3 ώρες)',
    technical: 'Τεχνικές λεπτομέρειες',
    genuinePlain: 'Ναι — η ψήφος σου είναι στην κάλπη και μετρήθηκε.',
    genuineWhat: 'Αυτό είναι το μόνο που δείχνει ο έλεγχος. Δεν δείχνει ποιος ψήφισε ούτε τι ψήφισε.',
    whyTitle: 'Γιατί η απόδειξη δεν δείχνει τι ψήφισες',
    why1: 'Αν η απόδειξη έγραφε την επιλογή σου, κάποιος — ένας εργοδότης, ένας συγγενής, κάποιος που αγοράζει ψήφους — θα μπορούσε να σου ζητήσει να του τη δείξεις.',
    why2: 'Γι\'αυτό η απόδειξη αποδεικνύει μόνο ότι η ψήφος σου μετρήθηκε. Τι ψήφισες το ξέρεις μόνο εσύ, και δεν μπορείς να το αποδείξεις σε κανέναν, ακόμη κι αν σε πιέσουν. Αυτό σε προστατεύει.',
    protectTitle: 'Τι προστατεύει την ψήφο σου',
    faqLink: 'Διάβασε περισσότερα στις Συχνές Ερωτήσεις →',
    modeBox: 'Κάλπη',
    modeBallot: 'Ψηφοδέλτιο',
    proposal: 'Αριθμός πρότασης',
    hash: 'Αποτύπωμα ψήφου',
    hashHint: 'Αντέγραψέ το από την απόδειξη ή το πιστοποιητικό σου. Τα κενά δεν πειράζουν.',
    check: 'Έλεγχος',
    running: 'Έλεγχος σε εξέλιξη…',
    stepServer: 'Επανυπολογισμός της αλυσίδας στον διακομιστή',
    stepGithub: 'Ανάγνωση των δημοσιευμένων αποτυπωμάτων από το GitHub',
    stepInclusion: 'Σύγκριση δημοσιευμένων αποτυπωμάτων με την κάλπη',
    stepBitcoin: 'Έλεγχος χρονοσημάνσεων στο Bitcoin',
    okTitle: 'Η κάλπη είναι ακέραιη',
    okBody: 'Οι ψήφοι είναι ακριβώς όπως ρίχτηκαν και ταιριάζουν με τις δημόσιες καταγραφές που δεν ελέγχουμε εμείς.',
    problemTitle: 'Βρέθηκε ασυμφωνία',
    problemBody: 'Κάποιος από τους ελέγχους απέτυχε. Δες ποιος παρακάτω — και ενημέρωσέ μας.',
    incompleteTitle: 'Μερικός έλεγχος',
    incompleteBody: 'Κάποιοι έλεγχοι δεν ολοκληρώθηκαν ακόμη. Ό,τι ελέγχθηκε φαίνεται παρακάτω· δοκίμασε ξανά σε λίγο.',
    chain: 'Αλυσίδα κάλπης',
    chainOk: 'Όλα τα ψηφοδέλτια επανυπολογίστηκαν και η αλυσίδα είναι συνεχής',
    chainBad: 'Η αλυσίδα σπάει — κάποιο ψηφοδέλτιο αλλοιώθηκε ή αφαιρέθηκε',
    chainUnknown: 'Ο διακομιστής δεν απάντησε',
    fingerprint: 'Αποτύπωμα κάλπης',
    ballots: 'ψηφοδέλτια',
    copy: 'Αντιγραφή',
    github: 'Δημοσιευμένα αποτυπώματα (GitHub)',
    githubNone: 'Δεν έχει δημοσιευθεί ακόμη αποτύπωμα για αυτή την πρόταση.',
    githubUnreachable: 'Το GitHub δεν ήταν προσβάσιμο.',
    githubCount: 'δημοσιεύσεις, από',
    githubTo: 'έως',
    seqOk: 'Η ακολουθία των δημοσιεύσεων είναι συνεχής και σωστά υπογεγραμμένη',
    seqBad: 'Η ακολουθία των δημοσιεύσεων έχει αλλοιωθεί',
    inclOk: 'Κάθε δημοσιευμένο αποτύπωμα υπάρχει στη σημερινή κάλπη',
    inclBad: 'δημοσιευμένα αποτυπώματα ΔΕΝ υπάρχουν πια στην κάλπη — η κάλπη ξαναγράφτηκε μετά τη δημοσίευση',
    inclNone: 'Δεν υπήρχαν ακόμη ψηφοδέλτια όταν έγιναν οι δημοσιεύσεις',
    finalOk: 'Το τελικό σφραγισμένο αποτύπωμα ταυτίζεται με τη σημερινή κάλπη',
    finalBad: 'Το τελικό σφραγισμένο αποτύπωμα ΔΙΑΦΕΡΕΙ από τη σημερινή κάλπη',
    open: 'Η ψηφοφορία είναι ακόμη ανοιχτή — το τελικό αποτύπωμα σφραγίζεται στο κλείσιμο.',
    viewFile: 'Δείτε το αρχείο στο GitHub',
    bitcoin: 'Χρονοσημάνσεις Bitcoin',
    btcConfirmed: 'Επιβεβαιωμένη στο block',
    btcMismatch: 'ΔΕΝ ταιριάζει με το block',
    btcPending: 'Αναμένεται επιβεβαίωση στο Bitcoin (συνήθως 1–3 ώρες)',
    btcError: 'Δεν ελέγχθηκε',
    btcBlockTime: 'ώρα block',
    btcProof: 'απόδειξη',
    btcExplorer: 'block',
    btcNone: 'Δεν υπάρχουν ακόμη χρονοσημάνσεις.',
    btcHow: 'Ο έλεγχος γίνεται στον φυλλομετρητή σας: η απόδειξη διαβάζεται από το GitHub και συγκρίνεται με το block όπως το δίνει δημόσιος εξερευνητής του Bitcoin. Μπορείτε να την επαληθεύσετε και ανεξάρτητα στο opentimestamps.org.',
    genuineAt: 'Καταχωρήθηκε:',
    notFound: 'Δεν βρέθηκε',
    notFoundBody: 'Αυτό το αποτύπωμα δεν υπάρχει στην κάλπη αυτής της πρότασης. Έλεγξε ότι έγραψες σωστά τον αριθμό της πρότασης και ολόκληρο το αποτύπωμα. Αν είναι σωστά, η απόδειξη δεν είναι γνήσια.',
    error: 'Ο έλεγχος δεν ολοκληρώθηκε — δοκίμασε ξανά.',
    checkBox: 'Ελέγξτε ολόκληρη την κάλπη αυτής της πρότασης',
  },
  en: {
    title: 'Verify a vote',
    subtitle: 'Check for yourself that your vote was counted and that nobody tampered with the ballot box — not even us. No account needed.',
    pickBallotTitle: 'Was my vote counted?',
    pickBallotBody: 'With the fingerprint from the receipt you got when you voted.',
    pickBoxTitle: 'Is the ballot box intact?',
    pickBoxBody: 'For any proposal, with just its number.',
    plainChain: 'No vote was changed or deleted',
    plainChainBad: 'A vote was changed or deleted',
    plainChainUnknown: 'The votes could not be checked',
    plainChecked: 'ballots checked one by one',
    plainGithub: 'Matches what we published publicly on GitHub',
    plainGithubBad: 'Does NOT match what we published on GitHub',
    plainGithubWait: 'No public record to compare with yet',
    plainBitcoin: 'Its time and content are locked into Bitcoin',
    plainBitcoinBad: 'The Bitcoin record does NOT match',
    plainBitcoinWait: 'Waiting for the Bitcoin record (usually 1–3 hours)',
    technical: 'Technical details',
    genuinePlain: 'Yes — your vote is in the ballot box and was counted.',
    genuineWhat: 'That is all this check shows. It does not show who voted or how.',
    whyTitle: 'Why the receipt does not show how you voted',
    why1: 'If the receipt showed your choice, someone — an employer, a relative, a vote buyer — could ask you to show it to them.',
    why2: 'So the receipt proves only that your vote was counted. How you voted is known only to you, and you cannot prove it to anyone, even under pressure. That protects you.',
    protectTitle: 'What protects your vote',
    faqLink: 'Read more in the FAQ →',
    modeBox: 'Ballot box',
    modeBallot: 'Ballot',
    proposal: 'Proposal number',
    hash: 'Vote fingerprint',
    hashHint: 'Copy it from your receipt or certificate. Spaces do not matter.',
    check: 'Verify',
    running: 'Checking…',
    stepServer: 'Recomputing the chain on the server',
    stepGithub: 'Reading the published fingerprints from GitHub',
    stepInclusion: 'Comparing published fingerprints with the ballot box',
    stepBitcoin: 'Checking Bitcoin timestamps',
    okTitle: 'The ballot box is intact',
    okBody: 'The votes are exactly as they were cast and match public records we do not control.',
    problemTitle: 'Discrepancy found',
    problemBody: 'One of the three records disagrees with the others. See the details below.',
    incompleteTitle: 'Partial check',
    incompleteBody: 'Not every source could be read. What was checked is shown below — try again shortly.',
    chain: 'Ballot-box chain',
    chainOk: 'Every ballot recomputed and the chain is unbroken',
    chainBad: 'The chain breaks — a ballot was altered or removed',
    chainUnknown: 'The server did not answer',
    fingerprint: 'Ballot-box fingerprint',
    ballots: 'ballots',
    copy: 'Copy',
    github: 'Published fingerprints (GitHub)',
    githubNone: 'No fingerprint has been published for this proposal yet.',
    githubUnreachable: 'GitHub could not be reached.',
    githubCount: 'publications, from',
    githubTo: 'to',
    seqOk: 'The publication sequence is unbroken and correctly signed',
    seqBad: 'The publication sequence has been altered',
    inclOk: 'Every published fingerprint is present in today’s ballot box',
    inclBad: 'published fingerprints are NO LONGER in the box — the box was rewritten after publication',
    inclNone: 'No ballots had been cast yet when these were published',
    finalOk: 'The final sealed fingerprint equals today’s ballot box',
    finalBad: 'The final sealed fingerprint DIFFERS from today’s ballot box',
    open: 'The vote is still open — the final fingerprint is sealed at close.',
    viewFile: 'View the file on GitHub',
    bitcoin: 'Bitcoin timestamps',
    btcConfirmed: 'Confirmed in block',
    btcMismatch: 'Does NOT match the block',
    btcPending: 'Awaiting Bitcoin confirmation (usually 1–3 hours)',
    btcError: 'Not checked',
    btcBlockTime: 'block time',
    btcProof: 'proof',
    btcExplorer: 'block',
    btcNone: 'No timestamps yet.',
    btcHow: 'This check runs in your browser: the proof is read from GitHub and compared with the block as served by a public Bitcoin explorer. You can also verify it independently at opentimestamps.org.',
    genuineAt: 'Cast at:',
    notFound: 'Not found',
    notFoundBody: 'This fingerprint is not in this proposal’s ballot box. Check that the proposal number and the whole fingerprint are correct. If they are, the receipt is not genuine.',
    error: 'Verification failed — try again.',
    checkBox: 'Audit this proposal’s whole ballot box',
  },
};

function Row({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  const Icon = ok === true ? ShieldCheck : ok === false ? ShieldX : ShieldAlert;
  const color = ok === true ? 'text-emerald-600' : ok === false ? 'text-red-600' : 'text-amber-600';
  return (
    <li className="flex gap-2 items-start text-sm">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
      <span>{children}</span>
    </li>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2"
      aria-label={label}
      onClick={() => navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {})}
    >
      {done ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}

export default function VerifyBallotPage() {
  const { t, locale } = useTranslation();
  const lang: Lang = locale === 'en' ? 'en' : 'el';
  const s = L[lang];
  const fmt = (iso: string | number) => new Date(typeof iso === 'number' ? iso * 1000 : iso).toLocaleString(lang === 'en' ? 'en-GB' : 'el-GR');

  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState<Mode>(params.get('hash') ? 'ballot' : 'box');
  const [proposalId, setProposalId] = useState(params.get('proposal') ?? '');
  const [hash, setHash] = useState(params.get('hash') ?? '');

  // Ballot-box audit.
  const [report, setReport] = useState<AuditReport | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  // Single-ballot check.
  const [state, setState] = useState<'idle' | 'loading' | 'genuine' | 'notfound' | 'error'>('idle');
  const [castAt, setCastAt] = useState<string | null>(null);

  async function runAudit() {
    const pid = parseInt(proposalId, 10);
    if (!Number.isFinite(pid) || pid <= 0) return;
    setAuditing(true);
    setReport(null);
    try {
      const r = await auditBallotBox(pid, { onProgress: (st) => setStep(st) });
      setReport(r);
    } finally {
      setAuditing(false);
      setStep(null);
    }
  }

  async function verifyBallot() {
    const pid = parseInt(proposalId, 10);
    const clean = hash.replace(/[^a-f0-9]/gi, '').toLowerCase();
    if (!Number.isFinite(pid) || clean.length < 16) return;
    setState('loading');
    try {
      const resp = await fetch(`/api/proposals/${pid}/receipt-inclusion?rowHash=${clean}`);
      const data = await resp.json();
      setCastAt(data.found ? (data.castAt ?? null) : null);
      setState(data.found ? 'genuine' : 'notfound');
    } catch {
      setState('error');
    }
  }

  // Auto-run when arriving with parameters (from a receipt or a proposal page).
  useEffect(() => {
    if (params.get('proposal') && params.get('hash')) void verifyBallot();
    else if (params.get('proposal')) void runAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepLabel = step === 'server' ? s.stepServer : step === 'github' ? s.stepGithub : step === 'inclusion' ? s.stepInclusion : step === 'bitcoin' ? s.stepBitcoin : null;

  // The FAQ's six points, with an icon each.
  const protections = [EyeOff, UserCheck, Link2, Receipt, Globe, Clock];

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow pt-16 pb-16">
        <div className="container mx-auto px-4 max-w-2xl">
          {/* ── Hero ── */}
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="text-3xl font-serif font-bold mb-3">{s.title}</h1>
            <p className="text-muted-foreground mx-auto max-w-prose">{s.subtitle}</p>
          </div>

          {/* ── What do you want to check? ── */}
          <div className="grid gap-3 sm:grid-cols-2 mb-4" role="tablist">
            {([
              { m: 'ballot' as Mode, Icon: Vote, title: s.pickBallotTitle, body: s.pickBallotBody, id: 'verify-mode-ballot' },
              { m: 'box' as Mode, Icon: Boxes, title: s.pickBoxTitle, body: s.pickBoxBody, id: 'verify-mode-box' },
            ]).map(({ m, Icon, title, body, id }) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                data-testid={id}
                className={`rounded-lg border p-4 text-left transition-colors ${mode === m ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'}`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Icon className={`h-5 w-5 shrink-0 ${mode === m ? 'text-primary' : 'text-muted-foreground'}`} /> {title}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{body}</span>
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verify-proposal">{s.proposal}</Label>
                <Input id="verify-proposal" type="number" min={1} value={proposalId} onChange={(e) => setProposalId(e.target.value)} className="max-w-[10rem]" data-testid="verify-proposal" />
              </div>

              {mode === 'ballot' && (
                <div className="space-y-2">
                  <Label htmlFor="verify-hash">{s.hash}</Label>
                  <Input id="verify-hash" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="48851ed2 325ebd45 …" className="font-mono" data-testid="verify-hash" />
                  <p className="text-xs text-muted-foreground">{s.hashHint}</p>
                </div>
              )}

              {mode === 'box' ? (
                <Button onClick={runAudit} disabled={auditing || !proposalId} data-testid="verify-audit">
                  {auditing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {auditing ? s.running : s.check}
                </Button>
              ) : (
                <Button onClick={verifyBallot} disabled={state === 'loading' || !proposalId || hash.replace(/[^a-f0-9]/gi, '').length < 16} data-testid="verify-submit">
                  {state === 'loading' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {s.check}
                </Button>
              )}
              {auditing && stepLabel && <p className="text-xs text-muted-foreground">{stepLabel}</p>}

              {/* ── Ballot-box audit result ── */}
              {mode === 'box' && report && (() => {
                const v = report.verdict;
                const tone = v === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : v === 'problem' ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900';
                const Icon = v === 'ok' ? ShieldCheck : v === 'problem' ? ShieldX : ShieldAlert;
                const g = report.github;
                const anchorsWithBallots = g.anchors.filter(a => a.headHash !== '0'.repeat(64));
                const last = g.anchors[g.anchors.length - 1];

                // Three plain answers, derived from the same report the
                // technical details show.
                const githubOk: boolean | null = !g.fetched || g.anchors.length === 0
                  ? null
                  : g.sequenceOk && g.inclusionMissing === 0 && g.finalMatches !== false;
                const btcBad = report.bitcoin.some(b => b.status === 'mismatch');
                const btcOk = report.bitcoin.some(b => b.status === 'confirmed');
                const bitcoinOk: boolean | null = btcBad ? false : btcOk ? true : null;

                return (
                  <div className="space-y-4" data-testid="verify-audit-result">
                    <div className={`rounded-md border p-4 flex gap-3 items-start ${tone}`}>
                      <Icon className="w-6 h-6 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">{v === 'ok' ? s.okTitle : v === 'problem' ? s.problemTitle : s.incompleteTitle}</p>
                        <p className="text-sm opacity-80 mt-1">{v === 'ok' ? s.okBody : v === 'problem' ? s.problemBody : s.incompleteBody}</p>
                      </div>
                    </div>

                    <ul className="space-y-2.5" data-testid="verify-plain-checks">
                      <Row ok={report.server.chainOk}>
                        {report.server.chainOk === true ? s.plainChain : report.server.chainOk === false ? s.plainChainBad : s.plainChainUnknown}
                        {report.server.total != null && <span className="block text-xs text-muted-foreground">{report.server.total} {s.plainChecked}</span>}
                      </Row>
                      <Row ok={githubOk}>{githubOk === true ? s.plainGithub : githubOk === false ? s.plainGithubBad : s.plainGithubWait}</Row>
                      <Row ok={bitcoinOk}>{bitcoinOk === true ? s.plainBitcoin : bitcoinOk === false ? s.plainBitcoinBad : s.plainBitcoinWait}</Row>
                    </ul>

                    <details className="group rounded-md border" data-testid="verify-technical">
                      <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium">
                        {s.technical}
                        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="space-y-3 border-t p-3">
                        <section className="space-y-2">
                          <h2 className="font-semibold text-sm">{s.chain}</h2>
                          <ul className="space-y-1.5">
                            <Row ok={report.server.chainOk}>{report.server.chainOk === true ? s.chainOk : report.server.chainOk === false ? s.chainBad : s.chainUnknown}</Row>
                          </ul>
                          {report.server.headHash && (
                            <div className="text-xs text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <span>{s.fingerprint} · {report.server.total ?? 0} {s.ballots}</span>
                                <CopyButton value={report.server.headHash} label={s.copy} />
                              </div>
                              <code className="font-mono break-all">{report.server.headHash}</code>
                            </div>
                          )}
                        </section>

                        <section className="space-y-2 border-t pt-3">
                          <h2 className="font-semibold text-sm">{s.github}</h2>
                          {!g.fetched && <p className="text-sm text-amber-700">{s.githubUnreachable}</p>}
                          {g.fetched && g.anchors.length === 0 && <p className="text-sm text-muted-foreground">{s.githubNone}</p>}
                          {g.anchors.length > 0 && (
                            <>
                              <p className="text-xs text-muted-foreground">
                                {g.anchors.length} {s.githubCount} {fmt(g.anchors[0].capturedAt)} {s.githubTo} {fmt(last.capturedAt)}
                              </p>
                              <ul className="space-y-1.5">
                                <Row ok={g.sequenceOk}>{g.sequenceOk ? s.seqOk : s.seqBad}</Row>
                                {anchorsWithBallots.length === 0 ? (
                                  <Row ok={null}>{s.inclNone}</Row>
                                ) : (
                                  <Row ok={g.inclusionMissing === 0 ? (g.inclusionChecked > 0 ? true : null) : false}>
                                    {g.inclusionMissing === 0 ? s.inclOk : `${g.inclusionMissing} ${s.inclBad}`}
                                  </Row>
                                )}
                                {g.finalMatches !== null ? (
                                  <Row ok={g.finalMatches}>{g.finalMatches ? s.finalOk : s.finalBad}</Row>
                                ) : (
                                  <li className="text-xs text-muted-foreground pl-6">{s.open}</li>
                                )}
                              </ul>
                            </>
                          )}
                          {g.url && (
                            <a href={g.url} target="_blank" rel="noopener noreferrer" className="text-xs underline inline-flex items-center gap-1">
                              {s.viewFile} <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </section>

                        <section className="space-y-2 border-t pt-3">
                          <h2 className="font-semibold text-sm">{s.bitcoin}</h2>
                          {report.bitcoin.length === 0 && <p className="text-sm text-muted-foreground">{s.btcNone}</p>}
                          <ul className="space-y-1.5">
                            {report.bitcoin.map(b => (
                              <Row key={b.anchorHash} ok={b.status === 'confirmed' ? true : b.status === 'mismatch' ? false : null}>
                                <span className="text-xs text-muted-foreground">{fmt(b.capturedAt)} · </span>
                                {b.status === 'confirmed' && <>{s.btcConfirmed} {b.height}{b.blockTime ? ` (${s.btcBlockTime} ${fmt(b.blockTime)})` : ''}</>}
                                {b.status === 'mismatch' && <>{s.btcMismatch} {b.height}</>}
                                {b.status === 'pending' && s.btcPending}
                                {b.status === 'error' && <>{s.btcError}{b.detail ? ` — ${b.detail}` : ''}</>}
                                {b.status !== 'pending' && (
                                  <span className="text-xs">
                                    {' · '}<a href={b.proofUrl} target="_blank" rel="noopener noreferrer" className="underline">{s.btcProof}</a>
                                    {b.blockHash && <>{' · '}<a href={`https://blockstream.info/block/${b.blockHash}`} target="_blank" rel="noopener noreferrer" className="underline">{s.btcExplorer}</a></>}
                                  </span>
                                )}
                              </Row>
                            ))}
                          </ul>
                          <p className="text-xs text-muted-foreground">{s.btcHow}</p>
                        </section>
                      </div>
                    </details>
                  </div>
                );
              })()}

              {/* ── Single-ballot result ── */}
              {mode === 'ballot' && state === 'genuine' && (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 flex gap-3 items-start" data-testid="verify-genuine">
                  <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-800">{s.genuinePlain}</p>
                    {castAt && <p className="text-sm text-emerald-800/80 mt-1">{s.genuineAt} {fmt(castAt)}</p>}
                    <p className="text-sm text-emerald-800/80 mt-1">{s.genuineWhat}</p>
                    <button type="button" className="text-xs underline mt-2 text-emerald-900" onClick={() => { setMode('box'); void runAudit(); }} data-testid="verify-switch-box">
                      {s.checkBox}
                    </button>
                  </div>
                </div>
              )}
              {mode === 'ballot' && state === 'notfound' && (
                <div className="rounded-md border border-red-300 bg-red-50 p-4 flex gap-3 items-start" data-testid="verify-notfound">
                  <ShieldX className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-800">{s.notFound}</p>
                    <p className="text-sm text-red-800/80 mt-1">{s.notFoundBody}</p>
                  </div>
                </div>
              )}
              {mode === 'ballot' && state === 'error' && <p className="text-sm text-red-600">{s.error}</p>}
            </CardContent>
          </Card>

          {/* ── Why the receipt hides the choice ── */}
          <section className="mt-8 rounded-lg border bg-muted/30 p-5" data-testid="verify-why">
            <h2 className="flex items-center gap-2 font-semibold">
              <EyeOff className="h-5 w-5 shrink-0 text-primary" /> {s.whyTitle}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{s.why1}</p>
            <p className="mt-2 text-sm text-muted-foreground">{s.why2}</p>
          </section>

          {/* ── What protects a vote (same text as the FAQ) ── */}
          <section className="mt-8" data-testid="verify-how">
            <h2 className="text-xl font-serif font-bold mb-4">{s.protectTitle}</h2>
            <ol className="grid gap-3 sm:grid-cols-2">
              {protections.map((Icon, i) => (
                <li key={i} className="rounded-lg border p-4">
                  <span className="flex items-start gap-2 font-medium">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="pt-0.5">{t(`faq.q15_p${i + 1}_title`)}</span>
                  </span>
                  <p className="mt-2 text-sm text-muted-foreground">{t(`faq.q15_p${i + 1}_body`)}</p>
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-lg border-l-4 border-primary bg-primary/5 p-4 text-sm">
              <span className="font-semibold">{t('faq.q15_summary_title')}:</span> {t('faq.q15_summary')}
            </div>
            <p className="mt-3 text-sm">
              <a href="/faq" className="underline underline-offset-2">{s.faqLink}</a>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
