/**
 * Proposal Detail Page — Full workspace with tabs:
 * Overview, Debate, Amendments, Sortition, Votes
 * 
 * Integrates: NextActionPanel, DebatePanel, AmendmentsPanel,
 * SortitionPanel, VotePanel
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useCommunityMembership } from '@/hooks/use-community-membership';
import { CommunityJoinAction } from '@/components/community/CommunityJoinAction';
import { type ProposalActionTarget } from '@/components/proposal/NextActionPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, MessageSquare, FileText, Trash2, Mic, Pencil, Loader2, ChevronDown, AlertTriangle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { PhaseCountdown } from '@/components/ui/PhaseCountdown';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import AppShell from '@/components/layout/AppShell';
import { CommunityContextRail } from '@/components/rails/context-rails';
import ShareButton from '@/components/ShareButton';
import LifecycleStepper from '@/components/ui/LifecycleStepper';
import NextActionPanel from '@/components/proposal/NextActionPanel';
import { DebatePanel } from '@/components/debate/DebatePanel';
import { AmendmentsPanel } from '@/components/proposal/AmendmentsPanel';
import { SortitionPanel } from '@/components/proposal/SortitionPanel';
import { MediaStudioPanel } from '@/components/proposal/MediaStudioPanel';
import { ProposalMediaPreview } from '@/components/proposal/ProposalMediaPreview';
import VotePanel, { type VoteResults } from '@/components/voting/VotePanel';
import StatusBadge from '@/components/proposal/StatusBadge';
import { useTranslation } from '@/hooks/use-translation';
import { AIValidationBadge } from '@/components/proposal/AIValidationBadge';
import { kindAllowsDeliberation, kindCollectsOptions, proposalKindOf } from '@shared/proposal-kinds';
import { articleSectionsFor } from '@shared/statute-articles';
import { OptionCollectionPanel } from '@/components/proposal/OptionCollectionPanel';

interface Proposal {
  id: number;
  question: string;
  solution: string;
  status: string;
  authorId: number;
  authorName?: string | null;
  authorUsername?: string | null;
  communityId: number;
  communityName?: string;
  createdAt: string;
  llmScore?: string | null;
  llmFeedback?: string | null;
  llmValidationRound?: number | null;
  finalText?: string | null;
  category?: string;
  /** 'anonymous' (default for new proposals) | 'pseudonymous' (transparent ratification) */
  votingMode?: string;
  /** 'deliberation' (amendments + final_review) | 'vote' (straight to ballot) */
  track?: string;
  /** 'decision' | 'statute' | 'election' | 'poll' — see shared/proposal-kinds.ts */
  kind?: string;
}

interface FinalReviewData {
  proposalId: number;
  status: string;
  finalText: string;
  ballotOptions: Array<{ id: string; label: string }> | null;
  alternatives: Array<{ id: number; optionId: string; text: string }>;
  authorAcceptedFinalAt?: string | null;
  authorRefineInstruction?: string | null;
}

