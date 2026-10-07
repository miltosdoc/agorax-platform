import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { CommunityJoinAction } from '@/components/community/CommunityJoinAction';

export type ProposalActionTarget = 'debate' | 'amendments' | 'media' | 'vote' | 'options' | 'finalReview';
interface NextActionPanelProps {
  status: string;
  proposalId: number;
  userIsAuthor?: boolean;
  communityId?: number;
  canParticipate?: boolean;
  kind?: string;
  onNavigate?: (target: ProposalActionTarget) => void;
  onSubmitDraft?: () => void;
  submittingDraft?: boolean;
  draftSubmitError?: string | null;
}

/** The next useful step is visible before the proposal's process details. */
export default function NextActionPanel({ status, proposalId, userIsAuthor, communityId, canParticipate = true, kind, onNavigate, onSubmitDraft, submittingDraft, draftSubmitError }: NextActionPanelProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const closed = status === 'decided' || status === 'archived';
  const waiting = status === 'review' || status === 'sortition_synthesis';
  const collectsOptions = kind === 'poll' || kind === 'election';
  const icon = closed ? <CheckCircle2 className="h-5 w-5" /> : waiting ? <Clock3 className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />;
  const helperKey = collectsOptions && status === 'community_signal' ? 'proposal.nextHelp.options' : `proposal.nextHelp.${status}`;
  const helper = t(helperKey);
  async function submitDraft() {
    if (onSubmitDraft) { onSubmitDraft(); return; }
    setSubmitting(true); setSubmitError(null);
    try { await apiRequest('POST', `/api/proposals/${proposalId}/submit`); window.location.reload(); }
    catch (error) { setSubmitError(error instanceof Error ? error.message : String(error)); setSubmitting(false); }
  }
  function navigate(target: ProposalActionTarget) {
    if (onNavigate) onNavigate(target);
    else document.getElementById(target === 'vote' ? 'proposal-ballot' : 'proposal-participation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return <section className="mb-6 rounded-2xl border border-kyanos/25 bg-kyanos-wash p-5" data-testid="proposal-next-action">
    <h2 className="flex items-center gap-2 text-base font-semibold text-kyanos">{icon}{t('workspace.nextAction')}</h2>
    <p className="mt-2 text-base leading-relaxed text-ink">{helper === helperKey ? t(`workspace.action.${status}`) : helper}</p>
    {!canParticipate && !closed && communityId ? <div className="mt-4"><p className="mb-3 text-sm text-ink-soft">{t('proposal.joinToParticipate')}</p><CommunityJoinAction communityId={communityId} /></div> : <div className="mt-4 flex flex-wrap gap-2">
      {status === 'draft' && userIsAuthor && <Button className="min-h-11 rounded-xl" onClick={submitDraft} disabled={submitting || submittingDraft} data-testid="proposal-draft-submit">{(submitting || submittingDraft) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('workspace.action.draftButton')}</Button>}
      {(status === 'author_review' || (status === 'community_signal' && !collectsOptions)) && userIsAuthor && <Button className="min-h-11 rounded-xl" asChild><Link href={`/proposals/${proposalId}/amendments/review`}>{t('workspace.action.authorReviewButton')}</Link></Button>}
      {status === 'community_signal' && <Button className="min-h-11 rounded-xl" variant={userIsAuthor && !collectsOptions ? 'outline' : 'default'} onClick={() => navigate(collectsOptions ? 'options' : 'amendments')}>{t(collectsOptions ? 'proposal.viewOptions' : 'proposal.viewAmendments')}</Button>}
      {status === 'sortition_synthesis' && <Button className="min-h-11 rounded-xl" variant="outline" asChild><Link href={`/proposals/${proposalId}/sortition`}>{t('workspace.action.sortitionSynthesisButton')}</Link></Button>}
      {status === 'final_review' && <Button className="min-h-11 rounded-xl" onClick={() => navigate('finalReview')}>{t('proposal.reviewFinal')}</Button>}
      {(status === 'voting' || status === 'decided') && <Button className="min-h-11 rounded-xl" onClick={() => navigate('vote')}>{t(status === 'voting' ? 'proposal.goToVote' : 'proposal.goToResults')}</Button>}
    </div>}
    {(submitError || draftSubmitError) && <p className="mt-3 text-sm text-destructive" role="alert">{submitError || draftSubmitError}</p>}
  </section>;
}
