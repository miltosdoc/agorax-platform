import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { CheckCircle2, Copy, Loader2, ShieldAlert } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest, ApiError } from '@/lib/queryClient';
import type { ContentNoticeEmailStatus as EmailStatus, ContentNoticeStatus as NoticeStatus, ContentNoticeReceipt as Receipt, ContentNoticePublicStatus as TrackedNotice } from '@shared/content-notices';

const panelClass = 'rounded-2xl border border-line bg-surface p-5 sm:p-6';

function noticeError(error: unknown, en: boolean): string {
  if (en) return error instanceof Error ? error.message : 'The request failed. Please retry.';
  const known: Record<string, string> = {
    'Use a URL belonging to this platform': 'Δώστε σύνδεσμο της Αγοράς ή τοπική διαδρομή, π.χ. /proposals/12.',
    'Notice not found or tracking key invalid': 'Δεν βρέθηκε η αναφορά ή το ιδιωτικό κλειδί δεν είναι σωστό.',
    'A review can be requested after a decision': 'Η επανεξέταση μπορεί να ζητηθεί μετά την έκδοση απόφασης.',
    'Provide a valid reference and tracking key': 'Ελέγξτε τον αριθμό αναφοράς και το ιδιωτικό κλειδί.',
    'Provide a valid reference, tracking key and explanation': 'Ελέγξτε τον αριθμό, το ιδιωτικό κλειδί και την εξήγηση (τουλάχιστον 20 χαρακτήρες).',
    'Check the notice fields': 'Ελέγξτε τα πεδία της αναφοράς: σύνδεσμο, στοιχεία επικοινωνίας, σχετικό αριθμό και εξήγηση τουλάχιστον 20 χαρακτήρων.',
  };
  if (error instanceof Error && known[error.message]) return known[error.message];
  if (error instanceof ApiError && error.status === 429) return 'Πολλά αιτήματα. Δοκιμάστε ξανά αργότερα.';
  if (error instanceof ApiError && error.status === 403) return 'Η αίτηση δεν έγινε δεκτή. Ανανεώστε τη σελίδα και δοκιμάστε ξανά.';
  return 'Το αίτημα δεν ολοκληρώθηκε. Δοκιμάστε ξανά.';
}

