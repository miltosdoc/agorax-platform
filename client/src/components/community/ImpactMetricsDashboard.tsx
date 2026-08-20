/**
 * Impact Metrics Dashboard — Civic Tech Best Practice
 * 
 * Shows impact metrics: proposals implemented, participation rates,
 * budget allocated from citizen decisions. Demonstrates that
 * participation matters — platforms that only show votes without
 * outcomes feel like participation theater.
 * 
 * Inspired by CitizenLab and Decidim patterns.
 */

import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';

interface ImpactMetrics {
  totalProposals: number;
  proposalsImplemented: number;
  totalParticipants: number;
  totalVotes: number;
  activeProposals: number;
  proposalsInVoting: number;
  proposalsInDeliberation: number;
  averageParticipationRate: number; // percentage
  budgetAllocated?: number; // in euros
}

interface ImpactMetricsDashboardProps {
  metrics: ImpactMetrics;
  onViewAll?: () => void;
  className?: string;
}

/** A single statistic: display-serif numeral over a quiet uppercase label. */
function Metric({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 first:pl-0">
      <div className="font-serif text-3xl leading-none text-ink tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-ink-faint font-semibold">{label}</div>
      {subtitle && <div className="text-xs text-ink-soft">{subtitle}</div>}
    </div>
  );
}

export function ImpactMetricsDashboard({
  metrics,
  onViewAll,
  className,
}: ImpactMetricsDashboardProps) {
  const { t } = useTranslation();

  const implementationRate =
    metrics.totalProposals > 0
      ? Math.round((metrics.proposalsImplemented / metrics.totalProposals) * 100)
      : 0;

  return (
    <section className={cn('border border-line bg-surface rounded', className)} data-testid="impact-metrics">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-ink-faint m-0">
          {t('dashboard.impactMetrics') || 'Impact Metrics'}
        </h3>
        {onViewAll && (
          <Button variant="ghost" size="sm" className="gap-1 text-xs h-auto py-1 text-kyanos" onClick={onViewAll}>
            {t('general.viewAll') || 'View All'}
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Statistics — serif numerals, hairline-divided, no colour */}
      <div className="grid grid-cols-2 md:grid-cols-4 md:divide-x divide-line px-4 py-2">
        <Metric
          label={t('metrics.totalProposals') || 'Total Proposals'}
          value={metrics.totalProposals}
          subtitle={`${metrics.activeProposals} ${t('metrics.inVoting') ? '' : ''}active`.trim()}
        />
        <Metric
          label={t('metrics.implemented') || 'Implemented'}
          value={metrics.proposalsImplemented}
          subtitle={`${implementationRate}% implementation rate`}
        />
        <Metric
          label={t('metrics.participants') || 'Participants'}
          value={metrics.totalParticipants.toLocaleString()}
          subtitle={`${metrics.averageParticipationRate}% avg participation`}
        />
        <Metric
          label={t('metrics.totalVotes') || 'Total Votes'}
          value={metrics.totalVotes.toLocaleString()}
          subtitle={`${metrics.proposalsInVoting} in voting`}
        />
      </div>

      {/* Pipeline — a quiet inline record */}
      <div className="border-t border-line px-4 py-3 flex items-center gap-x-6 gap-y-2 flex-wrap">
        <span className="text-xs uppercase tracking-wider font-semibold text-ink-faint">
          {t('metrics.proposalPipeline') || 'Proposal Pipeline'}
        </span>
        <span className="text-sm text-ink-soft tabular-nums">
          {metrics.proposalsInDeliberation} {t('metrics.inDeliberation') || 'in deliberation'}
        </span>
        <span className="text-sm text-ink-soft tabular-nums">
          {metrics.proposalsInVoting} {t('metrics.inVoting') || 'in voting'}
        </span>
        <span className="text-sm text-ink-soft tabular-nums">
          {metrics.proposalsImplemented} {t('metrics.implemented') || 'implemented'}
        </span>
      </div>

      {metrics.budgetAllocated && metrics.budgetAllocated > 0 && (
        <div className="border-t border-line px-4 py-3 text-sm text-ink-soft">
          <span className="font-serif text-lg text-ink">€{metrics.budgetAllocated.toLocaleString()}</span>{' '}
          {t('metrics.budgetAllocated') || 'allocated from citizen decisions'}
        </div>
      )}
    </section>
  );
}

export default ImpactMetricsDashboard;