export default function ProposalDetailPage() {
  const [location, setLocation] = useLocation();
  const proposalId = location.split('/').pop();
  const { t, locale } = useTranslation();
  const search = useSearch();
  const { user } = useAuth();
  const { toast } = useToast();

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const membership = useCommunityMembership(proposal?.communityId ?? 0);
  const [loadError, setLoadError] = useState<number | null>(null);
  const [participationTab, setParticipationTab] = useState(() => new URLSearchParams(window.location.search).get('tab') === 'media' ? 'media' : 'debate');
  useEffect(() => {
    const tab = new URLSearchParams(search).get('tab');
    if (tab === 'media' || tab === 'amendments' || tab === 'debate') setParticipationTab(tab);
    if (tab === 'media' && proposal) window.requestAnimationFrame(() => document.getElementById('proposal-participation')?.scrollIntoView({ block: 'start' }));
  }, [search, proposal?.id]);
  const [finalReview, setFinalReview] = useState<FinalReviewData | null>(null);
  const [finalReviewLoading, setFinalReviewLoading] = useState(false);
  const [acceptingFinal, setAcceptingFinal] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [revalidating, setRevalidating] = useState(false);
  const [revalidateError, setRevalidateError] = useState<string | null>(null);
  const [initialSolutionOpen, setInitialSolutionOpen] = useState<boolean | null>(null);
  const [pendingAmendments, setPendingAmendments] = useState(0);
  const [sortitionRevisions, setSortitionRevisions] = useState<
    Array<{ id: number; text: string; authorName: string }>
  >([]);

  useEffect(() => {
    if (!proposalId) return;
    let cancelled = false;
    setLoading(true);
    setProposal(null);
    setFinalReview(null);
    setBallotCount(null);
    setLoadError(null);
    api.get<Proposal>(`/api/proposals/${proposalId}`)
      .then((response) => { if (!cancelled) setProposal(response.data); })
      .catch((error) => { if (!cancelled) setLoadError(error instanceof ApiError ? error.status : 500); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [proposalId]);

  useEffect(() => {
    if (!proposalId) return;
    api
      .get<Array<{ id: number; text: string; authorName: string }>>(
        `/api/proposals/${proposalId}/sortition-amendments`,
      )
      .then((resp) => setSortitionRevisions(resp.data))
      .catch(() => setSortitionRevisions([]));
  }, [proposalId]);

  useEffect(() => {
    setInitialSolutionOpen(null);
  }, [proposalId, proposal?.status]);

  // An amendment the author never judges is dropped by the merge, so the
  // author needs to see the count without opening the tab.
  const userIsProposalAuthor = !!user && !!proposal && user.id === proposal.authorId;
  useEffect(() => {
    if (!proposalId || !userIsProposalAuthor || proposal?.status !== 'community_signal') {
      setPendingAmendments(0);
      return;
    }
    let cancelled = false;
    api.get<Array<{ parentAmendmentId?: number | null; authorDecision?: string | null }>>(
      `/api/proposals/${proposalId}/amendments`,
    )
      .then((resp) => {
        if (cancelled) return;
        setPendingAmendments(
          resp.data.filter((a) => a.parentAmendmentId == null && !a.authorDecision).length,
        );
      })
      .catch(() => { if (!cancelled) setPendingAmendments(0); });
    return () => { cancelled = true; };
  }, [proposalId, userIsProposalAuthor, proposal?.status]);

  // While LLM validation is in flight the proposal sits in 'review' for
  // ~10–15s. Poll every 3s so the page reflects the post-validation status
  // (author_review, voting, or draft) without the user needing to refresh.
  useEffect(() => {
    if (!proposalId || proposal?.status !== 'review') return;
    const interval = setInterval(() => {
      api.get<Proposal>(`/api/proposals/${proposalId}`)
        .then((resp) => setProposal(resp.data))
        .catch(() => { /* transient; next tick will retry */ });
    }, 3000);
    return () => clearInterval(interval);
  }, [proposalId, proposal?.status]);

  // final_review: fetch the AI-merged text and the ballot alternatives.
  // If the endpoint fails we fall back to proposal.finalText for display.
  useEffect(() => {
    if (!proposalId || !kindAllowsDeliberation(proposalKindOf(proposal?.kind))) return;
    if (proposal?.status !== 'final_review' && !(proposal?.status === 'community_signal' && proposal?.track !== 'vote')) return;
    let cancelled = false;
    setFinalReviewLoading(true);
    api.get<FinalReviewData>(`/api/proposals/${proposalId}/final-review`)
      .then((resp) => { if (!cancelled) setFinalReview(resp.data); })
      .catch(() => { if (!cancelled) setFinalReview(null); })
      .finally(() => { if (!cancelled) setFinalReviewLoading(false); });
    return () => { cancelled = true; };
  }, [proposalId, proposal?.status]);

  const handleAcceptFinalReview = async () => {
    if (!proposalId || acceptingFinal) return;
    setAcceptingFinal(true);
    try {
      await api.post(`/api/proposals/${proposalId}/final-review/accept`);
      if (proposal?.status === 'community_signal') {
        const fr = await api.get<FinalReviewData>(`/api/proposals/${proposalId}/final-review`);
        setFinalReview(fr.data);
        return;
      }
      const resp = await api.get<Proposal>(`/api/proposals/${proposalId}`);
      setProposal(resp.data);
    } catch (error) {
      toast({
        title: t('proposal.final_review_accept_failed') || 'Η έναρξη της ψηφοφορίας απέτυχε.',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      });
      // 409 = the proposal already left final_review elsewhere — resync.
      if (error instanceof ApiError && error.status === 409) {
        api.get<Proposal>(`/api/proposals/${proposalId}`)
          .then((resp) => setProposal(resp.data))
          .catch(() => { /* keep current view */ });
      }
    } finally {
      setAcceptingFinal(false);
    }
  };

  const handleRefineFinalReview = async () => {
    const instruction = refineInstruction.trim();
    if (!proposalId || refining || instruction.length < 3) return;
    setRefining(true);
    try {
      const resp = await api.post<{ finalText: string }>(
        `/api/proposals/${proposalId}/final-review/refine`,
        { instruction },
      );
      const newText = resp.data.finalText;
      setFinalReview((prev) => (prev ? { ...prev, finalText: newText } : prev));
      setProposal((prev) => (prev ? { ...prev, finalText: newText } : prev));
      setRefineInstruction('');
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 503
          ? (t('proposal.final_review_ai_unavailable') || 'Η βελτίωση μέσω AI δεν είναι διαθέσιμη.')
          : error instanceof ApiError
            ? error.message
            : (t('proposal.final_review_refine_failed') || 'Η βελτίωση απέτυχε.');
      toast({ title: message, variant: 'destructive' });
    } finally {
      setRefining(false);
    }
  };

  const handleFinalize = async () => {
    if (!proposalId || finalizing) return;
    setFinalizing(true);
    try {
      const resp = await api.post<{ proposal: Proposal }>(`/api/proposals/${proposalId}/finalize`);
      setProposal(resp.data.proposal);
    } catch (error) {
      setVoteError(error instanceof ApiError ? error.message : t('proposal.finalizeFailed'));
    } finally {
      setFinalizing(false);
    }
  };

  // Ballots cast so far: an open vote nobody has voted in can still be
  // deleted by its author (the server also counts anonymous ballots that are
  // signed but not yet cast).
  const [ballotCount, setBallotCount] = useState<number | null>(null);
  const handleVoteResults = useCallback((r: VoteResults) => setBallotCount(r.ballotCount ?? r.total), []);

  const handleProposalAdvanced = (newStatus: string) => {
    if (proposal) {
      setProposal({ ...proposal, status: newStatus });
    }
  };

  const [submittingDraft, setSubmittingDraft] = useState(false);
  const [draftSubmitError, setDraftSubmitError] = useState<string | null>(null);

  // Draft → review: the endpoint runs the LLM validation synchronously and
  // returns the proposal in its post-validation state.
  const handleSubmitDraft = async () => {
    if (!proposalId || submittingDraft) return;
    setSubmittingDraft(true);
    setDraftSubmitError(null);
    try {
      const resp = await api.post<Proposal>(`/api/proposals/${proposalId}/submit`);
      setProposal(resp.data);
    } catch (error) {
      setDraftSubmitError(error instanceof ApiError ? error.message : t('proposal.submitFailed'));
    } finally {
      setSubmittingDraft(false);
    }
  };

  const handleRevalidate = async () => {
    if (!proposalId || revalidating) return;
    setRevalidating(true);
    setRevalidateError(null);
    try {
      const resp = await api.post<{ proposal: Proposal }>(`/api/proposals/${proposalId}/revalidate`);
      setProposal(resp.data.proposal);
    } catch (error) {
      setRevalidateError(error instanceof ApiError ? error.message : t('proposal.revalidationFailed'));
    } finally {
      setRevalidating(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[40vh]">{t('general.loading')}</div>
      </AppShell>
    );
  }

  if (!proposal) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl rounded-2xl border border-line bg-surface p-6" role="alert"><h1 className="text-2xl font-semibold text-ink">{t(loadError === 403 ? 'proposal.membersOnlyTitle' : 'proposal.notFound')}</h1><p className="mt-3 text-base leading-relaxed text-ink-soft">{t(loadError === 403 ? 'proposal.membersOnlyHelp' : loadError === 404 ? 'proposal.notFoundHelp' : 'proposal.loadError')}</p><Link href="/communities" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-kyanos px-4 text-sm font-semibold text-white">{t('communities.discover')}</Link></div>
      </AppShell>
    );
  }

  const userIsAuthor = !!user && user.id === proposal.authorId;
  const canParticipate = !!user && (membership.status === 'member' || userIsAuthor);
  const navigateToAction = (target: ProposalActionTarget) => {
    if (target === 'debate' || target === 'amendments' || target === 'media') changeParticipationTab(target);
    const id = target === 'vote' ? 'proposal-ballot' : target === 'options' ? 'proposal-options' : target === 'finalReview' ? 'proposal-final-review' : 'proposal-participation';
    window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const changeParticipationTab = (tab: string) => {
    setParticipationTab(tab);
    const url = new URL(window.location.href); url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  };
  // Displayed merged text during final_review: the endpoint's copy wins,
  // proposal.finalText is the fallback if the fetch failed.
  const finalReviewText = finalReview?.finalText ?? proposal.finalText ?? '';
  const finalReviewAlternatives = finalReview?.alternatives ?? [];
  // Direct-vote proposals carry none of the deliberation apparatus: the
  // ballot IS the page. Vote front and center, no amendments tab, no
  // sortition/AI-validation widgets, no "final text" copy.
  const isDirectVote = proposal.track === 'vote';
  const kind = proposalKindOf(proposal.kind);
  // Co-drafting an election or a poll collects its options instead of
  // amending a text: it gets the list and the ballot in the main column, and
  // none of the amendment/final-text/AI-score apparatus.
  const collectsOptions = !isDirectVote && kindCollectsOptions(kind);
  const isTextCodrafting = !isDirectVote && !collectsOptions;
  // A poll or an election may be nothing but its question and options.
  const hasText = proposal.solution.trim() !== '';
  const hasDistinctFinalText = !!proposal.finalText
    && proposal.finalText.trim() !== proposal.solution.trim();
  const initialSolutionExpanded = initialSolutionOpen
    ?? !(proposal.status === 'voting' && hasDistinctFinalText);

  return (
    <AppShell
      breadcrumb={[
        { label: t('home.proposals'), href: '/proposals' },
        { label: proposal.question.length > 60 ? proposal.question.slice(0, 60) + '…' : proposal.question },
      ]}
      leftRail={<CommunityContextRail communityId={proposal.communityId} excludeProposalId={proposal.id} />}
    >
          {/* Proposal header — no card chrome, generous type */}
          <header className="mb-6">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
              <h1 className="min-w-0 flex-1 break-words text-2xl font-semibold leading-snug text-ink sm:text-3xl">
                {proposal.question}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <ShareButton
                  url={`/proposals/${proposal.id}`}
                  title={proposal.question}
                  text={proposal.solution ?? undefined}
                  iconOnly
                />
                {userIsAuthor && proposal.status === 'draft' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLocation(`/proposals/${proposal.id}/edit`)}
                    data-testid="proposal-edit"
                  >
                    <Pencil className="w-4 h-4 mr-1" />
                    {t('proposal.edit') || 'Edit'}
                  </Button>
                )}
                {userIsAuthor && (!['voting', 'decided', 'archived'].includes(proposal.status)
                  || (proposal.status === 'voting' && ballotCount === 0)) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50"
                    data-testid="proposal-delete"
                    onClick={async () => {
                      const confirmKey = proposal.status === 'voting' ? 'proposal.deleteVoteConfirm' : 'proposal.deleteConfirm';
                      if (!window.confirm(t(confirmKey) || 'Να διαγραφεί η πρόταση;')) return;
                      try {
                        await apiRequest('DELETE', `/api/proposals/${proposal.id}`);
                        setLocation('/home');
                      } catch (err: any) {
                        // Others contributed — deletion refused; offer withdrawal
                        // (archives the proposal, keeps everyone's work).
                        const msg = err instanceof Error ? err.message : String(err);
                        if (/409/.test(msg) || /συνεισφέρει|withdraw/i.test(msg)) {
                          const offer = t('proposal.withdrawOffer')
                            || 'Άλλα μέλη έχουν συνεισφέρει (τροπολογίες/συζήτηση/στήριξη), οπότε η πρόταση δεν διαγράφεται. Να αποσυρθεί; Θα αρχειοθετηθεί και οι συνεισφορές τους θα διατηρηθούν.';
                          if (window.confirm(offer)) {
                            try {
                              await apiRequest('POST', `/api/proposals/${proposal.id}/withdraw`);
                              window.location.reload();
                            } catch (werr) {
                              alert(werr instanceof Error ? werr.message : String(werr));
                            }
                          }
                          return;
                        }
                        alert(msg);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    {proposal.status === 'draft' || proposal.status === 'voting'
                      ? (t('proposal.delete') || 'Διαγραφή')
                      : (t('proposal.deleteOrWithdraw') || 'Διαγραφή / Απόσυρση')}
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                {t('proposal.by')} <span className="font-medium text-ink">{proposal.authorName || proposal.authorUsername || t('proposal.userWithId', { id: proposal.authorId })}</span> · <time dateTime={proposal.createdAt}>{new Date(proposal.createdAt).toLocaleString(locale === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
              </span>
              <Link href={`/communities/${proposal.communityId}`} className="font-medium text-kyanos hover:underline">{proposal.communityName || membership.community?.name || t('proposal.communityWithId', { id: proposal.communityId })}</Link>
              <StatusBadge status={proposal.status} />
              <Badge variant="outline" data-testid="proposal-kind-badge">
                {t(`proposal.kind_${kind}`)}
              </Badge>
              {proposal.category && <Badge variant="secondary">{proposal.category}</Badge>}
            </div>
          </header>

      <NextActionPanel status={proposal.status} proposalId={proposal.id} userIsAuthor={userIsAuthor} communityId={proposal.communityId} canParticipate={canParticipate} kind={kind} onNavigate={navigateToAction} onSubmitDraft={handleSubmitDraft} submittingDraft={submittingDraft} draftSubmitError={draftSubmitError} />
      {['author_review', 'community_signal'].includes(proposal.status) && (proposal as any).phaseDeadline && <div className="mb-6"><PhaseCountdown deadline={(proposal as any).phaseDeadline} /></div>}
      {/* While the LLM is scoring (status='review'), tell the user what's
          happening — the page polls every 3s and updates itself. */}
      {proposal.status === 'review' && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center gap-3" data-testid="proposal-validation-banner">
          <span className="text-lg leading-none">🤖</span>
          <span>{t('proposal.validating')}</span>
        </div>
      )}

      <details className="mb-6 rounded-2xl border border-line bg-surface p-4">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-base font-medium text-ink">{t('proposal.processDetails')}<ChevronDown className="h-4 w-4 text-ink-faint" /></summary>
        <div className="pt-4"><LifecycleStepper status={proposal.status} track={proposal.track} kind={kind} /></div>
      </details>
      {/* One readable flow on desktop, tablet and mobile. */}
      <div className="space-y-6">
        <div className="min-w-0">
          {/* Unjudged amendments are silently dropped from the merge — the
              one failure in this flow that a user cannot see coming. */}
          {pendingAmendments > 0 && (
            <div
              className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
              data-testid="pending-amendments-banner"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                <p className="text-sm text-amber-900">
                  {t('proposal.pendingAmendmentsWarning', { count: pendingAmendments })}
                </p>
              </div>
              <Button size="sm" className="shrink-0" asChild>
                <a href={`/proposals/${proposal.id}/amendments/review`}>
                  {t('proposal.pendingAmendmentsAction')}
                </a>
              </Button>
            </div>
          )}

          {/* During an active vote, the distinct final text is primary. */}
          <section className="mb-8">
            {hasText && (
            <Collapsible
              open={initialSolutionExpanded}
              onOpenChange={setInitialSolutionOpen}
              className="border-y"
              data-testid="initial-solution"
            >
              <CollapsibleTrigger
                className="flex w-full items-center justify-between gap-4 py-3 text-left hover:text-foreground"
                data-testid="initial-solution-toggle"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {hasDistinctFinalText
                      ? t('proposal.initialSolution')
                      : kind === 'decision' ? t('proposal.proposedSolution') : t(`proposal.form_text_${kind}`)}
                  </span>
                  {hasDistinctFinalText && (
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {t('proposal.initialSolutionContext')}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${initialSolutionExpanded ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <CollapsibleContent data-testid="initial-solution-content">
                <p className="whitespace-pre-wrap pb-4 text-base leading-relaxed">{proposal.solution}</p>
              </CollapsibleContent>
            </Collapsible>
            )}

            {sortitionRevisions.length > 0 && (
              <div className="mt-4 p-4 border rounded space-y-3">
                <div>
                  <h4 className="text-sm font-medium">{t('proposal.sortitionRevisions')}</h4>
                  <p className="text-xs text-muted-foreground">{t('proposal.sortitionRevisionsHint')}</p>
                </div>
                {sortitionRevisions.map((r, i) => (
                  <div key={r.id} className="text-sm border-l-2 border-purple-300 pl-3">
                    <div className="text-xs text-muted-foreground">
                      {t('proposal.sortitionRevisionLabel', { n: i + 1 })} · {r.authorName}
                    </div>
                    <p className="whitespace-pre-wrap">{r.text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Merged final text (voting/decided/…) — during final_review the
                dedicated section below owns this display, so skip it here.
                This is also what keeps the merged proposal.finalText visible
                for option-ballot proposals once voting starts. */}
            {proposal.status !== 'final_review' && proposal.status !== 'community_signal' && proposal.finalText && proposal.finalText.trim() !== proposal.solution.trim() && (
              <div className="mt-4 p-4 bg-muted rounded space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-medium">{t('proposal.mergedFinalText') || 'Τελικό κείμενο (μετά τις τροπολογίες)'}</h4>
                  {userIsAuthor && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await apiRequest('POST', `/api/proposals/${proposal.id}/merge`);
                          window.location.reload();
                        } catch {}
                      }}
                    >
                      {t('proposal.regenerateMerge') || 'Επανεκτέλεση συγχώνευσης'}
                    </Button>
                  )}
                </div>
                <p className="whitespace-pre-wrap">{proposal.finalText}</p>
              </div>
            )}

            <div className="mt-4">
              <ProposalMediaPreview proposalId={proposal.id} />
            </div>
          </section>

          {/* Final review — the AI-merged vote-ready text. Everyone sees the
              text and the ballot alternatives; the author additionally gets
              accept + AI-refine controls. */}
          {(proposal.status === 'final_review' || (proposal.status === 'community_signal' && finalReviewText.trim() !== '')) && (
            <section id="proposal-final-review" className="mb-8 scroll-mt-24" data-testid="final-review-section">
              <h2 className="text-sm font-medium text-muted-foreground mb-2">
                {t('proposal.final_review_title') || 'Τελικό κείμενο προς ψηφοφορία'}
              </h2>
              <div className="p-4 bg-muted rounded space-y-3">
                <p className="text-xs text-muted-foreground">
                  {t('proposal.final_review_note') || 'Το κείμενο συντέθηκε από το AI ενσωματώνοντας τις αποδεκτές και τις κοινοτικά προωθημένες τροπολογίες.'}
                </p>
                {finalReviewLoading ? (
                  <p className="text-sm text-muted-foreground">{t('general.loading')}</p>
                ) : (
                  <p className="whitespace-pre-wrap text-base leading-relaxed" data-testid="final-review-text">
                    {finalReviewText}
                  </p>
                )}
              </div>

              {finalReviewAlternatives.length > 0 && (
                <div className="mt-4 space-y-2" data-testid="final-review-alternatives">
                  <h3 className="text-sm font-medium">
                    {t('proposal.final_review_alternatives_title') || 'Εναλλακτικές στην ψηφοφορία'}
                  </h3>
                  {finalReviewAlternatives.map((alt, i) => (
                    <Collapsible key={alt.id} className="border rounded">
                      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50">
                        <span>{(t('proposal.final_review_alternative_label') || 'Εναλλακτική') + ` ${i + 1}`}</span>
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-3 pb-3">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{alt.text}</p>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                  <div className="border rounded px-3 py-2 text-sm text-muted-foreground">
                    {t('proposal.final_review_status_quo') || 'Καμία αλλαγή'}
                  </div>
                </div>
              )}

              {userIsAuthor && (
                <div className="mt-4 p-4 border rounded space-y-3" data-testid="final-review-author-actions">
                  {proposal.status === 'community_signal' && finalReview?.authorAcceptedFinalAt ? (
                    <Badge variant="secondary" data-testid="final-review-accepted-badge">
                      {t('proposal.final_review_accepted_badge') || 'Αποδεχθήκατε το τρέχον κείμενο — η ψηφοφορία ανοίγει στη λήξη της συνδιαμόρφωσης'}
                    </Badge>
                  ) : (
                    <Button
                      className="w-full sm:w-auto"
                      disabled={acceptingFinal || refining || finalReviewLoading}
                      onClick={handleAcceptFinalReview}
                      data-testid="final-review-accept"
                    >
                      {acceptingFinal && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {proposal.status === 'community_signal'
                        ? (t('proposal.final_review_accept_live') || 'Αποδοχή τελικού κειμένου')
                        : (t('proposal.final_review_accept') || 'Αποδοχή & έναρξη ψηφοφορίας')}
                    </Button>
                  )}
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        value={refineInstruction}
                        onChange={(e) => setRefineInstruction(e.target.value)}
                        placeholder={t('proposal.final_review_refine_placeholder') || 'π.χ. Κάνε τη διατύπωση της παραγράφου 2 πιο συγκεκριμένη'}
                        maxLength={500}
                        disabled={refining}
                        data-testid="final-review-refine-input"
                      />
                      <Button
                        variant="outline"
                        className="shrink-0"
                        disabled={refining || acceptingFinal || refineInstruction.trim().length < 3}
                        onClick={handleRefineFinalReview}
                        data-testid="final-review-refine"
                      >
                        {refining && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {t('proposal.final_review_refine_button') || 'Βελτίωση με AI'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('proposal.final_review_ai_only_caption') || 'Το τελικό κείμενο τροποποιείται μόνο μέσω AI — οι ενσωματωμένες τροπολογίες προστατεύονται.'}
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* An election or a poll building its list: the list is the page */}
          {collectsOptions && proposal.status === 'community_signal' && <section id="proposal-options" className="scroll-mt-24"><OptionCollectionPanel proposalId={proposal.id} kind={kind as 'election' | 'poll'} allowParticipation={canParticipate} /></section>}

          {/* Direct vote: the ballot is the main event, right under the text */}
          {['voting', 'decided', 'archived'].includes(proposal.status) && (
            <section id="proposal-ballot" className="mb-8 scroll-mt-24" data-testid="direct-vote-panel">
              <VotePanel
                proposalId={proposal.id}
                proposalStatus={proposal.status}
                proposalAuthorId={proposal.authorId}
                votingMode={proposal.votingMode}
                phaseDeadline={(proposal as any).phaseDeadline}
                articleBallot={(proposal as any).articleBallot}
                communityId={proposal.communityId}
                canParticipate={canParticipate}
                joinAction={<CommunityJoinAction communityId={proposal.communityId} />}
                onVoteResultsChange={handleVoteResults}
                onProposalAdvanced={handleProposalAdvanced}
              />
              {voteError && (
                <div className="mt-2 text-red-600 text-sm text-center">{voteError}</div>
              )}
            </section>
          )}

          {/* Participation — the people's surface, always visible */}
          <section id="proposal-participation" className="scroll-mt-24">
            {!canParticipate && <div className="mb-4 rounded-xl border border-line bg-surface p-4"><p className="mb-3 text-sm text-ink-soft">{t('proposal.joinToParticipate')}</p><CommunityJoinAction communityId={proposal.communityId} /></div>}
            <Tabs value={participationTab} onValueChange={changeParticipationTab}>
              <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
                <TabsTrigger value="debate" className="min-h-11 gap-2 rounded-lg px-4 text-sm">
                  <MessageSquare className="w-4 h-4 sm:mr-1" />
                  <span className="text-sm">{t('workspace.tabs.debate')}</span>
                </TabsTrigger>
                {isTextCodrafting && (
                  <TabsTrigger value="amendments" className="min-h-11 gap-2 rounded-lg px-4 text-sm">
                    <FileText className="w-4 h-4 sm:mr-1" />
                    <span className="text-sm">{t('workspace.tabs.amendments')}</span>
                  </TabsTrigger>
                )}
                <TabsTrigger value="media" className="min-h-11 gap-2 rounded-lg px-4 text-sm">
                  <Mic className="w-4 h-4 sm:mr-1" />
                  <span className="text-sm">{t('media.tabLabel')}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="debate">
                <DebatePanel proposalId={proposal.id} proposalStatus={proposal.status} allowParticipation={canParticipate} />
              </TabsContent>

              {isTextCodrafting && (
                <TabsContent value="amendments">
                  <AmendmentsPanel
                    proposalId={proposal.id}
                    proposalStatus={proposal.status}
                    userIsAuthor={userIsAuthor}
                    allowParticipation={canParticipate}
                    articles={articleSectionsFor(kind, proposal.solution ?? '')}
                  />
                </TabsContent>
              )}

              <TabsContent value="media">
                <MediaStudioPanel proposalId={proposal.id} userIsAuthor={userIsAuthor} communityId={proposal.communityId} canParticipate={canParticipate} />
              </TabsContent>
            </Tabs>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="space-y-4">
            {/* Sortition is dormant: the panel appears only while a jury is
                actually convened (manual dispute path), never as a "skipped"
                explainer on ordinary proposals. */}
            {isTextCodrafting && proposal.status === 'sortition_synthesis' && (
              <SortitionPanel
                proposalId={proposal.id}
                proposalStatus={proposal.status}
              />
            )}

            {isTextCodrafting && <details className="rounded-2xl border border-line bg-surface p-4"><summary className="min-h-11 cursor-pointer text-base font-medium text-ink">{t('proposal.validationDetails')}</summary><div className="pt-4">{(() => {
              const numericScore = proposal.llmScore != null ? Number(proposal.llmScore) : null;
              const score = Number.isFinite(numericScore) ? (numericScore as number) : null;
              if (score === null) {
                return userIsAuthor ? (
                  <div className="p-4 border rounded-lg">
                    <h4 className="text-sm font-medium mb-2">{t('proposal.llmValidation')}</h4>
                    <p className="text-sm text-muted-foreground mb-3">{t('proposal.llmNotYetValidated')}</p>
                    <Button size="sm" onClick={handleRevalidate} disabled={revalidating} data-testid="proposal-revalidate-empty">
                      {revalidating ? t('proposal.revalidating') : t('proposal.requestRevalidation')}
                    </Button>
                    {revalidateError && (
                      <p className="text-xs text-red-600 mt-2">{revalidateError}</p>
                    )}
                  </div>
                ) : null;
              }
              return (
                <div data-testid="proposal-llm-validation">
                  <AIValidationBadge
                    score={score}
                    feedback={proposal.llmFeedback || undefined}
                    onDisagree={userIsAuthor ? handleRevalidate : undefined}
                  />
                  {revalidateError && (
                    <p className="text-xs text-red-600 mt-2">{revalidateError}</p>
                  )}
                </div>
              );
            })()}</div></details>}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
