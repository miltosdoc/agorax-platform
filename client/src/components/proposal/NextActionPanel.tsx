/**
 * NextActionPanel — shows the next step for a proposal based on its lifecycle state.
 * Uses the STATUS_MAP from proposal-status.ts to determine action text and buttons.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, AlertCircle, CheckCircle2, Clock, Zap, Loader2 } from 'lucide-react';
import { getStatusForProposal, STATUS_MAP } from '@/lib/proposal-status';
import { useTranslation } from '@/hooks/use-translation';
import type { ProposalState } from '@shared/proposal-lifecycle';

interface NextActionPanelProps {
  status: string;
  proposalId: number;
  userIsAuthor?: boolean;
}

const ACTION_ICONS: Record<string, typeof ArrowRight> = {
  draft: Zap,
  review: Clock,
  author_review: AlertCircle,
  community_signal: ArrowRight,
  sortition_synthesis: Clock,
  voting: ArrowRight,
  decided: CheckCircle2,
  archived: AlertCircle,
};

export default function NextActionPanel({ status, proposalId, userIsAuthor }: NextActionPanelProps) {
  const { t } = useTranslation();
  const entry = getStatusForProposal({ status });
  const Icon = ACTION_ICONS[status] || ArrowRight;
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmitDraft() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/submit`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `HTTP ${res.status}`);
      }
      window.location.reload();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  // Map status to workspace i18n key
  const actionKey = `workspace.action.${status}`;

  return (
    <Card className="border-l-4 border-l-primary/30">
      <CardContent className="py-4 px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t('workspace.nextAction')}</p>
              <p className="text-base font-medium">{t(actionKey) || entry.nextAction}</p>
            </div>
          </div>
          {status === 'draft' && userIsAuthor && (
            <div className="flex flex-col items-end gap-1">
              <Button size="sm" onClick={handleSubmitDraft} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('workspace.action.draftButton')}
                  </>
                ) : (
                  t('workspace.action.draftButton')
                )}
              </Button>
              {submitError && <p className="text-xs text-red-600">{submitError}</p>}
            </div>
          )}
          {status === 'author_review' && userIsAuthor && (
            <Button size="sm" asChild>
              <a href={`/proposals/${proposalId}/amendments/review`}>
                {t('workspace.action.authorReviewButton')}
              </a>
            </Button>
          )}
          {status === 'community_signal' && (
            <Button size="sm" asChild>
              <a href={`/proposals/${proposalId}/amendments/signals`}>
                {t('workspace.action.communitySignalButton')}
              </a>
            </Button>
          )}
          {status === 'sortition_synthesis' && (
            <Button size="sm" variant="outline" asChild>
              <a href={`/proposals/${proposalId}`}>
                {t('workspace.action.sortitionSynthesisButton')}
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
