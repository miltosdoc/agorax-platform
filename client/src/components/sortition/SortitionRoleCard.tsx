/**
 * Sortition Role Card — Civic Tech Best Practice
 * 
 * Selected jurors receive a "Role Card" — a visual identity card showing
 * their selection criteria, assembly assignment, and responsibilities.
 * Looks like a credential, not a form. Legitimizes the sortition process.
 * 
 * Inspired by Sortition Foundation and Sortify patterns.
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  Users,
  MapPin,
  Calendar,
  CheckCircle2,
  GitBranch,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';

interface DemographicCriteria {
  label: string;
  value: string;
}

interface SortitionRoleCardProps {
  memberId: number;
  memberName: string;
  bodyId: number;
  bodyName: string;
  communityName: string;
  selectedAt: string;
  completesAt: string;
  verificationHash: string;
  demographicCriteria?: DemographicCriteria[];
  proposalTitle?: string;
  className?: string;
}

export function SortitionRoleCard({
  memberId,
  memberName,
  bodyId,
  bodyName,
  communityName,
  selectedAt,
  completesAt,
  verificationHash,
  demographicCriteria = [],
  proposalTitle,
  className,
}: SortitionRoleCardProps) {
  const { t } = useTranslation();

  return (
    <Card
      className={cn(
        'border-2 border-purple-300 bg-gradient-to-br from-purple-50/50 to-background overflow-hidden',
        className
      )}
      data-testid="sortition-role-card"
    >
      {/* Header with credential styling */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-white" />
            <span className="text-white font-bold text-lg">
              {t('sortition.roleCard') || 'Sortition Role Card'}
            </span>
          </div>
          <Badge variant="secondary" className="bg-white/20 text-white border-0">
            #{memberId}
          </Badge>
        </div>
      </div>

      <CardContent className="p-4 space-y-4">
        {/* Member identity */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-lg">
            {memberName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold">{memberName}</div>
            <div className="text-sm text-muted-foreground">
              {t('sortition.selectedJuror') || 'Selected Juror'}
            </div>
          </div>
        </div>

        {/* Assembly assignment */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{bodyName}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">{communityName}</span>
          </div>
          {proposalTitle && (
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm truncate">{proposalTitle}</span>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="grid grid-cols-2 gap-3 border-t pt-3">
          <div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {t('sortition.selected') || 'Selected'}
            </div>
            <div className="text-sm font-medium">
              {new Date(selectedAt).toLocaleDateString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {t('sortition.due') || 'Due'}
            </div>
            <div className="text-sm font-medium">
              {new Date(completesAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Demographic criteria */}
        {demographicCriteria.length > 0 && (
          <div className="border-t pt-3">
            <div className="text-xs text-muted-foreground mb-2">
              {t('sortition.selectionCriteria') || 'Selection Criteria'}
            </div>
            <div className="flex flex-wrap gap-1">
              {demographicCriteria.map((criterion) => (
                <Badge
                  key={criterion.label}
                  variant="outline"
                  className="text-xs bg-purple-50 text-purple-700 border-purple-200"
                >
                  {criterion.label}: {criterion.value}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Verification hash */}
        <div className="border-t pt-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <GitBranch className="w-3 h-3" />
            {t('sortition.verificationHash') || 'Verification Hash'}
          </div>
          <code className="text-xs bg-muted p-2 rounded block break-all font-mono">
            {verificationHash}
          </code>
        </div>

        {/* Responsibilities */}
        <div className="border-t pt-3">
          <div className="text-xs text-muted-foreground mb-2">
            {t('sortition.responsibilities') || 'Your Responsibilities'}
          </div>
          <ul className="space-y-1">
            <li className="text-sm flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>
                {t('sortition.responsibilityScore') ||
                  'Score the proposal on a 1-100 scale'}
              </span>
            </li>
            <li className="text-sm flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>
                {t('sortition.responsibilityDeliberate') ||
                  'Read the proposal and amendments carefully'}
              </span>
            </li>
            <li className="text-sm flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>
                {t('sortition.responsibilityDeadline') ||
                  'Submit your score before the deadline'}
              </span>
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default SortitionRoleCard;
