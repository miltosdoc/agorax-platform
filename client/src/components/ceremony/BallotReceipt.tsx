/**
 * CEREMONY I — the ballot receipt.
 *
 * Casting a vote is an event. The confirmation is rendered as an official
 * document: paper ground, serif crest, bronze meander thresholds, and the
 * cryptographic fingerprint set like an engraved certificate number.
 * Content is the voter's real, locally-stored receipt — the server cannot
 * produce this; only this device holds it.
 */
import { useTranslation } from '@/hooks/use-translation';
import { GreekKeyRule } from './GreekKeyRule';

interface Props {
  rowHash: string;
  castAt: string;
  /** Enables the downloadable inclusion certificate. */
  proposalId?: number;
}

function formatHash(hash: string): string[] {
  const clean = hash.replace(/[^a-f0-9]/gi, '');
  const groups = clean.match(/.{1,8}/g) ?? [clean];
  const lines: string[] = [];
  for (let i = 0; i < groups.length; i += 4) {
    lines.push(groups.slice(i, i + 4).join(' '));
  }
  return lines;
}

export function BallotReceipt({ rowHash, castAt, proposalId }: Props) {
  // Neither the receipt nor the exported certificate shows the choice: a
  // screenshot or file proving "how I voted" would make votes coercible and
  // sellable. They prove INCLUSION only.
  function downloadCertificate() {
    if (!proposalId) return;
    const base = window.location.origin;
    const body = [
      'AgoraX — Πιστοποιητικό Καταχώρησης Ψήφου / Ballot Inclusion Certificate',
      '='.repeat(72),
      '',
      `Πρόταση / Proposal: ${base}/proposals/${proposalId}`,
      `Καταχώρηση / Cast at: ${new Date(castAt).toLocaleString()}`,
      '',
      'Αποτύπωμα αλυσίδας / Chain fingerprint (SHA-256):',
      rowHash,
      '',
      'Επαλήθευση / Verify inclusion:',
      `${base}/verify?proposal=${proposalId}&hash=${rowHash}`,
      '(για συστήματα / for machines:',
      ` ${base}/api/proposals/${proposalId}/receipt-inclusion?rowHash=${rowHash} )`,
      '',
      'Σκόπιμα ΔΕΝ αναγράφεται η επιλογή σας: μια φορητή απόδειξη του πώς',
      'ψηφίσατε θα έκανε την ψήφο αντικείμενο πίεσης ή εξαγοράς. Κανείς —',
      'ούτε ο διαχειριστής — δεν μπορεί να συνδέσει αυτό το αποτύπωμα με εσάς.',
      'Your choice is deliberately omitted: a portable proof of how you voted',
      'would make votes coercible. No one — not even an administrator — can',
      'link this fingerprint to you.',
    ].join('\n');
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agorax-ballot-${proposalId}-${rowHash.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const { t, locale } = useTranslation();
  const when = new Date(castAt);
  const stamp = when.toLocaleString(locale === 'en' ? 'en-GB' : 'el-GR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const hashLines = formatHash(rowHash);

  return (
    <article
      aria-label={t('vote.receiptStoredLocally') || 'Απόδειξη ψήφου'}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-strong)',
        boxShadow: '0 2px 10px rgba(20,33,46,.07)',
      }}
      data-testid="ballot-receipt"
    >
      <GreekKeyRule />
      <div style={{ padding: 'var(--sp-8)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
        {/* Crest */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <svg width="44" height="30" viewBox="0 0 44 30" fill="none" stroke="var(--bronze)" strokeWidth="1.4" aria-hidden="true">
            <path d="M6 28 C2 20 2 10 8 3 C9 11 8 19 12 26" />
            <path d="M38 28 C42 20 42 10 36 3 C35 11 36 19 32 26" />
            <circle cx="22" cy="17" r="3.2" />
          </svg>
          <span style={{ fontSize: 'var(--fs-cap, .75rem)', letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--bronze)' }}>
            AgoraX · {t('nav.home') === 'Home' ? 'Digital Democracy' : 'Ψηφιακή Δημοκρατία'}
          </span>
        </div>

        {/* Statement */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.56rem', margin: 0 }}>
            {t('vote.youVoted') || 'Η ψήφος σας καταχωρήθηκε'}
          </h3>
          <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '.875rem' }}>
            {t('vote.receiptStoredLocally') || 'Ανώνυμη · μη αναστρέψιμη · επαληθεύσιμη'}
          </p>
        </div>

        {/* Timestamp — the choice is deliberately not shown (see above). */}
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--sp-2) var(--sp-4)', fontSize: '.875rem' }}>
          <dt style={{ color: 'var(--ink-faint)', fontSize: '.75rem', letterSpacing: '.1em', textTransform: 'uppercase', paddingTop: 3 }}>
            {t('proposal.by') === 'by' ? 'Cast' : 'Καταχώρηση'}
          </dt>
          <dd style={{ margin: 0, fontFamily: 'var(--font-data)', fontSize: '.875rem' }}>{stamp}</dd>
        </dl>

        {/* Fingerprint */}
        <div>
          <span style={{ fontSize: '.75rem', letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--ink-faint)' }}>
            {t('vote.receiptHash') || 'Αποτύπωμα αλυσίδας · SHA-256'}
          </span>
          <div style={{
            marginTop: 'var(--sp-2)', fontFamily: 'var(--font-data)', fontSize: '.875rem',
            lineHeight: 1.9, letterSpacing: '.04em', wordBreak: 'break-all',
            background: 'var(--bronze-wash)', border: '1px solid var(--line)',
            padding: 'var(--sp-3) var(--sp-4)', color: 'var(--bronze-deep)',
          }}>
            {hashLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>

        <p style={{ margin: '0 auto', maxWidth: '42ch', textAlign: 'center', fontSize: '.75rem', color: 'var(--ink-faint)', lineHeight: 1.6 }}>
          {t('vote.receiptVerifyNote') ||
            'Το αποτύπωμα αποθηκεύεται μόνο σε αυτή τη συσκευή. Επαληθεύστε την καταμέτρησή του ανά πάσα στιγμή — κανείς δεν γνωρίζει ότι είναι δικό σας.'}
        </p>

        <p style={{ margin: '0 auto', maxWidth: '46ch', textAlign: 'center', fontSize: '.75rem', color: 'var(--ink-soft)', lineHeight: 1.6 }} data-testid="receipt-no-choice">
          {t('receipt.noChoice')}
        </p>

        {proposalId && (
          <a
            href={`/verify?proposal=${proposalId}&hash=${rowHash}`}
            style={{ margin: '0 auto', fontSize: '.8125rem', color: 'var(--bronze-deep)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
            data-testid="receipt-verify-link"
          >
            {t('receipt.verifyLink')}
          </a>
        )}

        {proposalId && (
          <button
            type="button"
            onClick={downloadCertificate}
            style={{
              margin: '0 auto', display: 'block', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: '.75rem', color: 'var(--ink-faint)',
              textDecoration: 'underline', textUnderlineOffset: '2px',
            }}
            data-testid="receipt-download"
          >
            {t('receipt.download') || 'Λήψη πιστοποιητικού καταχώρησης (χωρίς την επιλογή σας)'}
          </button>
        )}
      </div>
      <GreekKeyRule />
    </article>
  );
}
