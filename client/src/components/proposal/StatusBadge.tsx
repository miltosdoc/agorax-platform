/**
 * The one way a proposal's stage is rendered across every list, feed and
 * detail card.
 *
 * Members see three stages, not the nine lifecycle states behind them: it
 * is being co-drafted, it is being voted on, or it is over (see
 * proposalStageOf). A draft is the author's alone and says so. The finer
 * state still shows where it matters — the stepper on the proposal page.
 */
import { useTranslation } from '@/hooks/use-translation';
import { proposalStageOf, type ProposalStage } from '@shared/proposal-kinds';

/** One restrained token treatment per stage. */
const STAGE_STYLE: Record<ProposalStage, { dot: string; chip: string }> = {
  // Not yet public — quiet.
  draft:      { dot: 'bg-line-strong', chip: 'text-ink-faint border-line bg-surface' },
  // Being shaped by the members — neutral in-progress.
  codrafting: { dot: 'bg-bronze',      chip: 'text-ink-soft border-line bg-sunken' },
  // Live vote — the one active-blue stage.
  voting:     { dot: 'bg-kyanos',      chip: 'text-kyanos border-kyanos/30 bg-kyanos-wash' },
  // Over, whatever the outcome; the outcome itself is on the proposal page.
  completed:  { dot: 'bg-ink-faint',   chip: 'text-ink-soft border-line bg-surface' },
};

export default function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const { t } = useTranslation();
  const stage = proposalStageOf(status);
  const s = STAGE_STYLE[stage];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium ${s.chip} ${className}`}
      data-testid="status-badge"
      data-stage={stage}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {t(`stage.${stage}`)}
    </span>
  );
}
