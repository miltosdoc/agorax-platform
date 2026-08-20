/**
 * The one way a proposal status is rendered across every list, feed and
 * detail card. Institutional treatment: a status dot + label in a quiet
 * chip. No emoji; colour is tokenised and grouped by lifecycle meaning
 * rather than eight competing pastels.
 */
import { useTranslation, getStatusLabel } from '@/hooks/use-translation';

/** Map each lifecycle state to one restrained token treatment. */
const STATUS_STYLE: Record<string, { dot: string; chip: string }> = {
  // Not yet in the process — quiet.
  draft:               { dot: 'bg-line-strong', chip: 'text-ink-faint border-line bg-surface' },
  // Being processed / deliberated — neutral in-progress.
  review:              { dot: 'bg-kyanos',      chip: 'text-ink-soft border-line bg-sunken' },
  author_review:       { dot: 'bg-kyanos',      chip: 'text-ink-soft border-line bg-sunken' },
  community_signal:    { dot: 'bg-kyanos',      chip: 'text-ink-soft border-line bg-sunken' },
  sortition_synthesis: { dot: 'bg-bronze',      chip: 'text-ink-soft border-line bg-sunken' },
  // Live vote — the one active-blue state.
  voting:              { dot: 'bg-kyanos',      chip: 'text-kyanos border-kyanos/30 bg-kyanos-wash' },
  // Terminal outcomes.
  decided:             { dot: 'bg-yper',        chip: 'text-yper border-yper/30 bg-yper-wash' },
  archived:            { dot: 'bg-apochi',      chip: 'text-apochi border-apochi/40 bg-apochi-wash' },
};

const FALLBACK = { dot: 'bg-ink-faint', chip: 'text-ink-soft border-line bg-surface' };

export default function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const { t } = useTranslation();
  const s = STATUS_STYLE[status] ?? FALLBACK;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium ${s.chip} ${className}`}
      data-testid="status-badge"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {getStatusLabel(status, t)}
    </span>
  );
}
