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

type Choice = 'yes' | 'no' | 'abstain';

interface Props {
  choice: Choice;
  rowHash: string;
  castAt: string;
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

export function BallotReceipt({ choice, rowHash, castAt }: Props) {
  const { t, locale } = useTranslation();
  const choiceColor =
    choice === 'yes' ? 'var(--yper)' : choice === 'no' ? 'var(--kata)' : 'var(--apochi)';
  const choiceLabel =
    choice === 'yes' ? t('proposal.support') : choice === 'no' ? t('proposal.oppose') : t('proposal.abstain');
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

        {/* Choice + timestamp */}
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--sp-2) var(--sp-4)', fontSize: '.875rem' }}>
          <dt style={{ color: 'var(--ink-faint)', fontSize: '.75rem', letterSpacing: '.1em', textTransform: 'uppercase', paddingTop: 3 }}>
            {t('vote.anonConfirmChoice') || 'Επιλογή'}
          </dt>
          <dd style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: choiceColor }}>
            {choiceLabel}
          </dd>
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
      </div>
      <GreekKeyRule />
    </article>
  );
}