export default function ReportContentPage() {
  const { locale } = useTranslation();
  const en = locale === 'en';
  const tx = (el: string, english: string) => en ? english : el;
  const [contentUrl, setContentUrl] = useState(() => (new URLSearchParams(window.location.search).get('url') ?? new URLSearchParams(window.location.search).get('contentUrl'))?.slice(0, 2048) ?? '');
  const [category, setCategory] = useState<'illegal_content' | 'child_safety'>('illegal_content');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [explanation, setExplanation] = useState('');
  const [relatedReference, setRelatedReference] = useState(() => new URLSearchParams(window.location.search).get('relatedReference')?.slice(0, 36) ?? '');
  const [goodFaith, setGoodFaith] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [reference, setReference] = useState('');
  const [trackingToken, setTrackingToken] = useState('');
  const [tracked, setTracked] = useState<TrackedNotice | null>(null);
  const [tracking, setTracking] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [reviewExplanation, setReviewExplanation] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const receiptHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (receipt) receiptHeading.current?.focus();
  }, [receipt]);

  // The fragment never travels in an HTTP request. Consume it into memory
  // and remove it from the address bar; no tracking secret is persisted here.
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const ref = fragment.get('reference');
    const token = fragment.get('token');
    if (!ref || !token) return;
    setReference(ref.slice(0, 100));
    setTrackingToken(token.slice(0, 200));
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    let active = true;
    setTracking(true);
    apiRequest('POST', '/api/content-notices/status', { reference: ref.slice(0, 100), trackingToken: token.slice(0, 200) })
      .then(response => response.json())
      .then(data => { if (active) setTracked(data); })
      .catch(error => { if (active) setTrackingError(noticeError(error, en)); })
      .finally(() => { if (active) setTracking(false); });
    return () => { active = false; };
  }, []);

  const statusLabel = (status: NoticeStatus) => ({
    received: tx('Παραλήφθηκε', 'Received'),
    under_review: tx('Σε εξέταση', 'Under review'),
    decided: tx('Εκδόθηκε απόφαση', 'Decision issued'),
  })[status];
  const outcomeLabel = (outcome: NonNullable<TrackedNotice['decision']>['outcome']) => ({
    no_action: tx('Χωρίς μέτρο', 'No action'),
    action_taken: tx('Καταγράφηκε ολοκληρωμένο μέτρο', 'Completed measure recorded'),
    more_information: tx('Χρειάζονται πρόσθετες πληροφορίες', 'More information needed'),
  })[outcome];
  const emailLabel = (status: EmailStatus) => status === 'sent'
    ? tx('Η ενημέρωση email υποβλήθηκε για αποστολή. Η παράδοσή της δεν είναι εγγυημένη.', 'The email update was submitted for sending. Delivery is not guaranteed.')
    : status === 'failed'
      ? tx('Η αποστολή email απέτυχε. Χρησιμοποιήστε την ιδιωτική παρακολούθηση για ενημερώσεις.', 'The email could not be sent. Use private tracking for updates.')
      : tx('Δεν διατίθεται ενημέρωση μέσω email για αυτή την αναφορά. Χρησιμοποιήστε την ιδιωτική παρακολούθηση.', 'Email updates are unavailable for this notice. Use private tracking.');
  const formatDate = (value: string) => new Date(value).toLocaleString(en ? 'en-GB' : 'el-GR');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await apiRequest('POST', '/api/content-notices', {
        contentUrl: contentUrl.trim(), name: name.trim(), email: email.trim(),
        explanation: explanation.trim(), goodFaith, locale, category,
        ...(relatedReference.trim() ? { relatedReference: relatedReference.trim() } : {}),
      });
      const data: Receipt = await response.json();
      setReceipt(data);
      setReference(data.reference);
      setTrackingToken(data.trackingToken);
      setTracked(null);
      setName('');
      setEmail('');
      setExplanation('');
      setGoodFaith(false);
    } catch (error) {
      setSubmitError(noticeError(error, en));
    } finally {
      setSubmitting(false);
    }
  }

  async function lookup(event?: FormEvent) {
    event?.preventDefault();
    if (tracking) return;
    setTracking(true);
    setTrackingError('');
    setTracked(null);
    try {
      const response = await apiRequest('POST', '/api/content-notices/status', {
        reference: reference.trim(), trackingToken: trackingToken.trim(),
      });
      setTracked(await response.json());
    } catch (error) {
      setTrackingError(noticeError(error, en));
    } finally {
      setTracking(false);
    }
  }

  async function requestReview(event: FormEvent) {
    event.preventDefault();
    if (reviewing || !tracked) return;
    setReviewing(true);
    setReviewError('');
    setReviewMessage('');
    try {
      await apiRequest('POST', '/api/content-notices/review', {
        reference: tracked.reference, trackingToken: trackingToken.trim(), explanation: reviewExplanation.trim(),
      });
      setReviewExplanation('');
      setReviewMessage(tx('Το αίτημα επανεξέτασης καταγράφηκε.', 'Your review request was recorded.'));
      await lookup();
    } catch (error) {
      setReviewError(noticeError(error, en));
    } finally {
      setReviewing(false);
    }
  }

  const privateUrl = receipt ? `${window.location.origin}/report-content#${new URLSearchParams({ reference: receipt.reference, token: receipt.trackingToken })}` : '';
  async function copyPrivateUrl() {
    try {
      await navigator.clipboard.writeText(privateUrl);
      setCopyMessage(tx('Ο ιδιωτικός σύνδεσμος αντιγράφηκε.', 'The private link was copied.'));
    } catch {
      setCopyMessage(tx('Η αντιγραφή δεν είναι διαθέσιμη. Επιλέξτε και αντιγράψτε τον σύνδεσμο από το παρακάτω πεδίο.', 'Copy is unavailable. Select and copy the link from the field below.'));
    }
  }

  return (
    <AppShell requireConsent={false} title={tx('Αναφορά περιεχομένου', 'Report content')}>
      <div className="mx-auto max-w-3xl space-y-7">
        <div className="space-y-3 text-base leading-relaxed text-ink-soft">
          <p>{tx('Αν θεωρείτε ότι περιεχόμενο στην Αγορά είναι παράνομο, υποβάλετε αναφορά χωρίς να χρειάζεται λογαριασμός. Δώστε την ακριβή τοποθεσία και εξηγήστε τους λόγους σας.', 'If you believe content on Agora is illegal, submit a notice without an account. Provide its exact location and explain your reasons.')}</p>
          <p>{tx('Η διαχείριση εξετάζει την αναφορά. Η υποβολή δεν αποκρύπτει αυτόματα περιεχόμενο και δεν αποτελεί ψηφοφορία της κοινότητας.', 'Administrators review the notice. Submission does not automatically hide content and is not a community vote.')}</p>
          <p className="text-sm">{tx('Μην επισυνάπτετε ή αναπαράγετε υλικό σεξουαλικής κακοποίησης παιδιών. Δώστε μόνο την τοποθεσία και την αναγκαία περιγραφή.', 'Do not attach or reproduce child sexual abuse material. Provide only its location and the necessary description.')}</p>
        </div>

        {receipt ? (
          <section className={panelClass} aria-labelledby="notice-receipt-title" data-testid="notice-receipt">
            <h2 ref={receiptHeading} tabIndex={-1} id="notice-receipt-title" className="flex items-center gap-2 text-xl font-semibold text-ink focus:outline-none"><CheckCircle2 className="h-5 w-5 shrink-0 text-yper" aria-hidden="true" />{tx('Η αναφορά παραλήφθηκε', 'Notice received')}</h2>
            <div className="mt-5 space-y-4">
              <div className="space-y-1.5"><Label htmlFor="receipt-reference">{tx('Αριθμός αναφοράς', 'Reference')}</Label><Input id="receipt-reference" readOnly value={receipt.reference} className="font-mono" onFocus={(event) => event.target.select()} /></div>
              <div className="space-y-1.5"><Label htmlFor="receipt-token">{tx('Ιδιωτικό κλειδί παρακολούθησης', 'Private tracking key')}</Label><Input id="receipt-token" readOnly value={receipt.trackingToken} className="font-mono" autoComplete="off" onFocus={(event) => event.target.select()} /></div>
              <p className="text-sm leading-relaxed text-ink-soft">{tx('Αποθηκεύστε τον αριθμό και το κλειδί σε ασφαλές μέρος πριν φύγετε. Το κλειδί εμφανίζεται τώρα και δεν αποθηκεύεται σε αυτό το πρόγραμμα περιήγησης. Όποιος έχει τον ιδιωτικό σύνδεσμο μπορεί να δει την εξέλιξη και να ζητήσει επανεξέταση. Μην τον κοινοποιείτε δημόσια.', 'Save the reference and key in a safe place before leaving. The key is shown now and is not stored in this browser. Anyone with the private link can view updates and request review. Do not share it publicly.')}</p>
              <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={copyPrivateUrl}><Copy className="mr-2 h-4 w-4" aria-hidden="true" />{tx('Αντιγραφή ιδιωτικού συνδέσμου', 'Copy private tracking link')}</Button>
              <div className="space-y-1.5"><Label htmlFor="receipt-url">{tx('Ιδιωτικός σύνδεσμος', 'Private link')}</Label><Input id="receipt-url" readOnly value={privateUrl} autoComplete="off" onFocus={(event) => event.target.select()} /></div>
              {copyMessage && <p className="text-sm text-ink-soft" role="status">{copyMessage}</p>}
              <p className="rounded-xl bg-sunken p-3 text-sm leading-relaxed text-ink-soft" role="status">{emailLabel(receipt.emailStatus)}</p>
              <Button type="button" variant="ghost" className="min-h-11" onClick={() => { setReceipt(null); setCopyMessage(''); }}>{tx('Νέα αναφορά', 'New notice')}</Button>
            </div>
          </section>
        ) : (
          <section className={panelClass} aria-labelledby="notice-form-title">
            <h2 id="notice-form-title" className="flex items-center gap-2 text-xl font-semibold text-ink"><ShieldAlert className="h-5 w-5 shrink-0 text-kyanos" aria-hidden="true" />{tx('Υποβολή αναφοράς', 'Submit a notice')}</h2>
            <form onSubmit={submit} className="mt-5 space-y-5">
              <div className="space-y-1.5"><Label htmlFor="notice-url">{tx('Ακριβής σύνδεσμος ή τοποθεσία περιεχομένου', 'Exact content link or location')}</Label><Input id="notice-url" required maxLength={2048} value={contentUrl} onChange={(event) => setContentUrl(event.target.value)} placeholder="https://… /proposals/…" aria-describedby="notice-url-help" /><p id="notice-url-help" className="text-sm text-ink-faint">{tx('Για σχόλιο ή τροπολογία, προσθέστε το αναγνωριστικό ή την ακριβή θέση στην εξήγηση.', 'For a comment or amendment, include its ID or exact position in your explanation.')}</p></div>
              <div className="space-y-1.5"><Label htmlFor="notice-category">{tx('Είδος αναφοράς', 'Notice category')}</Label><select id="notice-category" className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kyanos" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="illegal_content">{tx('Πιθανώς παράνομο περιεχόμενο', 'Potentially illegal content')}</option><option value="child_safety">{tx('Σεξουαλική κακοποίηση ή εκμετάλλευση παιδιών', 'Child sexual abuse or exploitation')}</option></select></div>
              {category === 'child_safety' && <p className="rounded-xl bg-sunken p-3 text-sm leading-relaxed text-ink-soft">{tx('Για αυτή την ειδική κατηγορία μπορείτε να παραλείψετε όνομα και email. Χωρίς email, η ενημέρωση γίνεται μόνο με το ιδιωτικό κλειδί.', 'For this specific category, you may omit your name and email. Without email, updates are available only with the private key.')}</p>}
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="notice-name">{tx('Ονοματεπώνυμο', 'Full name')}{category === 'child_safety' ? tx(' (προαιρετικό)', ' (optional)') : ''}</Label><Input id="notice-name" required={category !== 'child_safety'} maxLength={200} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="notice-email">{tx('Email επικοινωνίας', 'Contact email')}{category === 'child_safety' ? tx(' (προαιρετικό)', ' (optional)') : ''}</Label><Input id="notice-email" type="email" required={category !== 'child_safety'} maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="notice-explanation">{relatedReference.trim() ? tx('Γιατί ζητάτε επανεξέταση της απόφασης;', 'Why do you request review of the decision?') : tx('Γιατί θεωρείτε το περιεχόμενο παράνομο;', 'Why do you believe the content is illegal?')}</Label><Textarea id="notice-explanation" required minLength={20} maxLength={12000} rows={6} value={explanation} onChange={(event) => setExplanation(event.target.value)} aria-describedby="notice-explanation-help" /><p id="notice-explanation-help" className="text-sm text-ink-faint">{tx('Περιγράψτε τα πραγματικά περιστατικά και, αν γνωρίζετε, τη σχετική νομική βάση. Συμπεριλάβετε μόνο τα απαραίτητα προσωπικά δεδομένα.', 'Describe the facts and, if known, the relevant legal basis. Include only necessary personal data.')}</p></div>
              <div className="space-y-1.5"><Label htmlFor="notice-related">{tx('Σχετικός αριθμός αναφοράς (προαιρετικό)', 'Related notice reference (optional)')}</Label><Input id="notice-related" maxLength={36} value={relatedReference} onChange={(event) => setRelatedReference(event.target.value)} aria-describedby="notice-related-help" /><p id="notice-related-help" className="text-sm leading-relaxed text-ink-faint">{tx('Αν επηρεάζεστε από προηγούμενη απόφαση, μπορείτε να ζητήσετε επανεξέταση με νέα, ξεχωριστή αναφορά και τα δικά σας στοιχεία. Δεν χρειάζεστε το ιδιωτικό κλειδί του αρχικού αναφέροντος και δεν αποκτάτε πρόσβαση στην αναφορά του. Εξηγήστε ποια απόφαση αμφισβητείτε.', 'If a previous decision affects you, request review through a new, separate notice with your own details. You do not need the original reporter’s private key and will not gain access to their notice. Explain which decision you contest.')}</p></div>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line p-3" htmlFor="notice-good-faith"><input id="notice-good-faith" type="checkbox" required checked={goodFaith} onChange={(event) => setGoodFaith(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-kyanos" /><span className="text-sm leading-relaxed text-ink">{tx('Δηλώνω καλόπιστα ότι οι πληροφορίες και οι ισχυρισμοί της αναφοράς είναι ακριβείς και πλήρεις σύμφωνα με όσα γνωρίζω.', 'I confirm in good faith that the information and allegations in this notice are accurate and complete to the best of my knowledge.')}</span></label>
              <p className="text-sm text-ink-faint">{tx('Τα στοιχεία χρησιμοποιούνται για την εξέταση και την επικοινωνία σχετικά με την αναφορά.', 'Your details are used to review and communicate about the notice.')} <Link href="/privacy" className="text-kyanos underline underline-offset-2">{tx('Ενημέρωση προστασίας δεδομένων', 'Privacy notice')}</Link></p>
              {submitError && <p className="text-sm text-kata" role="alert">{submitError}</p>}
              <Button type="submit" disabled={submitting || !goodFaith} className="min-h-11 w-full sm:w-auto">{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}{tx('Υποβολή αναφοράς', 'Submit notice')}</Button>
            </form>
          </section>
        )}

        <section className={panelClass} aria-labelledby="notice-tracking-title">
          <h2 id="notice-tracking-title" className="text-xl font-semibold text-ink">{tx('Ιδιωτική παρακολούθηση αναφοράς', 'Private notice tracking')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{tx('Χρησιμοποιήστε τον αριθμό και το ιδιωτικό κλειδί της απόδειξης για να δείτε την εξέλιξη. Δεν απαιτείται σύνδεση.', 'Use the reference and private key from your receipt to view updates. No sign-in is required.')}</p>
          <form onSubmit={lookup} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="tracking-reference">{tx('Αριθμός αναφοράς', 'Reference')}</Label><Input id="tracking-reference" disabled={tracking || reviewing} required maxLength={36} value={reference} onChange={(event) => { setReference(event.target.value); setTracked(null); setReviewMessage(''); }} /></div><div className="space-y-1.5"><Label htmlFor="tracking-key">{tx('Ιδιωτικό κλειδί', 'Private key')}</Label><Input id="tracking-key" disabled={tracking || reviewing} type="password" autoComplete="off" required minLength={43} maxLength={43} value={trackingToken} onChange={(event) => { setTrackingToken(event.target.value); setTracked(null); setReviewMessage(''); }} /></div></div>
            {trackingError && <p className="text-sm text-kata" role="alert">{trackingError}</p>}
            <Button type="submit" variant="outline" disabled={tracking || reviewing} className="min-h-11 w-full sm:w-auto">{tracking && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}{tx('Προβολή εξέλιξης', 'View updates')}</Button>
          </form>
          {tracked && (
            <div className="mt-6 space-y-4 border-t border-line pt-5" aria-live="polite">
              <h3 className="break-all font-semibold text-ink">{tracked.reference} · {statusLabel(tracked.status)}</h3>
              <p className="text-sm text-ink-faint">{tx('Παραλήφθηκε', 'Received')}: {formatDate(tracked.createdAt)} · {tx('Ενημερώθηκε', 'Updated')}: {formatDate(tracked.updatedAt)}</p>
              <p className="text-sm leading-relaxed text-ink-soft">{emailLabel(tracked.emailStatus)}</p>
              {tracked.decision && <div className="space-y-3 rounded-xl bg-sunken p-4"><h4 className="font-semibold text-ink">{outcomeLabel(tracked.decision.outcome)}</h4><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft"><strong>{tx('Αιτιολογία', 'Reason')}: </strong>{tracked.decision.reason}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft"><strong>{tx('Νομική βάση ή κανόνας', 'Legal basis or rule')}: </strong>{tracked.decision.basis}</p>{tracked.decision.measure && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft"><strong>{tx('Μέτρο που πραγματοποιήθηκε', 'Measure performed')}: </strong>{tracked.decision.measure}</p>}<p className="text-xs text-ink-faint">{formatDate(tracked.decision.decidedAt)}</p></div>}
              {tracked.status === 'decided' && <form onSubmit={requestReview} className="space-y-3"><div className="space-y-1.5"><Label htmlFor="notice-review">{tx('Αίτημα επανεξέτασης ή πρόσθετες πληροφορίες', 'Review request or additional information')}</Label><Textarea id="notice-review" required minLength={20} maxLength={12000} value={reviewExplanation} onChange={(event) => setReviewExplanation(event.target.value)} /></div><Button type="submit" variant="outline" disabled={reviewing} className="min-h-11 w-full sm:w-auto">{reviewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}{tx('Αποστολή για επανεξέταση', 'Submit for review')}</Button></form>}
            </div>
          )}
          {reviewMessage && <p className="mt-4 text-sm text-yper" role="status">{reviewMessage}</p>}
          {reviewError && <p className="mt-4 text-sm text-kata" role="alert">{reviewError}</p>}
        </section>
      </div>
    </AppShell>
  );
}
