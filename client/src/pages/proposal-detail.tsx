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
import { ArrowLeft, MessageSquare, Vote, Users, FileText, Eye, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import AppShell from '@/components/layout/AppShell';
import LifecycleStepper from '@/components/ui/LifecycleStepper';
import NextActionPanel from '@/components/proposal/NextActionPanel';
import { DebatePanel } from '@/components/debate/DebatePanel';
import { AmendmentsPanel } from '@/components/proposal/AmendmentsPanel';
import { SortitionPanel } from '@/components/proposal/SortitionPanel';
import VotePanel from '@/components/voting/VotePanel';
import { getStatusForProposal } from '@/lib/proposal-status';
import { useTranslation, getStatusLabel } from '@/hooks/use-translation';

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
  const [location] = useLocation();
  const proposalId = location.split('/').pop();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [revalidating, setRevalidating] = useState(false);
  const [revalidateError, setRevalidateError] = useState<string | null>(null);

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
              <Badge className={getStatusForProposal(proposal).color} variant="outline" style={{ whiteSpace: 'nowrap' }}>
                <span className="mr-1">{getStatusForProposal(proposal).icon}</span>
                {getStatusLabel(proposal.status, t)}
              </Badge>
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

            {proposal.finalText && (
              <div className="mt-4 p-4 bg-muted rounded">
                <h4 className="text-sm font-medium mb-2">{t('proposal.finalTextSortition')}</h4>
                <p className="whitespace-pre-wrap">{proposal.finalText}</p>
              </div>
            )}

            {(() => {
              const numericScore = proposal.llmScore != null ? Number(proposal.llmScore) : null;
              const score = Number.isFinite(numericScore) ? (numericScore as number) : null;
              const category = categoryFromScore(score);
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
                <div className={`mt-4 p-4 border rounded ${scoreColor(score)}`} data-testid="proposal-llm-validation">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h4 className="text-sm font-medium mb-1">{t('proposal.llmValidation')}</h4>
                      <div className="flex items-center gap-3 flex-wrap text-sm">
                        <span data-testid="proposal-llm-score">
                          <span className="text-muted-foreground">{t('proposal.score')}</span>
                          <span className="ml-2 font-semibold">{Math.round(score)}/100</span>
                        </span>
                        {category && (
                          <Badge variant="outline" data-testid="proposal-llm-category">
                            {t(`proposal.llmCategory.${category}`)}
                          </Badge>
                        )}
                        {proposal.llmValidationRound != null && (
                          <span className="text-xs text-muted-foreground" data-testid="proposal-llm-round">
                            {t('proposal.llmRound', { round: proposal.llmValidationRound })}
                          </span>
                        )}
                      </div>
                    </div>
                    {userIsAuthor && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRevalidate}
                        disabled={revalidating}
                        data-testid="proposal-revalidate"
                      >
                        {revalidating ? t('proposal.revalidating') : t('proposal.requestRevalidation')}
                      </Button>
                    )}
                  </div>
                  {proposal.llmFeedback && (
                    <p className="text-sm mt-3 whitespace-pre-wrap">{proposal.llmFeedback}</p>
                  )}
                  {revalidateError && (
                    <p className="text-xs text-red-600 mt-2">{revalidateError}</p>
                  )}
                </div>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Overview, Debate, Amendments, Sortition, Votes */}
      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 h-auto gap-1">
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
            onProposalAdvanced={handleProposalAdvanced}
          />
          {voteError && (
            <div className="mt-2 text-red-600 text-sm text-center">{voteError}</div>
          )}
          {userIsAuthor && isVoting && (
            <div className="mt-4 flex justify-center">
              <Button onClick={handleFinalize} disabled={finalizing}>
                {finalizing ? t('general.loading') : t('proposal.finalize')}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
