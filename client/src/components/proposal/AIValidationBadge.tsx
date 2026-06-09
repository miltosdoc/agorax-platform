/**
 * AI Validation Badge — Transparent AI Assessment Display
 * 
 * Shows what the AI checked, confidence level, and expandable reasoning.
 * Follows civic tech best practice: AI involvement is a trust liability if opaque.
 * Making the AI's work visible — including its uncertainty — transforms it from
 * a black box into an auditable tool.
 * 
 * Dimensions checked:
 * 1. Structure — logical organization
 * 2. Specificity — concrete details vs vague claims
 * 3. Feasibility — practical implementability
 * 4. Completeness — addresses all aspects
 * 5. Clarity — understandable language
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Brain,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';

interface ValidationDimension {
  name: string;
  score: number; // 0-100
  label: string;
}

interface AIValidationBadgeProps {
  score: number; // Overall score 0-100
  feedback?: string;
  dimensions?: ValidationDimension[];
  onDisagree?: () => void;
  className?: string;
}

function dimensionLabel(key: string): string {
  const labels: Record<string, string> = {
    structure: 'Structure',
    specificity: 'Specificity',
    feasibility: 'Feasibility',
    completeness: 'Completeness',
    clarity: 'Clarity',
  };
  return labels[key] || key;
}

function scoreColor(score: number): string {
  if (score < 20) return 'text-red-700 bg-red-50 border-red-200';
  if (score > 90) return 'text-green-700 bg-green-50 border-green-200';
  return 'text-amber-700 bg-amber-50 border-amber-200';
}

function scoreIcon(score: number) {
  if (score < 20) return <XCircle className="w-5 h-5 text-red-600" />;
  if (score > 90) return <CheckCircle2 className="w-5 h-5 text-green-600" />;
  return <AlertTriangle className="w-5 h-5 text-amber-600" />;
}

function routingLabel(score: number): string {
  if (score < 20) return 'Return to Author';
  if (score > 90) return 'Auto-Approved';
  return 'Sortition Review';
}

export function AIValidationBadge({
  score,
  feedback,
  dimensions,
  onDisagree,
  className,
}: AIValidationBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();

  return (
    <Card className={cn('border-2', scoreColor(score), className)} data-testid="ai-validation-badge">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="w-6 h-6 text-muted-foreground" />
            <CardTitle className="text-base">
              {t('proposal.aiValidation') || 'AI Validation'}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn('text-lg font-bold px-3 py-1', scoreColor(score))}>
              {score}%
            </Badge>
            {scoreIcon(score)}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {t('proposal.routing') || 'Routing'}: {routingLabel(score)}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Dimension Scores */}
        {dimensions && dimensions.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              {t('proposal.validationDimensions') || 'Validation Dimensions'}
            </div>
            {dimensions.map((dim) => (
              <div key={dim.name} className="flex items-center gap-3">
                <span className="text-sm w-28 text-muted-foreground">
                  {dimensionLabel(dim.name)}
                </span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      dim.score < 20 ? 'bg-red-500' :
                      dim.score > 90 ? 'bg-green-500' : 'bg-amber-500'
                    )}
                    style={{ width: `${dim.score}%` }}
                  />
                </div>
                <span className="text-sm font-mono w-10 text-right">{dim.score}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Expandable Reasoning */}
        {feedback && (
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 h-auto p-0 text-sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              {t('proposal.viewReasoning') || 'View AI Reasoning'}
            </Button>
            {expanded && (
              <div className="mt-3 p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                {feedback}
              </div>
            )}
          </div>
        )}

        {/* Disagree Button */}
        {onDisagree && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-red-600 hover:bg-red-50"
              onClick={onDisagree}
            >
              <ThumbsDown className="w-4 h-4" />
              {t('proposal.disagreeWithAI') || 'Disagree with AI assessment?'}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('proposal.flagExplanation') || 'Flag AI errors to improve the system'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AIValidationBadge;
