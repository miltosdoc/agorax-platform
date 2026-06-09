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

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Users,
  FileText,
  Vote,
  TrendingUp,
  Clock,
  ArrowRight,
} from 'lucide-react';
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

function MetricCard({
  icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  color: string;
}) {
  return (
    <div className={cn('flex items-start gap-3 p-3 rounded-lg border', color)}>
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
        )}
      </div>
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
    <Card className={cn('border-2 border-emerald-200', className)} data-testid="impact-metrics">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <CardTitle className="text-lg">
              {t('dashboard.impactMetrics') || 'Impact Metrics'}
            </CardTitle>
          </div>
          {onViewAll && (
            <Button variant="ghost" size="sm" className="gap-1 text-sm" onClick={onViewAll}>
              {t('general.viewAll') || 'View All'}
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Primary Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            icon={<FileText className="w-5 h-5 text-blue-600" />}
            label={t('metrics.totalProposals') || 'Total Proposals'}
            value={metrics.totalProposals}
            subtitle={`${metrics.activeProposals} active`}
            color="bg-blue-50/50 border-blue-200"
          />
          <MetricCard
            icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
            label={t('metrics.implemented') || 'Implemented'}
            value={metrics.proposalsImplemented}
            subtitle={`${implementationRate}% implementation rate`}
            color="bg-green-50/50 border-green-200"
          />
          <MetricCard
            icon={<Users className="w-5 h-5 text-purple-600" />}
            label={t('metrics.participants') || 'Participants'}
            value={metrics.totalParticipants.toLocaleString()}
            subtitle={`${metrics.averageParticipationRate}% avg participation`}
            color="bg-purple-50/50 border-purple-200"
          />
          <MetricCard
            icon={<Vote className="w-5 h-5 text-amber-600" />}
            label={t('metrics.totalVotes') || 'Total Votes'}
            value={metrics.totalVotes.toLocaleString()}
            subtitle={`${metrics.proposalsInVoting} in voting`}
            color="bg-amber-50/50 border-amber-200"
          />
        </div>

        {/* Pipeline Status */}
        <div className="border-t pt-3">
          <div className="text-sm font-medium text-muted-foreground mb-2">
            {t('metrics.proposalPipeline') || 'Proposal Pipeline'}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-sm">
                {metrics.proposalsInDeliberation}{' '}
                {t('metrics.inDeliberation') || 'in deliberation'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Vote className="w-4 h-4 text-emerald-500" />
              <span className="text-sm">
                {metrics.proposalsInVoting} {t('metrics.inVoting') || 'in voting'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm">
                {metrics.proposalsImplemented}{' '}
                {t('metrics.implemented') || 'implemented'}
              </span>
            </div>
          </div>
        </div>

        {/* Budget Allocated (if available) */}
        {metrics.budgetAllocated && metrics.budgetAllocated > 0 && (
          <div className="border-t pt-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-emerald-700 bg-emerald-50">
                €{metrics.budgetAllocated.toLocaleString()}{' '}
                {t('metrics.budgetAllocated') || 'allocated from citizen decisions'}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ImpactMetricsDashboard;
