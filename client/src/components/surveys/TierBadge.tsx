/**
 * The one way a poll tier is rendered: certified = primary shield,
 * community = amber «unofficial» outline. Hub, detail and feed all use this.
 */
import { Badge } from '@/components/ui/badge';
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

export default function TierBadge({ tier }: { tier: string }) {
  const { t } = useTranslation();
  return tier === 'certified' ? (
    <Badge className="bg-primary"><ShieldCheck className="w-3 h-3 mr-1" />{t('surveys.tier.certified')}</Badge>
  ) : (
    <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">
      {t('surveys.tier.community')}
    </Badge>
  );
}
