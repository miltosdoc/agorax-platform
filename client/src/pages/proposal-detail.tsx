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
import { ArrowLeft, MessageSquare, Vote, Users, FileText, Eye, Trash2, Mic } from 'lucide-react';
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

function defaultTabForStatus(status: string): string {
  switch (status) {
    case 'author_review':
    case 'community_signal':
      return 'amendments';
    case 'sortition_synthesis':
      return 'sortition';
    case 'voting':
    case 'decided':
      return 'votes';
    default:
      return 'overview';
  }
}

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

      {/* Next Action Panel */}
      <div className="mb-4">
        <NextActionPanel
          status={proposal.status}
          proposalId={proposal.id}
          userIsAuthor={userIsAuthor}
        />
      </div>

      {/* While the LLM is scoring (status='review'), tell the user what's
          happening — the page polls every 3s and updates itself. */}
      {proposal.status === 'review' && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center gap-3" data-testid="proposal-validation-banner">
          <span className="text-lg leading-none">🤖</span>
          <span>{t('proposal.validating')}</span>
        </div>
      )}

      {/* Lifecycle Stepper */}
      <Card className="mb-4">
        <CardContent className="py-4">
          <LifecycleStepper status={proposal.status} />
        </CardContent>
      </Card>

      {/* Proposal Content */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl mb-2">{proposal.question}</CardTitle>
              <CardDescription>
                {t('proposal.by')} {proposal.authorName || t('proposal.userWithId', { id: proposal.authorId })} · {new Date(proposal.createdAt).toLocaleDateString()}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 self-start">
              <ShareButton
                url={`/proposals/${proposal.id}`}
                title={proposal.question}
                text={proposal.solution ?? undefined}
                iconOnly
              />
              <StatusBadge status={proposal.status} />
              {userIsAuthor && proposal.status === 'draft' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:bg-red-50"
                  onClick={async () => {
                    if (!window.confirm(t('proposal.deleteConfirm') || 'Delete this draft proposal?')) return;
                    try {
                      const res = await fetch(`/api/proposals/${proposal.id}`, {
                        method: 'DELETE',
                        credentials: 'include',
                      });
                      if (!res.ok && res.status !== 204) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.message || `HTTP ${res.status}`);
                      }
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
        </CardHeader>
        <CardContent>
          <div className="prose max-w-none">
            <h4 className="text-sm font-medium text-muted-foreground">{t('proposal.proposedSolution')}</h4>
            <p className="whitespace-pre-wrap">{proposal.solution}</p>

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
                          const resp = await fetch(`/api/proposals/${proposal.id}/merge`, { method: 'POST', credentials: 'include' });
                          if (resp.ok) window.location.reload();
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

            {(() => {
              const numericScore = proposal.llmScore != null ? Number(proposal.llmScore) : null;
              const score = Number.isFinite(numericScore) ? (numericScore as number) : null;
              if (score === null) {
                return userIsAuthor ? (
                  <div className="mt-4 p-4 border rounded">
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
                <div className="mt-4" data-testid="proposal-llm-validation">
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
        </CardContent>
      </Card>

      {/* Tabs: Overview, Debate, Amendments, Sortition, Votes.
          Default tab follows the lifecycle phase so users land on the
          relevant work surface for the proposal's current state. */}
      <Tabs defaultValue={defaultTabForStatus(proposal.status)}>
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-3 md:grid-cols-6 h-auto gap-1">
          <TabsTrigger value="overview" className="flex-col sm:flex-row gap-1 py-2">
            <Eye className="w-4 h-4 sm:mr-1" />
            <span className="text-xs sm:text-sm">{t('workspace.tabs.overview')}</span>
          </TabsTrigger>
          <TabsTrigger value="debate" className="flex-col sm:flex-row gap-1 py-2">
            <MessageSquare className="w-4 h-4 sm:mr-1" />
            <span className="text-xs sm:text-sm">{t('workspace.tabs.debate')}</span>
          </TabsTrigger>
          <TabsTrigger value="amendments" className="flex-col sm:flex-row gap-1 py-2">
            <FileText className="w-4 h-4 sm:mr-1" />
            <span className="text-xs sm:text-sm">{t('workspace.tabs.amendments')}</span>
          </TabsTrigger>
          <TabsTrigger value="sortition" className="flex-col sm:flex-row gap-1 py-2">
            <Users className="w-4 h-4 sm:mr-1" />
            <span className="text-xs sm:text-sm">{t('workspace.tabs.sortition')}</span>
          </TabsTrigger>
          <TabsTrigger value="votes" className="flex-col sm:flex-row gap-1 py-2">
            <Vote className="w-4 h-4 sm:mr-1" />
            <span className="text-xs sm:text-sm">{t('workspace.tabs.votes')}</span>
          </TabsTrigger>
          <TabsTrigger value="media" className="flex-col sm:flex-row gap-1 py-2">
            <Mic className="w-4 h-4 sm:mr-1" />
            <span className="text-xs sm:text-sm">{t('media.tabLabel')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>{t('workspace.tabs.overview')}</CardTitle>
              <CardDescription>
                {t('proposal.proposedSolution')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('proposal.questionLabel') || 'Ερώτημα'}</h4>
                  <p className="whitespace-pre-wrap">{proposal.question}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('proposal.proposedSolution')}</h4>
                  <p className="whitespace-pre-wrap">{proposal.solution}</p>
                </div>
                {proposal.finalText && (
                  <div className="p-4 bg-muted rounded">
                    <h4 className="text-sm font-medium mb-2">{t('proposal.finalTextSortition')}</h4>
                    <p className="whitespace-pre-wrap">{proposal.finalText}</p>
                  </div>
                )}
                {proposal.category && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('proposal.category') || 'Κατηγορία'}</h4>
                    <Badge variant="secondary">{proposal.category}</Badge>
                  </div>
                )}
                <ProposalMediaPreview proposalId={proposal.id} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

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

        <TabsContent value="sortition">
          <SortitionPanel
            proposalId={proposal.id}
            proposalStatus={proposal.status}
          />
        </TabsContent>

        <TabsContent value="votes">
          <VotePanel
            proposalId={proposal.id}
            proposalStatus={proposal.status}
            proposalAuthorId={proposal.authorId}
            votingMode={proposal.votingMode}
            onProposalAdvanced={handleProposalAdvanced}
          />
          {voteError && (
            <div className="mt-2 text-red-600 text-sm text-center">{voteError}</div>
          )}
        </TabsContent>

        <TabsContent value="media">
          <MediaStudioPanel proposalId={proposal.id} userIsAuthor={userIsAuthor} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
