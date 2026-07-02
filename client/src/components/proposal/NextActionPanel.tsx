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
import { apiRequest } from '@/lib/queryClient';
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
      await apiRequest('POST', `/api/proposals/${proposalId}/submit`);
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
      <CardContent className="py-4 px-4">
        {/* Sidebar-friendly vertical layout: label, text, then a full-width
            action button — nothing competes for horizontal space. */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('workspace.nextAction')}</p>
          </div>
          <p className="text-sm leading-relaxed">{t(actionKey) || entry.nextAction}</p>
          {status === 'draft' && userIsAuthor && (
            <div className="flex flex-col gap-1">
              <Button size="sm" className="w-full" onClick={handleSubmitDraft} disabled={submitting}>
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
            <Button size="sm" className="w-full" asChild>
              <a href={`/proposals/${proposalId}/amendments/review`}>
                {t('workspace.action.authorReviewButton')}
              </a>
            </Button>
          )}
          {status === 'community_signal' && (
            <Button size="sm" className="w-full" asChild>
              <a href={`/proposals/${proposalId}/amendments/signals`}>
                {t('workspace.action.communitySignalButton')}
              </a>
            </Button>
          )}
          {status === 'sortition_synthesis' && (
            <Button size="sm" variant="outline" className="w-full" asChild>
              <a href={`/proposals/${proposalId}/sortition`}>
                {t('workspace.action.sortitionSynthesisButton')}
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
