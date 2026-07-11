import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { PhaseCountdown } from '@/components/ui/PhaseCountdown';
import { BallotReceipt } from '@/components/ceremony/BallotReceipt';
import { BroadcastResults } from '@/components/ceremony/BroadcastResults';
import {
  ThumbsUp,
  ThumbsDown,
  MinusCircle,
  CheckCircle2,
  XCircle,
  Vote,
  Lock,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import {
  requestAnonymousBallot,
  castPendingBallot,
  getPendingBallot,
  clearPendingBallot,
  getReceipt,
  type AnonymousReceipt,
  type AnonymousChoice,
  type PendingBallot,
} from '@/lib/anonymous-vote';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type VoteChoice = 'yes' | 'no' | 'abstain';

/** An option on an option ballot (deliberation track). Ids look like
 *  'final', 'counter_12', 'status_quo'. */
export interface BallotOption {
  id: string;
  label: string;
}

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
  /** 'yes' | 'no' | 'abstain' for classic ballots, an option id otherwise. */
  userVote: string | null;
  /** Non-null ⇒ single-choice option ballot instead of yes/no/abstain. */
  ballotOptions?: BallotOption[] | null;
  /** Per-option tallies (option ballots; null while sealed). */
  counts?: Record<string, number> | null;
  /** Leading/winning option id (option ballots). */
  winner?: string | null;
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
  votingMode?: string;
  phaseDeadline?: string | null;
  /** The proposal's option-ballot definition, if the caller has it. Also
   *  arrives with the vote-results payload, so this prop is optional. */
  ballotOptions?: BallotOption[] | null;
  onVoteResultsChange?: (results: VoteResults) => void;
  onProposalAdvanced?: (newStatus: string) => void;
}

