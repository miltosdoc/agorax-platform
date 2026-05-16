import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  ThumbsUp,
  ThumbsDown,
  MinusCircle,
  CheckCircle2,
  XCircle,
  Vote,
  Lock,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';

export type VoteChoice = 'yes' | 'no' | 'abstain';

export interface VoteResults {
  yes: number;
  no: number;
  abstain: number;
  total: number;
  participants: number;
  participationPct: number;
  passes: boolean;
  meetsQuorum: boolean;
  minParticipationPct: number;
  userVote: VoteChoice | null;
  /** True while the running tally is withheld (private backends, pre-close). */
  sealed?: boolean;
  /** Whether the viewer has cast a ballot — known even when `userVote` is not. */
  hasVoted?: boolean;
  /** Effective ballots cast so far (shown while the tally is sealed). */
  ballotCount?: number;
}

const EMPTY_RESULTS: VoteResults = {
  yes: 0,
  no: 0,
  abstain: 0,
  total: 0,
  participants: 0,
  participationPct: 0,
  passes: false,
  meetsQuorum: false,
  minParticipationPct: 0,
  userVote: null,
  sealed: false,
  hasVoted: false,
  ballotCount: 0,
};

interface VotePanelProps {
  proposalId: number;
  proposalStatus: string;
  proposalAuthorId?: number;
  onVoteResultsChange?: (results: VoteResults) => void;
  onProposalAdvanced?: (newStatus: string) => void;
}

