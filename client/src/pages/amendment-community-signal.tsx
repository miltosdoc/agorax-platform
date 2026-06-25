/**
 * Community Signal Page
 * 
 * Community members vote ⬆️ (disagree with author's rejection) or 
 * ⬇️ (agree with author's rejection) on rejected amendments.
 * Amendments exceeding the community threshold are flagged for sortition.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PhaseCountdown } from '@/components/ui/PhaseCountdown';
import { api } from '@/lib/api';
import { ArrowLeft, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

interface RejectedAmendment {
  id: number;
  authorId: number;
  type: string;
  text: string;
  authorReason: string | null;
  rejectionUpvotes: number;
  rejectionDownvotes: number;
  llmScore: number | null;
  createdAt: string;
}

interface CommunitySignal {
  amendmentId: number;
  upvotes: number;
  downvotes: number;
  netScore: number;
  totalVotes: number;
  ratio: number;
  flagged: boolean;
  threshold: number;
}

interface ProposalMeta {
  phaseDeadline?: string | null;
}

export default function AmendmentCommunitySignal() {
  const params = useParams<{ id: string }>();
  const proposalId = parseInt(params.id || '0', 10);
  const { t } = useTranslation();
  
  const [amendments, setAmendments] = useState<RejectedAmendment[]>([]);
  const [signals, setSignals] = useState<CommunitySignal[]>([]);
  const [proposal, setProposal] = useState<ProposalMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<Record<number, boolean>>({});
  const [userVotes, setUserVotes] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  async function advanceToNextPhase() {
    const anyFlagged = signals.some((s) => s.flagged);
    const next = anyFlagged ? 'sortition_synthesis' : 'voting';
    setAdvancing(true);
    setAdvanceError(null);
    try {
      await api.post(`/api/proposals/${proposalId}/transition`, { newState: next });
      window.location.href = `/proposals/${proposalId}`;
    } catch (e: any) {
      setAdvanceError(e?.response?.data?.message || String(e?.message || e));
      setAdvancing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [proposalId]);

  async function loadData() {
    try {
      const [amendmentsRes, signalsRes, proposalRes] = await Promise.all([
        api.get<(RejectedAmendment & { authorDecision?: string })[]>(`/api/proposals/${proposalId}/amendments`),
        api.get<CommunitySignal[]>(`/api/proposals/${proposalId}/amendments/signals`),
        api.get<ProposalMeta>(`/api/proposals/${proposalId}`).catch(() => ({ data: null })),
      ]);
      setAmendments(amendmentsRes.data.filter((a) => a.authorDecision === 'rejected'));
      setSignals(signalsRes.data);
      if (proposalRes.data) setProposal(proposalRes.data);
    } catch (e) {
      setError(t('amendment.error.loadDataFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function castVote(amendmentId: number, vote: 1 | -1) {
    setVoting(prev => ({ ...prev, [amendmentId]: true }));
    
    try {
      await api.post(`/api/amendments/${amendmentId}/rejection-vote`, { vote });
      setUserVotes(prev => ({ ...prev, [amendmentId]: vote }));
      await loadData();
    } catch (e) {
      setError(t('amendment.error.voteFailed'));
    } finally {
      setVoting(prev => ({ ...prev, [amendmentId]: false }));
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <div className="container mx-auto py-6 px-4 max-w-3xl flex-grow">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="container mx-auto py-6 px-4 max-w-3xl flex-grow">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" /> {t('general.back')}
        </Button>
        <h1 className="text-2xl font-bold">{t('amendment.communitySignal.title')}</h1>
      </div>

      {proposal?.phaseDeadline && (
        <div className="mb-4">
          <PhaseCountdown
            deadline={proposal.phaseDeadline}
            label="Χρόνος φάσης κοινοτικού σήματος:"
            onExpired={advanceToNextPhase}
          />
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-yellow-600" />
            {t('amendment.communitySignal.voteTitle')}
          </CardTitle>
          <CardDescription>
            {t('amendment.communitySignal.description')}
            <br />
            <span className="text-green-600 font-medium">{t('amendment.communitySignal.disagreeWithRejection')}</span> {t('amendment.communitySignal.or')}
            <span className="text-red-600 font-medium"> {t('amendment.communitySignal.agreeWithRejection')}</span>
          </CardDescription>
        </CardHeader>
      </Card>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {amendments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center space-y-4">
            <p className="text-muted-foreground">{t('amendment.communitySignal.noRejectedAmendments')}</p>
            <Button onClick={advanceToNextPhase} disabled={advancing}>
              {advancing
                ? (t('amendment.communitySignal.advancing') || 'Μετάβαση…')
                : (t('amendment.communitySignal.advanceButton') || 'Συνέχεια στην ψηφοφορία')}
            </Button>
            {advanceError && <p className="text-sm text-red-600">{advanceError}</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {amendments.map(amendment => {
            const signal = signals.find(s => s.amendmentId === amendment.id);
            const netScore = (signal?.netScore ?? 0);
            const ratio = (signal?.ratio ?? 0);
            const flagged = signal?.flagged ?? false;
            const userVote = userVotes[amendment.id];

            return (
              <Card key={amendment.id} className={
                flagged ? 'border-green-300 bg-green-50' : 'border-muted'
              }>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{amendment.type}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {t('amendment.fromUser', { id: amendment.authorId })}
                      </span>
                    </div>
                    {flagged && (
                      <Badge className="bg-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {t('amendment.communitySignal.flaggedForSortition')}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-3">{amendment.text}</p>
                  
                  {amendment.authorReason && (
                    <div className="p-2 bg-white rounded border text-xs text-muted-foreground mb-3">
                      <strong>{t('amendment.authorJustification')}</strong> {amendment.authorReason}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant={userVote === 1 ? "default" : "outline"}
                        className={userVote === 1 ? "bg-green-600" : ""}
                        onClick={() => castVote(amendment.id, 1)}
                        disabled={voting[amendment.id]}
                      >
                        {t('amendment.communitySignal.disagree')} ({amendment.rejectionUpvotes + (userVote === 1 ? 1 : 0)})
                      </Button>
                      <Button 
                        size="sm" 
                        variant={userVote === -1 ? "default" : "outline"}
                        className={userVote === -1 ? "bg-red-600 text-white" : "text-red-600"}
                        onClick={() => castVote(amendment.id, -1)}
                        disabled={voting[amendment.id]}
                      >
                        {t('amendment.communitySignal.agree')} ({amendment.rejectionDownvotes + (userVote === -1 ? 1 : 0)})
                      </Button>
                    </div>
                    <div className="text-sm">
                      <span className={`font-medium ${flagged ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {t('amendment.net')}: {netScore > 0 ? '+' : ''}{netScore} ({(ratio * 100).toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <Card className="border-primary/20">
            <CardContent className="py-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                {signals.some((s) => s.flagged)
                  ? (t('amendment.communitySignal.advanceHintFlagged') || 'Υπάρχουν επισημασμένες τροπολογίες — μετάβαση στο κληρωτό σώμα.')
                  : (t('amendment.communitySignal.advanceHintNoFlagged') || 'Καμία τροπολογία δεν επισημάνθηκε — μετάβαση στην ψηφοφορία.')}
              </p>
              <Button onClick={advanceToNextPhase} disabled={advancing}>
                {advancing
                  ? (t('amendment.communitySignal.advancing') || 'Μετάβαση…')
                  : (t('amendment.communitySignal.advanceButton') || 'Συνέχεια στην επόμενη φάση')}
              </Button>
              {advanceError && <p className="text-sm text-red-600">{advanceError}</p>}
            </CardContent>
          </Card>
        </div>
      )}
      </div>
      <Footer />
    </div>
  );
}
