import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest, ApiError } from '@/lib/queryClient';
import type { ContentNoticeAdmin, ContentNoticeAdminList, ContentNoticeOutcome, ContentNoticeStatus } from '@shared/content-notices';

function safeContentHref(value: string): string | undefined {
  try {
    const url = new URL(value, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function adminNoticeError(error: unknown, en: boolean): string {
  if (en) return error instanceof Error ? error.message : 'The action failed. Please retry.';
  const known: Record<string, string> = {
    'Reopen the notice before recording a new decision': 'Ανοίξτε ξανά την εξέταση πριν καταγράψετε νέα απόφαση.',
    'Affected member does not exist': 'Δεν βρέθηκε μέλος με αυτό το αναγνωριστικό.',
    'No failed or unavailable email to retry': 'Δεν υπάρχει διαθέσιμη προσπάθεια email για επανάληψη. Πρόσφατες εκκρεμείς προσπάθειες μπορούν να επαναληφθούν μετά από πέντε λεπτά.',
    'Provide a reason, legal or terms basis, and a completed measure where applicable': 'Συμπληρώστε αιτιολογία τουλάχιστον 20 χαρακτήρων, συγκεκριμένη βάση και το μέτρο που πραγματοποιήθηκε όπου απαιτείται.',
    'Notice not found': 'Η αναφορά δεν βρέθηκε. Ανανεώστε τη λίστα.',
    'Admin access required': 'Απαιτείται πρόσβαση διαχειριστή πλατφόρμας.',
  };
  if (error instanceof Error && known[error.message]) return known[error.message];
  if (error instanceof ApiError && error.status === 429) return 'Πολλά αιτήματα. Δοκιμάστε ξανά αργότερα.';
  if (error instanceof ApiError && error.status === 403) return 'Η ενέργεια δεν έγινε δεκτή. Ελέγξτε τη σύνδεσή σας και ανανεώστε τη σελίδα.';
  return 'Η ενέργεια δεν ολοκληρώθηκε. Δοκιμάστε ξανά.';
}

function NoticeCard({ notice, onChanged }: { notice: ContentNoticeAdmin; onChanged: () => Promise<unknown> }) {
  const { locale } = useTranslation();
  const en = locale === 'en';
  const tx = (el: string, english: string) => en ? english : el;
  const [outcome, setOutcome] = useState<ContentNoticeOutcome>(notice.decision?.outcome ?? 'no_action');
  const [reason, setReason] = useState('');
  const [basis, setBasis] = useState('');
  const [measure, setMeasure] = useState('');
  const [affectedUserId, setAffectedUserId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [performed, setPerformed] = useState(false);
  const href = safeContentHref(notice.contentUrl);
  const date = (value: string) => new Date(value).toLocaleString(en ? 'en-GB' : 'el-GR');
  const statusLabel = {
    received: tx('Παραλήφθηκε', 'Received'),
    under_review: tx('Σε εξέταση', 'Under review'),
    decided: tx('Εκδόθηκε απόφαση', 'Decision issued'),
  }[notice.status];
  const outcomeLabel = (value: ContentNoticeOutcome) => ({
    no_action: tx('Χωρίς μέτρο', 'No action'),
    action_taken: tx('Ολοκληρωμένο μέτρο', 'Completed measure'),
    more_information: tx('Χρειάζονται πρόσθετες πληροφορίες', 'More information needed'),
  })[value];
  const emailLabel = notice.emailStatus === 'sent'
    ? tx('Υποβλήθηκε για αποστολή email', 'Email submitted for sending')
    : notice.emailStatus === 'failed' ? tx('Αποτυχία email', 'Email failed') : tx('Email μη διαθέσιμο', 'Email unavailable');
  const latestEmails = new Map<string, ContentNoticeAdmin['emailAttempts'][number]>();
  for (const attempt of notice.emailAttempts) latestEmails.set(attempt.kind, attempt);
  const canRetryEmail = [...latestEmails.values()].some(attempt => attempt.status === 'failed' || attempt.status === 'unavailable' || (attempt.status === 'pending' && Date.now() - new Date(attempt.createdAt).getTime() >= 5 * 60_000));
  const emailKindLabel = (kind: ContentNoticeAdmin['emailAttempts'][number]['kind']) => ({
    acknowledgement: tx('Επιβεβαίωση παραλαβής', 'Acknowledgement'),
    decision: tx('Απόφαση προς αναφέροντα', 'Reporter decision'),
    affected_user: tx('Ενημέρωση επηρεαζόμενου συντάκτη', 'Affected author update'),
  })[kind];
  const emailStatusLabel = (status: ContentNoticeAdmin['emailAttempts'][number]['status']) => ({
    pending: tx('Εκκρεμεί', 'Pending'),
    sent: tx('Υποβλήθηκε για αποστολή', 'Submitted for sending'),
    unavailable: tx('Μη διαθέσιμο', 'Unavailable'),
    failed: tx('Απέτυχε', 'Failed'),
  })[status];

  async function update(body: Record<string, unknown>, success: string, endpoint = `/api/admin/content-notices/${encodeURIComponent(notice.reference)}`, method = 'PATCH') {
    if (pending) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(method, endpoint, body);
      setMessage(success);
      await onChanged();
    } catch (err) {
      setError(adminNoticeError(err, en));
    } finally {
      setPending(false);
    }
  }

  async function decide(event: FormEvent) {
    event.preventDefault();
    if (outcome === 'action_taken' && (!measure.trim() || !performed)) return;
    if (affectedUserId.trim() && (!/^\d+$/.test(affectedUserId.trim()) || Number(affectedUserId) < 1)) {
      setError(tx('Το αναγνωριστικό χρήστη πρέπει να είναι θετικός ακέραιος.', 'The user ID must be a positive integer.'));
      return;
    }
    await update({
      status: 'decided', outcome, reason: reason.trim(), basis: basis.trim(),
      ...(measure.trim() ? { measure: measure.trim() } : {}),
      ...(affectedUserId.trim() ? { affectedUserId: Number(affectedUserId) } : {}),
    }, tx('Η απόφαση καταγράφηκε.', 'The decision was recorded.'));
  }

  return (
    <article className="min-w-0 rounded-2xl border border-line bg-surface p-5 sm:p-6" data-testid="admin-content-notice">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="break-all font-mono text-lg font-semibold text-ink">{notice.reference}</h2><p className="mt-1 text-xs text-ink-faint">{date(notice.createdAt)} · {tx('Ενημέρωση', 'Updated')}: {date(notice.updatedAt)}</p></div>
        <Badge variant={notice.status === 'decided' ? 'secondary' : 'outline'}>{statusLabel}</Badge>
      </div>
      <div className="mt-4 space-y-3">
        {href ? <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex min-h-11 max-w-full items-center gap-2 break-all text-sm text-kyanos underline underline-offset-2"><span className="min-w-0 break-all">{notice.contentUrl}</span><ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="sr-only">{tx('Ανοίγει σε νέα καρτέλα', 'Opens in a new tab')}</span></a> : <p className="break-all text-sm text-ink-soft">{notice.contentUrl}</p>}
        <p className="text-sm text-ink-soft">{notice.category === 'child_safety' ? tx('Σεξουαλική κακοποίηση ή εκμετάλλευση παιδιών', 'Child sexual abuse or exploitation') : tx('Πιθανώς παράνομο περιεχόμενο', 'Potentially illegal content')}</p>
        <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-ink">{notice.explanation}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-ink-faint">{tx('Αναφέρων', 'Reporter')}</dt><dd className="break-words text-ink">{notice.name || tx('Δεν δηλώθηκε', 'Not supplied')}</dd></div><div><dt className="text-ink-faint">Email</dt><dd className="break-all text-ink">{notice.email || tx('Δεν δηλώθηκε', 'Not supplied')}</dd></div><div><dt className="text-ink-faint">{tx('Γλώσσα επικοινωνίας', 'Communication language')}</dt><dd className="text-ink">{notice.locale === 'en' ? 'English' : 'Ελληνικά'}</dd></div>{notice.relatedReference && <div><dt className="text-ink-faint">{tx('Σχετική αναφορά', 'Related notice')}</dt><dd className="break-all font-mono text-ink">{notice.relatedReference}</dd></div>}</dl>
        <p className="text-xs text-ink-faint">{tx('Η καλή πίστη δηλώθηκε κατά την υποβολή.', 'Good faith was confirmed on submission.')}</p>
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-sunken p-3"><p className={`text-sm ${notice.emailStatus === 'failed' ? 'text-kata' : 'text-ink-soft'}`}>{emailLabel}</p>{canRetryEmail && <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={pending} onClick={() => update({}, tx('Καταγράφηκε νέα προσπάθεια αποστολής. Δείτε το αποτέλεσμα στο ιστορικό email.', 'A new email attempt was recorded. Check its result in the email history.'), `/api/admin/content-notices/${encodeURIComponent(notice.reference)}/retry-email`, 'POST')}>{tx('Επανάληψη email', 'Retry email')}</Button>}</div>
        {[...latestEmails.values()].map(attempt => <p key={attempt.kind} className={`text-sm ${attempt.status === 'failed' ? 'text-kata' : 'text-ink-faint'}`}>{emailKindLabel(attempt.kind)}: {emailStatusLabel(attempt.status)}</p>)}
      </div>

      {notice.decision && <div className="mt-5 space-y-3 rounded-xl border border-line p-4"><h3 className="font-semibold text-ink">{tx('Τρέχουσα απόφαση', 'Current decision')}: {outcomeLabel(notice.decision.outcome)}</h3><p className="whitespace-pre-wrap break-words text-sm text-ink-soft"><strong>{tx('Αιτιολογία', 'Reason')}: </strong>{notice.decision.reason}</p><p className="whitespace-pre-wrap break-words text-sm text-ink-soft"><strong>{tx('Βάση', 'Basis')}: </strong>{notice.decision.basis}</p>{notice.decision.measure && <p className="whitespace-pre-wrap break-words text-sm text-ink-soft"><strong>{tx('Μέτρο που πραγματοποιήθηκε', 'Measure performed')}: </strong>{notice.decision.measure}</p>}<p className="text-xs text-ink-faint">{date(notice.decision.decidedAt)}</p></div>}

      <details className="group mt-5 border-t border-line pt-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink">{tx('Εξέταση και απόφαση', 'Review and decision')}</summary>
        <div className="space-y-4 pt-3">
          <p className="rounded-xl bg-sunken p-4 text-sm leading-relaxed text-ink-soft">{tx('Αυτή η σελίδα καταγράφει την εξέταση και την απόφαση. Δεν αποκρύπτει ή αφαιρεί περιεχόμενο. Πραγματοποιήστε κάθε αναγκαίο μέτρο από τα διαθέσιμα εργαλεία διαχείρισης ή μέσω του υπεύθυνου λειτουργίας και μετά καταγράψτε ακριβώς τι ολοκληρώθηκε. Η ψηφοφορία της κοινότητας δεν υποκαθιστά την εξέταση παράνομου περιεχομένου.', 'This page records the review and decision. It does not hide or remove content. Perform any necessary measure using available moderation tools or through the operator, then record exactly what was completed. Community voting does not replace review of illegal content.')}</p>
          {notice.status !== 'under_review' && <Button type="button" variant="outline" disabled={pending} className="min-h-11 w-full sm:w-auto" onClick={() => update({ status: 'under_review' }, tx('Η αναφορά τέθηκε σε εξέταση.', 'The notice is under review.'))}>{notice.status === 'decided' ? tx('Επανέναρξη εξέτασης', 'Reopen review') : tx('Έναρξη εξέτασης', 'Start review')}</Button>}
          <form onSubmit={decide} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor={`outcome-${notice.reference}`}>{tx('Έκβαση', 'Outcome')}</Label><select id={`outcome-${notice.reference}`} value={outcome} onChange={(event) => { setOutcome(event.target.value as ContentNoticeOutcome); setPerformed(false); }} className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kyanos"><option value="no_action">{outcomeLabel('no_action')}</option><option value="action_taken">{outcomeLabel('action_taken')}</option><option value="more_information">{outcomeLabel('more_information')}</option></select></div>
            <div className="space-y-1.5"><Label htmlFor={`reason-${notice.reference}`}>{tx('Αιτιολογία προς τον αναφέροντα', 'Reason for the reporter')}</Label><Textarea id={`reason-${notice.reference}`} required minLength={20} maxLength={8000} value={reason} onChange={(event) => setReason(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor={`basis-${notice.reference}`}>{tx('Συγκεκριμένη νομική βάση ή όρος χρήσης', 'Specific legal basis or term of service')}</Label><Textarea id={`basis-${notice.reference}`} required minLength={3} maxLength={4000} value={basis} onChange={(event) => setBasis(event.target.value)} rows={3} /></div>
            <div className="space-y-1.5"><Label htmlFor={`measure-${notice.reference}`}>{outcome === 'action_taken' ? tx('Μέτρο που ήδη πραγματοποιήθηκε (υποχρεωτικό)', 'Measure already performed (required)') : tx('Πληροφορίες μέτρου (προαιρετικό)', 'Measure information (optional)')}</Label><Textarea id={`measure-${notice.reference}`} required={outcome === 'action_taken'} minLength={outcome === 'action_taken' ? 10 : undefined} maxLength={4000} value={measure} onChange={(event) => setMeasure(event.target.value)} rows={3} aria-describedby={`measure-help-${notice.reference}`} /><p id={`measure-help-${notice.reference}`} className="text-sm text-ink-faint">{tx('Περιγράψτε την ακριβή ενέργεια, το περιεχόμενο που επηρεάστηκε, το εύρος και τη διάρκειά της. Μια προγραμματισμένη ενέργεια δεν είναι ολοκληρωμένο μέτρο.', 'Describe the exact action, affected content, scope and duration. A planned action is not a completed measure.')}</p></div>
            {outcome === 'action_taken' && <label htmlFor={`performed-${notice.reference}`} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line p-3"><input id={`performed-${notice.reference}`} type="checkbox" required checked={performed} onChange={(event) => setPerformed(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-kyanos" /><span className="text-sm leading-relaxed text-ink">{tx('Επιβεβαιώνω ότι το παραπάνω μέτρο έχει ήδη πραγματοποιηθεί.', 'I confirm the measure described above has already been performed.')}</span></label>}
            <div className="space-y-1.5"><Label htmlFor={`affected-${notice.reference}`}>{tx('Αναγνωριστικό επηρεαζόμενου χρήστη (προαιρετικό)', 'Affected user ID (optional)')}</Label><Input id={`affected-${notice.reference}`} inputMode="numeric" pattern="[0-9]+" maxLength={12} value={affectedUserId} onChange={(event) => setAffectedUserId(event.target.value)} aria-describedby={`affected-help-${notice.reference}`} /><p id={`affected-help-${notice.reference}`} className="text-sm text-ink-faint">{tx('Συμπληρώστε το εξακριβωμένο αναγνωριστικό του επηρεαζόμενου συντάκτη για να επιχειρηθεί αποστολή της αιτιολογίας και της δυνατότητας επανεξέτασης. Ελέγξτε το αποτέλεσμα στο ιστορικό email. Μην συμπεριλάβετε στοιχεία ταυτοποίησης του αναφέροντος στην αιτιολογία.', 'Enter the verified ID of the affected author so the system can attempt to send the reasons and review route. Check the result in the email history. Do not include reporter identity details in the reason.')}</p></div>
            {notice.status === 'decided' && <p className="text-sm text-ink-faint">{tx('Ανοίξτε ξανά την εξέταση πριν καταγράψετε νέα απόφαση.', 'Reopen the review before recording a new decision.')}</p>}
            <Button type="submit" disabled={pending || notice.status === 'decided' || (outcome === 'action_taken' && !performed)} className="min-h-11 w-full sm:w-auto">{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}{tx('Καταγραφή απόφασης', 'Record decision')}</Button>
          </form>
        </div>
      </details>
      {(notice.history.length > 0 || notice.emailAttempts.length > 0) && <details className="mt-3 border-t border-line pt-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink">{tx('Ιστορικό και προσπάθειες email', 'History and email attempts')}</summary><div className="space-y-4 pt-3"><ol className="space-y-3">{notice.history.map(entry => <li key={entry.id} className="rounded-xl bg-sunken p-3 text-sm"><p className="break-words font-medium text-ink">{entry.event} · {date(entry.createdAt)}</p>{entry.actorUserId != null && <p className="text-xs text-ink-faint">{tx('Χρήστης', 'User')} #{entry.actorUserId}</p>}<pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink-soft">{JSON.stringify(entry.details, null, 2)}</pre></li>)}</ol><ul className="space-y-2">{notice.emailAttempts.map(attempt => <li key={attempt.id} className={`rounded-xl border border-line p-3 text-sm ${attempt.status === 'failed' ? 'text-kata' : 'text-ink-soft'}`}><span className="break-words">{attempt.kind} · {attempt.status}</span> · {date(attempt.createdAt)}{attempt.finishedAt && <> · {date(attempt.finishedAt)}</>}</li>)}</ul></div></details>}
      {message && <p className="mt-4 text-sm text-yper" role="status">{message}</p>}
      {error && <p className="mt-4 break-words text-sm text-kata" role="alert">{error}</p>}
    </article>
  );
}

export default function AdminContentNoticesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { locale } = useTranslation();
  const en = locale === 'en';
  const tx = (el: string, english: string) => en ? english : el;
  const [filter, setFilter] = useState<ContentNoticeStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const pageSize = 25;
  const { data, isLoading, error, refetch, isFetching } = useQuery<ContentNoticeAdminList>({
    queryKey: ['/api/admin/content-notices', { offset, limit: pageSize }],
    enabled: !!user?.isAdmin,
    queryFn: async () => (await apiRequest('GET', `/api/admin/content-notices?offset=${offset}&limit=${pageSize}`)).json(),
    staleTime: 0,
  });

  if (authLoading) return <AppShell title={tx('Αναφορές περιεχομένου', 'Content notices')}><p role="status">{tx('Φόρτωση…', 'Loading…')}</p></AppShell>;
  if (!user?.isAdmin) return <AppShell title={tx('Αναφορές περιεχομένου', 'Content notices')}><p role="alert" className="text-ink-soft">{tx('Η σελίδα είναι διαθέσιμη μόνο σε διαχειριστές της πλατφόρμας.', 'This page is available only to platform administrators.')}</p></AppShell>;

  const notices = (data?.notices ?? []).filter(notice => (filter === 'all' || notice.status === filter) && (!search.trim() || `${notice.reference} ${notice.contentUrl}`.toLowerCase().includes(search.trim().toLowerCase())));
  return (
    <AppShell title={tx('Αναφορές περιεχομένου', 'Content notices')} actions={<Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching} className="min-h-11"><RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />{tx('Ανανέωση', 'Refresh')}</Button>}>
      <div className="mx-auto max-w-4xl space-y-6">
        <p className="text-base leading-relaxed text-ink-soft">{tx('Εξετάστε τις αναφορές χωρίς να εξαρτάτε τη νομιμότητα από ψηφοφορία μελών. Καταγράψτε συγκεκριμένη αιτιολογία και ενημερώστε τα εμπλεκόμενα πρόσωπα. Τα προσωπικά στοιχεία και το ιστορικό αυτής της σελίδας είναι μόνο για τη διαχείριση.', 'Review notices without making legality depend on member voting. Record a specific reason and inform affected parties. Personal details and history on this page are for administrators only.')}</p>
        {data && <p className="text-sm text-ink-faint">{tx('Σύνολο', 'Total')}: {data.total} · {tx('Σε εκκρεμότητα', 'Pending')}: {data.pending}</p>}
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="notice-admin-filter">{tx('Κατάσταση σε αυτή τη σελίδα', 'Status on this page')}</Label><select id="notice-admin-filter" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kyanos"><option value="all">{tx('Όλες', 'All')}</option><option value="received">{tx('Παραλήφθηκαν', 'Received')}</option><option value="under_review">{tx('Σε εξέταση', 'Under review')}</option><option value="decided">{tx('Με απόφαση', 'Decided')}</option></select></div><div className="space-y-1.5"><Label htmlFor="notice-admin-search">{tx('Αναζήτηση αριθμού ή συνδέσμου σε αυτή τη σελίδα', 'Search reference or link on this page')}</Label><Input id="notice-admin-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
        {isLoading && <p role="status" className="text-ink-soft">{tx('Φόρτωση αναφορών…', 'Loading notices…')}</p>}
        {error && <p role="alert" className="text-sm text-kata">{adminNoticeError(error, en)}</p>}
        {!isLoading && !error && notices.length === 0 && <p className="rounded-2xl border border-dashed border-line p-6 text-ink-soft">{tx('Δεν υπάρχουν αναφορές με αυτά τα φίλτρα.', 'No notices match these filters.')}</p>}
        {notices.map(notice => <NoticeCard key={notice.reference} notice={notice} onChanged={refetch} />)}
        <nav className="flex flex-wrap items-center justify-between gap-3" aria-label={tx('Σελίδες αναφορών', 'Notice pages')}><Button type="button" variant="outline" className="min-h-11" disabled={isFetching || offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>{tx('Προηγούμενη σελίδα', 'Previous page')}</Button><span className="text-sm text-ink-faint">{tx('Σελίδα', 'Page')} {Math.floor(offset / pageSize) + 1}</span><Button type="button" variant="outline" className="min-h-11" disabled={isFetching || !data || offset + pageSize >= data.total} onClick={() => setOffset(offset + pageSize)}>{tx('Επόμενη σελίδα', 'Next page')}</Button></nav>
      </div>
    </AppShell>
  );
}
