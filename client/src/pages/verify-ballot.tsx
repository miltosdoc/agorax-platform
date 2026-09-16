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
 */

import { useEffect, useState } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck, ShieldX, ShieldAlert, Loader2, Copy, Check, ExternalLink } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { auditBallotBox, type AuditReport } from '@/lib/ballot-box-audit';

type Lang = 'el' | 'en';
type Mode = 'box' | 'ballot';

const L: Record<Lang, Record<string, string>> = {
  el: {
    title: 'Επαλήθευση',
    subtitle: 'Ελέγξτε την κάλπη μιας πρότασης ή ένα μεμονωμένο ψηφοδέλτιο — χωρίς λογαριασμό.',
    modeBox: 'Κάλπη',
    modeBallot: 'Ψηφοδέλτιο',
    proposal: 'Αριθμός πρότασης',
    hash: 'Αποτύπωμα ψηφοδελτίου (SHA-256)',
    hashHint: 'Όπως αναγράφεται στην απόδειξη ή στο πιστοποιητικό — κενά και αλλαγές γραμμής αγνοούνται.',
    check: 'Έλεγχος',
    running: 'Έλεγχος σε εξέλιξη…',
    stepServer: 'Επανυπολογισμός της αλυσίδας στον διακομιστή',
    stepGithub: 'Ανάγνωση των δημοσιευμένων αποτυπωμάτων από το GitHub',
    stepInclusion: 'Σύγκριση δημοσιευμένων αποτυπωμάτων με την κάλπη',
    stepBitcoin: 'Έλεγχος χρονοσημάνσεων στο Bitcoin',
    okTitle: 'Η κάλπη είναι ακέραιη',
    okBody: 'Η αλυσίδα επαληθεύεται, κάθε δημοσιευμένο αποτύπωμα υπάρχει στην κάλπη και οι χρονοσημάνσεις Bitcoin ταιριάζουν.',
    problemTitle: 'Βρέθηκε ασυμφωνία',
    problemBody: 'Κάποιο από τα τρία αρχεία δεν συμφωνεί με τα άλλα. Δείτε τις λεπτομέρειες παρακάτω.',
    incompleteTitle: 'Μερικός έλεγχος',
    incompleteBody: 'Δεν ήταν δυνατή η ανάγνωση όλων των πηγών. Ό,τι ελέγχθηκε φαίνεται παρακάτω — δοκιμάστε ξανά σε λίγο.',
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
    genuine: 'Γνήσιο — το ψηφοδέλτιο έχει καταμετρηθεί',
    genuineAt: 'Καταχωρήθηκε:',
    notFound: 'Δεν βρέθηκε',
    notFoundBody: 'Αυτό το αποτύπωμα δεν υπάρχει στην κάλπη της συγκεκριμένης πρότασης. Είτε το πιστοποιητικό δεν είναι γνήσιο, είτε αναφέρεται σε άλλη πρόταση.',
    error: 'Ο έλεγχος απέτυχε — δοκιμάστε ξανά.',
    what1: 'Τι αποδεικνύει: ότι το συγκεκριμένο σφραγισμένο ψηφοδέλτιο βρίσκεται στην κάλπη και μετρήθηκε.',
    what2: 'Τι δεν αποκαλύπτει: ποιος το έριξε και τι ψήφισε — έτσι κανείς δεν μπορεί να σας πιέσει να το αποδείξετε.',
    checkBox: 'Ελέγξτε ολόκληρη την κάλπη αυτής της πρότασης',
    howTitle: 'Πώς προστατεύεται η κάλπη',
    how1: 'Κάθε ψηφοδέλτιο σφραγίζεται πάνω στο προηγούμενο. Αν αλλάξει ή αφαιρεθεί έστω ένα, η σφραγίδα όλων των επόμενων σπάει.',
    how2: 'Το αποτύπωμα της κάλπης δημοσιεύεται κάθε 10 λεπτά σε δημόσιο αποθετήριο στο GitHub, ορατό σε όλους.',
    how3: 'Κάθε αποτύπωμα καταχωρείται και στο Bitcoin μέσω OpenTimestamps. Έτσι η ώρα και το περιεχόμενο κλειδώνουν σε ένα δίκτυο που κανείς δεν ελέγχει — ούτε εμείς.',
  },
  en: {
    title: 'Verification',
    subtitle: 'Audit a proposal’s ballot box or check a single ballot — no account needed.',
    modeBox: 'Ballot box',
    modeBallot: 'Ballot',
    proposal: 'Proposal number',
    hash: 'Ballot fingerprint (SHA-256)',
    hashHint: 'As printed on the receipt or certificate — spaces and line breaks are ignored.',
    check: 'Verify',
    running: 'Checking…',
    stepServer: 'Recomputing the chain on the server',
    stepGithub: 'Reading the published fingerprints from GitHub',
    stepInclusion: 'Comparing published fingerprints with the ballot box',
    stepBitcoin: 'Checking Bitcoin timestamps',
    okTitle: 'The ballot box is intact',
    okBody: 'The chain verifies, every published fingerprint is present in the box, and the Bitcoin timestamps match.',
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
    genuine: 'Genuine — this ballot is counted',
    genuineAt: 'Cast at:',
    notFound: 'Not found',
    notFoundBody: 'This fingerprint does not exist in this proposal’s ballot box. Either the certificate is not genuine, or it refers to a different proposal.',
    error: 'Verification failed — try again.',
    what1: 'What it proves: that this exact sealed ballot is in the ballot box and was counted.',
    what2: 'What it does not reveal: who cast it or what it chose — so nobody can pressure you to prove it.',
    checkBox: 'Audit this proposal’s whole ballot box',
    howTitle: 'How the ballot box is protected',
    how1: 'Every ballot is sealed onto the previous one. Change or remove a single one and the seal on every later ballot breaks.',
    how2: 'The fingerprint of the ballot box is published every 10 minutes to a public GitHub repository, visible to everyone.',
    how3: 'Every fingerprint is also recorded in Bitcoin through OpenTimestamps, locking its time and content into a network nobody controls — not even us.',
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
  const { locale } = useTranslation();
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

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow pt-16 pb-16">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-serif font-bold mb-2">{s.title}</h1>
            <p className="text-muted-foreground text-sm">{s.subtitle}</p>
          </div>

          <div className="flex justify-center gap-2 mb-4" role="tablist">
            <Button variant={mode === 'box' ? 'default' : 'outline'} size="sm" onClick={() => setMode('box')} data-testid="verify-mode-box">{s.modeBox}</Button>
            <Button variant={mode === 'ballot' ? 'default' : 'outline'} size="sm" onClick={() => setMode('ballot')} data-testid="verify-mode-ballot">{s.modeBallot}</Button>
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
                return (
                  <div className="space-y-4" data-testid="verify-audit-result">
                    <div className={`rounded-md border p-4 flex gap-3 items-start ${tone}`}>
                      <Icon className="w-6 h-6 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">{v === 'ok' ? s.okTitle : v === 'problem' ? s.problemTitle : s.incompleteTitle}</p>
                        <p className="text-sm opacity-80 mt-1">{v === 'ok' ? s.okBody : v === 'problem' ? s.problemBody : s.incompleteBody}</p>
                      </div>
                    </div>

                    <section className="rounded-md border p-4 space-y-2">
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

                    <section className="rounded-md border p-4 space-y-2">
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

                    <section className="rounded-md border p-4 space-y-2">
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
                );
              })()}

              {/* ── Single-ballot result ── */}
              {mode === 'ballot' && state === 'genuine' && (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 flex gap-3 items-start" data-testid="verify-genuine">
                  <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-800">{s.genuine}</p>
                    {castAt && <p className="text-sm text-emerald-800/80 mt-1">{s.genuineAt} {fmt(castAt)}</p>}
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

          {mode === 'ballot' && (
            <div className="mt-6 space-y-2 text-xs text-muted-foreground">
              <p>{s.what1}</p>
              <p>{s.what2}</p>
            </div>
          )}

          <div className="mt-6 rounded-md border p-4 text-sm" data-testid="verify-how">
            <p className="font-semibold">{s.howTitle}</p>
            <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground list-decimal pl-4">
              <li>{s.how1}</li>
              <li>{s.how2}</li>
              <li>{s.how3}</li>
            </ol>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
