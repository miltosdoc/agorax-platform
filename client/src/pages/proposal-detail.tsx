/**
 * Proposal Detail Page — Full workspace with tabs:
 * Overview, Debate, Amendments, Sortition, Votes
 * 
 * Integrates: NextActionPanel, DebatePanel, AmendmentsPanel,
 * SortitionPanel, VotePanel
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, MessageSquare, FileText, Trash2, Mic, Pencil, Loader2, ChevronDown } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { PhaseCountdown } from '@/components/ui/PhaseCountdown';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import AppShell from '@/components/layout/AppShell';
import ShareButton from '@/components/ShareButton';
import LifecycleStepper from '@/components/ui/LifecycleStepper';
import NextActionPanel from '@/components/proposal/NextActionPanel';
import { DebatePanel } from '@/components/debate/DebatePanel';
import { AmendmentsPanel } from '@/components/proposal/AmendmentsPanel';
import { SortitionPanel } from '@/components/proposal/SortitionPanel';
import { MediaStudioPanel } from '@/components/proposal/MediaStudioPanel';
import { ProposalMediaPreview } from '@/components/proposal/ProposalMediaPreview';
import VotePanel from '@/components/voting/VotePanel';
import StatusBadge from '@/components/proposal/StatusBadge';
import { useTranslation } from '@/hooks/use-translation';
import { AIValidationBadge } from '@/components/proposal/AIValidationBadge';

interface Proposal {
  id: number;
  question: string;
  solution: string;
  status: string;
  authorId: number;
  authorName?: string;
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

type ValidationCategory = 'return' | 'sortition' | 'auto_approve';

function categoryFromScore(score: number | null): ValidationCategory | null {
  if (score === null) return null;
  if (score < 20) return 'return';
  if (score > 90) return 'auto_approve';
  return 'sortition';
}

function scoreColor(score: number): string {
  if (score < 20) return 'text-red-700 bg-red-50 border-red-200';
  if (score > 90) return 'text-green-700 bg-green-50 border-green-200';
  return 'text-amber-700 bg-amber-50 border-amber-200';
}

export default function ProposalDetailPage() {
  const [location, setLocation] = useLocation();
  const proposalId = location.split('/').pop();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [proposal, setProposal] = useState<Proposal | null>(null);
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
  const [sortitionRevisions, setSortitionRevisions] = useState<
    Array<{ id: number; text: string; authorName: string }>
  >([]);

  useEffect(() => {
    if (!proposalId) return;

    api.get<Proposal>(`/api/proposals/${proposalId}`)
      .then(resp => setProposal(resp.data))
      .catch(() => {
        // Fallback to demo data
        setProposal({
          id: parseInt(proposalId) || 1,
          question: 'Πώς μπορούμε να βελτιώσουμε τη δημόσια συγκοινωνία;',
          solution: 'Εισαγωγή ηλεκτρικών λεωφορείων και επέκταση ποδηλατοδρόμων.',
          status: 'voting',
          authorId: 1,
          authorName: 'Δημοκράτης Παπαδόπουλος',
          communityId: 1,
          communityName: 'Πολίτες Αθήνας',
          createdAt: new Date().toISOString(),
        });
      })
      .finally(() => setLoading(false));
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
    if (!proposalId || (proposal?.status !== 'final_review' && !(proposal?.status === 'community_signal' && proposal?.track !== 'vote'))) return;
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
        <div className="flex items-center justify-center min-h-[40vh]">{t('proposal.notFound')}</div>
      </AppShell>
    );
  }

  const userIsAuthor = !!user && user.id === proposal.authorId;
  const isVoting = proposal.status === 'voting';
  // Displayed merged text during final_review: the endpoint's copy wins,
  // proposal.finalText is the fallback if the fetch failed.
  const finalReviewText = finalReview?.finalText ?? proposal.finalText ?? '';
  const finalReviewAlternatives = finalReview?.alternatives ?? [];
  // Direct-vote proposals carry none of the deliberation apparatus: the
  // ballot IS the page. Vote front and center, no amendments tab, no
  // sortition/AI-validation widgets, no "final text" copy.
  const isDirectVote = proposal.track === 'vote';
  const hasDistinctFinalText = !!proposal.finalText
    && proposal.finalText.trim() !== proposal.solution.trim();
  const initialSolutionExpanded = initialSolutionOpen
    ?? !(proposal.status === 'voting' && hasDistinctFinalText);

  return (
    <AppShell breadcrumb={[
      { label: t('home.proposals'), href: '/proposals' },
      { label: proposal.question.length > 60 ? proposal.question.slice(0, 60) + '…' : proposal.question },
    ]}>
      <Button variant="ghost" className="mb-4" onClick={() => window.history.back()}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t('general.back')}
      </Button>

      {/* While the LLM is scoring (status='review'), tell the user what's
          happening — the page polls every 3s and updates itself. */}
      {proposal.status === 'review' && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center gap-3" data-testid="proposal-validation-banner">
          <span className="text-lg leading-none">🤖</span>
          <span>{t('proposal.validating')}</span>
        </div>
      )}

      {/* Draft call-to-action — the sidebar button alone is easy to miss
          (it falls below the fold on mobile), so the path from draft to
          deliberation is spelled out right at the top. */}
      {userIsAuthor && proposal.status === 'draft' && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900" data-testid="proposal-draft-banner">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="flex-1">{t('workspace.action.draft')}</span>
            <Button
              size="sm"
              className="shrink-0"
              disabled={submittingDraft}
              onClick={handleSubmitDraft}
              data-testid="proposal-draft-submit"
            >
              {submittingDraft ? t('proposal.submitting_review') : t('workspace.action.draftButton')}
            </Button>
          </div>
          {draftSubmitError && <p className="mt-2 text-xs text-red-600">{draftSubmitError}</p>}
        </div>
      )}

      {/* Slim lifecycle strip — the one piece of process chrome above the fold */}
      <div className="mb-6 rounded-lg border bg-background px-4 py-3">
        <LifecycleStepper status={proposal.status} />
      </div>

      {/* Two-column deliberation layout: the proposal text and the people
          (debate + amendments) own the main column; process widgets (next
          action, votes, sortition, AI score) live in a sticky sidebar. */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-8 lg:items-start">
        <div className="lg:col-span-2 min-w-0">
          {/* Proposal header — no card chrome, generous type */}
          <header className="mb-6">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl md:text-3xl font-semibold leading-snug flex-1 min-w-0">
                {proposal.question}
              </h1>
              <div className="flex items-center gap-2 shrink-0 pt-1">
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
                {userIsAuthor && !['voting', 'decided', 'archived'].includes(proposal.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50"
                    data-testid="proposal-delete"
                    onClick={async () => {
                      if (!window.confirm(t('proposal.deleteConfirm') || 'Να διαγραφεί η πρόταση;')) return;
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
                    {proposal.status === 'draft'
                      ? (t('proposal.delete') || 'Διαγραφή')
                      : (t('proposal.deleteOrWithdraw') || 'Διαγραφή / Απόσυρση')}
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                {t('proposal.by')} {proposal.authorName || t('proposal.userWithId', { id: proposal.authorId })} · {new Date(proposal.createdAt).toLocaleDateString()}
              </span>
              <StatusBadge status={proposal.status} />
              {proposal.track === 'vote' && (
                <Badge variant="outline" data-testid="proposal-track-badge">
                  {t('proposal.final_review_track_vote_badge') || 'Άμεση ψηφοφορία'}
                </Badge>
              )}
              {proposal.category && <Badge variant="secondary">{proposal.category}</Badge>}
            </div>
          </header>

          {/* During an active vote, the distinct final text is primary. */}
          <section className="mb-8">
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
                    {hasDistinctFinalText ? t('proposal.initialSolution') : t('proposal.proposedSolution')}
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
            <section className="mb-8" data-testid="final-review-section">
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
                      {t('proposal.final_review_accepted_badge') || 'Αποδεχθήκατε το τρέχον κείμενο — η ψηφοφορία ανοίγει στη λήξη της διαβούλευσης'}
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

          {/* Direct vote: the ballot is the main event, right under the text */}
          {isDirectVote && ['voting', 'decided', 'archived'].includes(proposal.status) && (
            <section className="mb-8" data-testid="direct-vote-panel">
              <VotePanel
                proposalId={proposal.id}
                proposalStatus={proposal.status}
                proposalAuthorId={proposal.authorId}
                votingMode={proposal.votingMode}
                phaseDeadline={(proposal as any).phaseDeadline}
                onProposalAdvanced={handleProposalAdvanced}
              />
              {voteError && (
                <div className="mt-2 text-red-600 text-sm text-center">{voteError}</div>
              )}
            </section>
          )}

          {/* Participation — the people's surface, always visible */}
          <section>
            <Tabs defaultValue={!isDirectVote && ['author_review', 'community_signal'].includes(proposal.status) ? 'amendments' : 'debate'}>
              <TabsList className={`grid w-full ${isDirectVote ? 'grid-cols-2' : 'grid-cols-3'} h-auto gap-1`}>
                <TabsTrigger value="debate" className="gap-1 py-2">
                  <MessageSquare className="w-4 h-4 sm:mr-1" />
                  <span className="text-xs sm:text-sm">{t('workspace.tabs.debate')}</span>
                </TabsTrigger>
                {!isDirectVote && (
                  <TabsTrigger value="amendments" className="gap-1 py-2">
                    <FileText className="w-4 h-4 sm:mr-1" />
                    <span className="text-xs sm:text-sm">{t('workspace.tabs.amendments')}</span>
                  </TabsTrigger>
                )}
                <TabsTrigger value="media" className="gap-1 py-2">
                  <Mic className="w-4 h-4 sm:mr-1" />
                  <span className="text-xs sm:text-sm">{t('media.tabLabel')}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="debate">
                <DebatePanel proposalId={proposal.id} />
              </TabsContent>

              {!isDirectVote && (
                <TabsContent value="amendments">
                  <AmendmentsPanel
                    proposalId={proposal.id}
                    proposalStatus={proposal.status}
                    userIsAuthor={userIsAuthor}
                  />
                </TabsContent>
              )}

              <TabsContent value="media">
                <MediaStudioPanel proposalId={proposal.id} userIsAuthor={userIsAuthor} />
              </TabsContent>
            </Tabs>
          </section>
        </div>

        {/* Sidebar — process widgets, sticky on desktop */}
        <aside className="mt-8 lg:mt-0 lg:col-span-1">
          <div className="lg:sticky lg:top-20 space-y-4">
            {/* Phase timer — voting shows its own countdown inside VotePanel */}
            {['author_review', 'community_signal'].includes(proposal.status) && (proposal as any).phaseDeadline && (
              <PhaseCountdown deadline={(proposal as any).phaseDeadline} />
            )}
            {(!isDirectVote || proposal.status === 'draft') && (
              <NextActionPanel
                status={proposal.status}
                proposalId={proposal.id}
                userIsAuthor={userIsAuthor}
              />
            )}

            {!isDirectVote && ['voting', 'decided', 'archived'].includes(proposal.status) && (
              <div>
                <VotePanel
                  proposalId={proposal.id}
                  proposalStatus={proposal.status}
                  proposalAuthorId={proposal.authorId}
                  votingMode={proposal.votingMode}
                  phaseDeadline={(proposal as any).phaseDeadline}
                  onProposalAdvanced={handleProposalAdvanced}
                />
                {voteError && (
                  <div className="mt-2 text-red-600 text-sm text-center">{voteError}</div>
                )}
              </div>
            )}

            {/* Sortition is dormant: the panel appears only while a jury is
                actually convened (manual dispute path), never as a "skipped"
                explainer on ordinary proposals. */}
            {!isDirectVote && proposal.status === 'sortition_synthesis' && (
              <SortitionPanel
                proposalId={proposal.id}
                proposalStatus={proposal.status}
              />
            )}

            {!isDirectVote && (() => {
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
            })()}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