export default function VotePanel({
  proposalId,
  proposalStatus,
  proposalAuthorId,
  votingMode = 'pseudonymous',
  phaseDeadline,
  ballotOptions: ballotOptionsProp,
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
  // Anonymous mode: a local receipt + a confirm modal before the one-shot vote.
  const [localReceipt, setLocalReceipt] = useState<AnonymousReceipt | undefined>(() => getReceipt(proposalId));
  const [pendingAnon, setPendingAnon] = useState<AnonymousChoice | null>(null);
  // A blind-signed ballot waiting out the anonymity delay (see
  // anonymous-vote.ts). Survives reloads via localStorage; cast
  // automatically the moment it matures while this panel is mounted.
  const [pendingBallot, setPendingBallot] = useState<PendingBallot | undefined>(() => getPendingBallot(proposalId));
  const [ballotSecondsLeft, setBallotSecondsLeft] = useState<number | null>(null);
  // Option ballots: the currently highlighted (not yet cast) option, plus
  // the lazily fetched full texts from /final-review.
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [finalReview, setFinalReview] = useState<{
    finalText: string | null;
    alternatives: Array<{ optionId: string; text: string }>;
  } | null>(null);
  const [finalReviewLoading, setFinalReviewLoading] = useState(false);
  const [finalReviewError, setFinalReviewError] = useState(false);

  const isAnonymous = votingMode === 'anonymous';
  const isVoting = proposalStatus === 'voting';
  const isClosed = proposalStatus === 'decided' || proposalStatus === 'archived';
  // A private backend never reveals `userVote`, but still reports `hasVoted`.
  // In anonymous mode the server NEVER reports hasVoted (it can't know);
  // use the localStorage receipt instead.
  const userVoted = isAnonymous
    ? !!localReceipt
    : (results.hasVoted ?? results.userVote !== null);
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

  // Option ballots: null ⇒ classic yes/no/abstain. Prefer the prop (the
  // caller may have the proposal), fall back to the vote-results payload.
  const ballotOptions = ballotOptionsProp ?? results.ballotOptions ?? null;
  const isOptionBallot = !!ballotOptions && ballotOptions.length > 0;

  /** Human label for any choice id — classic trio or ballot option. */
  const optionLabel = (choice: string | null): string => {
    if (!choice) return '';
    if (choice === 'yes') return t('proposal.support');
    if (choice === 'no') return t('proposal.oppose');
    if (choice === 'abstain') return t('proposal.abstain');
    return ballotOptions?.find(o => o.id === choice)?.label ?? choice;
  };

  // Which options carry a full text: 'final' ⇒ proposal.finalText,
  // 'counter_<id>' ⇒ the amendment's restyled text. 'status_quo' has none.
  const optionHasText = (id: string) => id === 'final' || id.startsWith('counter_');
  const optionFullText = (id: string): string | null => {
    if (!finalReview) return null;
    if (id === 'final') return finalReview.finalText ?? null;
    if (id.startsWith('counter_')) {
      return finalReview.alternatives.find(a => a.optionId === id)?.text ?? null;
    }
    return null;
  };
  const ensureFinalReview = () => {
    if (finalReview || finalReviewLoading) return;
    setFinalReviewLoading(true);
    setFinalReviewError(false);
    api
      .get<{ finalText: string | null; alternatives: Array<{ optionId: string; text: string }> }>(
        `/api/proposals/${proposalId}/final-review`,
      )
      .then((resp) => setFinalReview(resp.data))
      .catch(() => setFinalReviewError(true))
      .finally(() => setFinalReviewLoading(false));
  };

  const handleCastVote = async (choice: string) => {
    if (voting) return;
    // Anonymous proposals: open the confirm modal. The actual cast runs
    // in confirmAnonymousVote() so the voter sees the one-shot warning.
    if (isAnonymous) {
      setPendingAnon(choice);
      return;
    }
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

  const confirmAnonymousVote = async () => {
    if (!pendingAnon || voting) return;
    const choice = pendingAnon;
    setPendingAnon(null);
    setVoting(true);
    setError(null);
    try {
      // Phase 1: obtain the blind-signed ballot. It matures after the
      // anonymity delay and is cast automatically by the effect below.
      const ballot = await requestAnonymousBallot(proposalId, choice);
      setPendingBallot(ballot);
    } catch (e) {
      const message = e instanceof Error ? e.message : t('proposal.voteFailed');
      setError(message);
    } finally {
      setVoting(false);
    }
  };

  // Countdown + auto-cast for a pending anonymous ballot. Ticks every
  // second; when the ballot matures it is cast without user action.
  useEffect(() => {
    if (!pendingBallot) {
      setBallotSecondsLeft(null);
      return;
    }
    let casting = false;
    const tick = async () => {
      const msLeft = pendingBallot.minCastTime - Date.now();
      setBallotSecondsLeft(Math.max(0, Math.ceil(msLeft / 1000)));
      if (msLeft <= 0 && !casting) {
        casting = true;
        try {
          const receipt = await castPendingBallot(pendingBallot);
          setLocalReceipt(receipt);
          setPendingBallot(undefined);
          await refresh();
        } catch (e) {
          casting = false; // server may still say "not yet" — retry next tick
          const message = e instanceof Error ? e.message : t('proposal.voteFailed');
          // A double-spend rejection means the ballot was already counted
          // (e.g. cast from another tab) — drop it quietly.
          if (/already|duplicate/i.test(message)) {
            clearPendingBallot(proposalId);
            setPendingBallot(undefined);
            await refresh();
          } else {
            setError(message);
          }
        }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBallot, proposalId]);

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

  // Anonymous mode is one-shot — no "change vote" path. For pseudonymous,
  // members can re-cast and that flips superseded_by_id server-side.
  const showVoteButtons = isVoting && (!userVoted || (changing && !isAnonymous));

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
        {/* Mode badge — always visible so the voter sees the privacy property */}
        <div className="flex items-center gap-2 text-xs">
          {isAnonymous ? (
            <Badge variant="default" className="gap-1 bg-yper hover:bg-yper text-white border-transparent">
              <ShieldCheck className="w-3 h-3" />
              {t('vote.anonymousMode') || 'Ανώνυμη / Anonymous'}
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <Eye className="w-3 h-3" />
              {t('vote.pseudonymousMode') || 'Ψευδώνυμη / Pseudonymous'}
            </Badge>
          )}
          <span className="text-muted-foreground">
            {isAnonymous
              ? (t('vote.anonymousModeHint') || 'Η ψήφος σας δεν συνδέεται με την ταυτότητά σας — ούτε από τον διαχειριστή. Μία ψήφος, χωρίς δυνατότητα αλλαγής.')
              : (t('vote.pseudonymousModeHint') || 'Η ψήφος σας αποθηκεύεται μαζί με την ταυτότητά σας. Μπορείτε να την αλλάξετε όσο η ψηφοφορία είναι ανοιχτή.')}
          </span>
        </div>

        {isVoting && phaseDeadline && (
          <PhaseCountdown
            deadline={phaseDeadline}
            label="Χρόνος ψηφοφορίας:"
          />
        )}

        {isVoting && (
          <div className="rounded-md border border-yper/30 bg-yper-wash px-3 py-2 text-xs text-yper">
            {t('vote.phaseHint') || 'Φάση: Ψηφοφορία. Η δεσμευτική ψήφος γίνεται στο τελικό κείμενο. Όταν ο συγγραφέας ή ένας διαχειριστής οριστικοποιήσει την ψηφοφορία, η πρόταση μεταβαίνει στο «Αποφασίστηκε» ή στο «Αρχειοθετήθηκε» (αν δεν καλύφθηκε η απαρτία ή δεν υπήρξε αποφασιστική ψήφος).'}
          </div>
        )}
        {!user && isVoting && (
          <div className="p-3 bg-muted rounded text-sm text-muted-foreground">
            {t('auth.loginToVote')}
          </div>
        )}

        {/* Pending anonymous ballot: the anonymity delay is counting down.
            The vote is cast automatically when the ballot matures. */}
        {pendingBallot && !localReceipt && (
          <div className="rounded-md border border-blue-200 bg-blue-50/70 px-4 py-3 space-y-1" data-testid="pending-ballot">
            <div className="text-sm font-medium text-blue-900">
              ✓ {t('vote.ballotPendingTitle')}
            </div>
            <p className="text-xs text-blue-900/80">{t('vote.ballotPendingBody')}</p>
            {ballotSecondsLeft === 0 && (
              <div className="text-sm text-blue-900">{t('vote.ballotCasting')}</div>
            )}
          </div>
        )}

        {showVoteButtons && user && !pendingBallot && isOptionBallot && ballotOptions && (
          <div>
            <div className="text-sm text-muted-foreground mb-3">
              {userVoted ? t('vote.changeYourVote') : t('vote.castYourVote')}
            </div>
            <div role="radiogroup" aria-label={t('vote.panelTitle')} className="space-y-2">
              {ballotOptions.map((opt) => {
                const selected = (selectedOption ?? results.userVote) === opt.id;
                return (
                  <div
                    key={opt.id}
                    className={`rounded-md border transition-colors ${
                      selected ? 'border-yper bg-yper-wash' : 'hover:border-ink-faint'
                    }`}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className="flex w-full items-center gap-3 p-3 text-left disabled:opacity-60"
                      onClick={() => setSelectedOption(opt.id)}
                      disabled={voting}
                      data-testid={`vote-option-${opt.id}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          selected ? 'border-yper' : 'border-muted-foreground'
                        }`}
                      >
                        {selected && <span className="h-2 w-2 rounded-full bg-yper" />}
                      </span>
                      <span className="flex-1 text-sm font-medium">{opt.label}</span>
                      {results.userVote === opt.id && (
                        <Badge variant="secondary" className="shrink-0">
                          {t('vote.youVoted')}
                        </Badge>
                      )}
                    </button>
                    {optionHasText(opt.id) && (
                      <details
                        className="px-3 pb-3"
                        onToggle={(e) => {
                          if ((e.currentTarget as HTMLDetailsElement).open) ensureFinalReview();
                        }}
                      >
                        <summary className="cursor-pointer select-none text-xs text-muted-foreground underline-offset-2 hover:underline">
                          {t('vote.option_fullText') || 'Δείτε το πλήρες κείμενο'}
                        </summary>
                        <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap border-l-2 pl-3 text-sm text-muted-foreground">
                          {finalReviewLoading
                            ? t('general.loading')
                            : finalReviewError
                            ? t('vote.option_textLoadFailed') || 'Δεν ήταν δυνατή η φόρτωση του κειμένου.'
                            : optionFullText(opt.id) ??
                              (t('vote.option_noText') || 'Δεν υπάρχει διαθέσιμο κείμενο.')}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
            <Button
              className="mt-3 w-full gap-2"
              onClick={() => {
                const choice = selectedOption ?? results.userVote;
                if (choice) handleCastVote(choice);
              }}
              disabled={voting || !(selectedOption ?? results.userVote)}
              data-testid="vote-option-confirm"
            >
              <Vote className="w-4 h-4" />
              {voting ? t('general.loading') : t('vote.option_confirm') || 'Επιβεβαίωση ψήφου'}
            </Button>
            {changing && (
              <Button variant="ghost" size="sm" onClick={() => setChanging(false)} className="mt-2">
                {t('general.cancel')}
              </Button>
            )}
          </div>
        )}

        {showVoteButtons && user && !pendingBallot && !isOptionBallot && (
          <div>
            <div className="text-sm text-muted-foreground mb-3">
              {userVoted ? t('vote.changeYourVote') : t('vote.castYourVote')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Button
                variant={results.userVote === 'yes' ? 'default' : 'outline'}
                className={
                  results.userVote === 'yes'
                    ? 'gap-2 bg-yper hover:bg-yper text-white border-transparent'
                    : 'gap-2 border-yper text-yper hover:bg-yper-wash'
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
                    ? 'gap-2 bg-kata hover:bg-kata text-white border-transparent'
                    : 'gap-2 border-kata text-kata hover:bg-kata-wash'
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

        {/* Ceremony I — the ballot receipt (anonymous voter, one-shot). */}
        {userVoted && !showVoteButtons && isAnonymous && localReceipt && (
          <BallotReceipt proposalId={proposalId}
            choice={localReceipt.choice}
            rowHash={localReceipt.rowHash}
            castAt={localReceipt.castAt}
            ballotOptions={ballotOptions}
          />
        )}

        {/* Pseudonymous confirmation — quiet line, re-cast allowed while voting. */}
        {userVoted && !showVoteButtons && !(isAnonymous && localReceipt) && (
          <div className="flex items-center justify-between p-3 rounded border bg-muted/30">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-yper" />
              <span>
                {results.userVote ? (
                  <>
                    {t('vote.youVoted')}{' '}
                    <span className="font-medium">{optionLabel(results.userVote)}</span>
                  </>
                ) : (
                  t('vote.ballotCast')
                )}
              </span>
            </div>
            {isVoting && !isAnonymous && (
              <Button variant="outline" size="sm" onClick={() => setChanging(true)} data-testid="vote-change">
                {t('vote.changeVote')}
              </Button>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-kata-wash border border-kata/30 rounded text-sm text-kata">
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
          /* Ceremony II — election-night broadcast results. */
          <BroadcastResults
            yes={results.yes}
            no={results.no}
            abstain={results.abstain}
            total={results.total}
            participationPct={results.participationPct}
            quorumPct={results.minParticipationPct}
            meetsQuorum={results.meetsQuorum}
            live={isVoting}
            options={
              isOptionBallot && ballotOptions
                ? ballotOptions.map((o) => ({
                    id: o.id,
                    label: o.label,
                    count: results.counts?.[o.id] ?? 0,
                  }))
                : undefined
            }
            winner={
              isOptionBallot && isClosed && results.total > 0 ? results.winner ?? null : null
            }
          />
        )}

        {isVoting && userIsAuthor && (
          <div className="flex justify-center pt-2 border-t">
            <Button onClick={handleFinalize} disabled={finalizing} data-testid="vote-finalize">
              {finalizing ? t('general.loading') : t('proposal.finalize')}
            </Button>
          </div>
        )}
      </CardContent>

      {/* Anonymous mode confirmation — one-shot, no undo. */}
      <AlertDialog open={pendingAnon !== null} onOpenChange={open => !open && setPendingAnon(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('vote.anonConfirmTitle') || 'Επιβεβαίωση ανώνυμης ψήφου / Confirm anonymous vote'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {t('vote.anonConfirmBody') ||
                  'Η ψήφος σας θα κατατεθεί ανώνυμα. Δεν θα μπορείτε να την αλλάξετε ή να την ανακτήσετε εκτός αυτού του φυλλομετρητή.'}
              </span>
              <span className="block">
                {t('vote.anonConfirmChoice') || 'Επιλογή:'}{' '}
                <span className="font-semibold">{optionLabel(pendingAnon)}</span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voting}>{t('general.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAnonymousVote} disabled={voting}>
              {voting ? t('general.loading') : (t('vote.anonConfirmAction') || 'Καταθέτω την ψήφο')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
