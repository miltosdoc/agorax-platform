/**
 * The one way a proposal status is rendered: STATUS_MAP color + icon +
 * localized label. Every list/detail/feed card uses this.
 */
import { Badge } from '@/components/ui/badge';
import { getStatusForProposal } from '@/lib/proposal-status';
import { useTranslation, getStatusLabel } from '@/hooks/use-translation';

export default function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const { t } = useTranslation();
  const entry = getStatusForProposal({ status });
  return (
    <Badge className={`${entry.color} whitespace-nowrap ${className}`} variant="outline">
      <span className="mr-1">{entry.icon}</span>
      {getStatusLabel(status, t)}
    </Badge>
  );
}