export default function VotePanel({
  proposalId,
  proposalStatus,
  proposalAuthorId,
  onVoteResultsChange,
  onProposalAdvanced,
}: VotePanelProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [results, setResults] = useState<VoteResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const isVoting = proposalStatus === 'voting';
  const isClosed = proposalStatus === 'decided' || proposalStatus === 'archived';
  // A private backend never reveals `userVote`, but still reports `hasVoted`.
  const userVoted = results.hasVoted ?? results.userVote !== null;
  const userIsAuthor = !!user && proposalAuthorId !== undefined && user.id === proposalAuthorId;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<VoteResults>(`/api/proposals/${proposalId}/vote-results`)
      .then((resp) => {
        if (cancelled) return;
        setResults(resp.data);
        onVoteResultsChange?.(resp.data);
      })
      .catch(() => {
        if (cancelled) return;
        setResults(EMPTY_RESULTS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId, proposalStatus, onVoteResultsChange]);

  const refresh = async () => {
    try {
      const resp = await api.get<VoteResults>(`/api/proposals/${proposalId}/vote-results`);
      setResults(resp.data);
      onVoteResultsChange?.(resp.data);
    } catch {
      // Keep prior state.
    }
  };

  const handleCastVote = async (choice: VoteChoice) => {
    if (voting) return;
    setVoting(true);
    setError(null);
    try {
      await api.post(`/api/proposals/${proposalId}/vote`, { choice });
      setChanging(false);
      await refresh();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : t('proposal.voteFailed');
      setError(message);
    } finally {
      setVoting(false);
    }
  };

  const handleFinalize = async () => {
    if (finalizing) return;
    setFinalizing(true);
    setError(null);
    try {
      const resp = await api.post<{ proposal: { status: string }; results: VoteResults }>(
        `/api/proposals/${proposalId}/finalize`,
      );
      const merged: VoteResults = { ...resp.data.results, userVote: results.userVote };
      setResults(merged);
      onVoteResultsChange?.(merged);
      onProposalAdvanced?.(resp.data.proposal.status);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : t('proposal.finalizeFailed');
      setError(message);
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t('general.loading')}
        </CardContent>
      </Card>
    );
  }

  const decisive = results.yes + results.no;
  const yesPercent = decisive > 0 ? Math.round((results.yes / decisive) * 100) : 0;
  const noPercent = decisive > 0 ? Math.round((results.no / decisive) * 100) : 0;
  const totalForBars = Math.max(1, results.total);
  const yesShare = Math.round((results.yes / totalForBars) * 100);
  const noShare = Math.round((results.no / totalForBars) * 100);
  const abstainShare = Math.round((results.abstain / totalForBars) * 100);
  const participationPercent = Math.round(results.participationPct * 100);
  const quorumPercent = Math.round(results.minParticipationPct * 100);

  const showVoteButtons = isVoting && (!userVoted || changing);

  return (
    <Card data-testid="vote-panel">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Vote className="w-5 h-5" />
              {t('vote.panelTitle')}
            </CardTitle>
            <CardDescription>
              {isVoting
                ? t('proposal.votingOpen')
                : isClosed
                ? proposalStatus === 'archived'
                  ? t('proposal.proposalArchived')
                  : t('proposal.proposalDecided')
                : t('vote.notOpenShort')}
            </CardDescription>
          </div>
          {isClosed && (
            <Badge variant={results.passes ? 'default' : 'secondary'} className="flex items-center gap-1">
              {results.passes ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  {t('vote.passed')}
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3" />
                  {t('vote.notPassed')}
                </>
              )}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isVoting && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900">
            {t('vote.phaseHint') || 'Φάση: Ψηφοφορία. Η δεσμευτική ψήφος γίνεται στο τελικό κείμενο. Όταν ο συγγραφέας ή ένας διαχειριστής οριστικοποιήσει την ψηφοφορία, η πρόταση μεταβαίνει στο «Αποφασίστηκε» ή στο «Αρχειοθετήθηκε» (αν δεν καλύφθηκε η απαρτία ή δεν υπήρξε αποφασιστική ψήφος).'}
          </div>
        )}
        {!user && isVoting && (
          <div className="p-3 bg-muted rounded text-sm text-muted-foreground">
            {t('auth.loginToVote')}
          </div>
        )}

        {showVoteButtons && user && (
          <div>
            <div className="text-sm text-muted-foreground mb-3">
              {userVoted ? t('vote.changeYourVote') : t('vote.castYourVote')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Button
                variant={results.userVote === 'yes' ? 'default' : 'outline'}
                className={
                  results.userVote === 'yes'
                    ? 'gap-2 bg-green-600 hover:bg-green-700'
                    : 'gap-2 border-green-500 text-green-700 hover:bg-green-50'
                }
                onClick={() => handleCastVote('yes')}
                disabled={voting}
                data-testid="vote-button-yes"
              >
                <ThumbsUp className="w-4 h-4" />
                {t('proposal.support')}
              </Button>
              <Button
                variant={results.userVote === 'no' ? 'default' : 'outline'}
                className={
                  results.userVote === 'no'
                    ? 'gap-2 bg-red-600 hover:bg-red-700'
                    : 'gap-2 border-red-500 text-red-700 hover:bg-red-50'
                }
                onClick={() => handleCastVote('no')}
                disabled={voting}
                data-testid="vote-button-no"
              >
                <ThumbsDown className="w-4 h-4" />
                {t('proposal.oppose')}
              </Button>
              <Button
                variant={results.userVote === 'abstain' ? 'default' : 'outline'}
                className="gap-2"
                onClick={() => handleCastVote('abstain')}
                disabled={voting}
                data-testid="vote-button-abstain"
              >
                <MinusCircle className="w-4 h-4" />
                {t('proposal.abstain')}
              </Button>
            </div>
            {changing && (
              <Button variant="ghost" size="sm" onClick={() => setChanging(false)} className="mt-2">
                {t('general.cancel')}
              </Button>
            )}
          </div>
        )}

        {userVoted && !showVoteButtons && (
          <div className="flex items-center justify-between p-3 rounded border bg-muted/30">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span>
                {results.userVote ? (
                  <>
                    {t('vote.youVoted')}{' '}
                    <span className="font-medium">
                      {results.userVote === 'yes' && t('proposal.support')}
                      {results.userVote === 'no' && t('proposal.oppose')}
                      {results.userVote === 'abstain' && t('proposal.abstain')}
                    </span>
                  </>
                ) : (
                  t('vote.ballotCast')
                )}
              </span>
            </div>
            {isVoting && (
              <Button variant="outline" size="sm" onClick={() => setChanging(true)} data-testid="vote-change">
                {t('vote.changeVote')}
              </Button>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            <XCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Tally — private backends seal it until the election closes */}
        {results.sealed ? (
          <div className="rounded-md border bg-muted/30 p-4 text-center space-y-1.5">
            <Lock className="w-5 h-5 mx-auto text-muted-foreground" />
            <div className="text-sm font-medium">{t('vote.tallySealed')}</div>
            <div className="text-xs text-muted-foreground">
              {t('proposal.totalVotes', { count: results.ballotCount ?? results.total })}
            </div>
          </div>
        ) : (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="flex items-center gap-1">
                <ThumbsUp className="w-4 h-4 text-green-600" />
                {t('proposal.support')}
              </span>
              <span className="font-medium">
                {results.yes} ({yesShare}%)
              </span>
            </div>
            <Progress value={yesShare} className="h-2" />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="flex items-center gap-1">
                <ThumbsDown className="w-4 h-4 text-red-600" />
                {t('proposal.oppose')}
              </span>
              <span className="font-medium">
                {results.no} ({noShare}%)
              </span>
            </div>
            <Progress value={noShare} className="h-2" />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="flex items-center gap-1">
                <MinusCircle className="w-4 h-4 text-muted-foreground" />
                {t('proposal.abstain')}
              </span>
              <span className="font-medium">
                {results.abstain} ({abstainShare}%)
              </span>
            </div>
            <Progress value={abstainShare} className="h-2" />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-muted-foreground">
            <div>
              <div>{t('vote.decisiveSplit')}</div>
              <div className="text-foreground font-medium">
                {yesPercent}% / {noPercent}%
              </div>
            </div>
            <div>
              {quorumPercent === 0 ? (
                <>
                  <div>{t('proposal.participation_no_quorum', { pct: participationPercent }) || `Συμμετοχή: ${participationPercent}%`}</div>
                  <div className="text-muted-foreground">
                    {t('vote.noQuorumRequired') || 'Δεν απαιτείται απαρτία'}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    {t('proposal.participation', { pct: participationPercent, quorum: quorumPercent })}
                  </div>
                  <div className={results.meetsQuorum ? 'text-green-700 font-medium' : 'text-amber-700 font-medium'}>
                    {results.meetsQuorum ? t('vote.quorumMet') : t('vote.quorumNotMet')}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="text-xs text-center text-muted-foreground">
            {t('proposal.totalVotes', { count: results.total })}
          </div>
        </div>
        )}

        {isVoting && userIsAuthor && (
          <div className="flex justify-center pt-2 border-t">
            <Button onClick={handleFinalize} disabled={finalizing} data-testid="vote-finalize">
              {finalizing ? t('general.loading') : t('proposal.finalize')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
