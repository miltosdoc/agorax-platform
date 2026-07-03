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
import { ArrowLeft, MessageSquare, FileText, Trash2, Mic, Pencil } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
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

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [revalidating, setRevalidating] = useState(false);
  const [revalidateError, setRevalidateError] = useState<string | null>(null);
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
                {userIsAuthor && proposal.status === 'draft' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50"
                    onClick={async () => {
                      if (!window.confirm(t('proposal.deleteConfirm') || 'Delete this draft proposal?')) return;
                      try {
                        await apiRequest('DELETE', `/api/proposals/${proposal.id}`);
                        setLocation('/home');
                      } catch (err) {
                        alert(err instanceof Error ? err.message : String(err));
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    {t('proposal.delete') || 'Delete'}
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                {t('proposal.by')} {proposal.authorName || t('proposal.userWithId', { id: proposal.authorId })} · {new Date(proposal.createdAt).toLocaleDateString()}
              </span>
              <StatusBadge status={proposal.status} />
              {proposal.category && <Badge variant="secondary">{proposal.category}</Badge>}
            </div>
          </header>

          {/* Proposal text — the star of the page */}
          <section className="mb-8">
            <h2 className="text-sm font-medium text-muted-foreground mb-2">{t('proposal.proposedSolution')}</h2>
            <p className="whitespace-pre-wrap text-base leading-relaxed">{proposal.solution}</p>

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

            {proposal.finalText && proposal.finalText.trim() !== proposal.solution.trim() && (
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

          {/* Participation — the people's surface, always visible */}
          <section>
            <Tabs defaultValue={['author_review', 'community_signal'].includes(proposal.status) ? 'amendments' : 'debate'}>
              <TabsList className="grid w-full grid-cols-3 h-auto gap-1">
                <TabsTrigger value="debate" className="gap-1 py-2">
                  <MessageSquare className="w-4 h-4 sm:mr-1" />
                  <span className="text-xs sm:text-sm">{t('workspace.tabs.debate')}</span>
                </TabsTrigger>
                <TabsTrigger value="amendments" className="gap-1 py-2">
                  <FileText className="w-4 h-4 sm:mr-1" />
                  <span className="text-xs sm:text-sm">{t('workspace.tabs.amendments')}</span>
                </TabsTrigger>
                <TabsTrigger value="media" className="gap-1 py-2">
                  <Mic className="w-4 h-4 sm:mr-1" />
                  <span className="text-xs sm:text-sm">{t('media.tabLabel')}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="debate">
                <DebatePanel proposalId={proposal.id} />
              </TabsContent>

              <TabsContent value="amendments">
                <AmendmentsPanel
                  proposalId={proposal.id}
                  proposalStatus={proposal.status}
                  userIsAuthor={userIsAuthor}
                />
              </TabsContent>

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
            <NextActionPanel
              status={proposal.status}
              proposalId={proposal.id}
              userIsAuthor={userIsAuthor}
            />

            {['voting', 'decided', 'archived'].includes(proposal.status) && (
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

            {['sortition_synthesis', 'voting', 'decided', 'archived'].includes(proposal.status) && (
              <SortitionPanel
                proposalId={proposal.id}
                proposalStatus={proposal.status}
              />
            )}

            {(() => {
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
