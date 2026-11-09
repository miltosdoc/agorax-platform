/**
 * Removing members — the UI for shared/member-removal.ts.
 *
 *  - <RemoveMemberButton>  on a member's row: "Remove" (managed, admins) or
 *                          "Start removal vote" (autonomous, any member).
 *                          Both ask for a reason in a dialog.
 *  - <RemovalPanel>        at the top of the Members tab: open votes with
 *                          Yes/No, the person's reply, and the removal log.
 */

import { useCallback, useEffect, useState } from 'react';
import { UserMinus, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import {
  REJOIN_COOLDOWN_DAYS, REMOVAL_REASON_MAX, REMOVAL_REASON_MIN, REMOVAL_RESPONSE_MAX, REMOVAL_VOTE_DAYS,
} from '@shared/member-removal';

type UserLabel = { id: number; username: string; name: string | null; profilePicture: string | null } | null;

export interface RemovalVoteView {
  id: number;
  status: 'open' | 'passed' | 'rejected' | 'cancelled';
  reason: string;
  targetResponse: string | null;
  target: UserLabel;
  openedBy: UserLabel;
  openedByMe: boolean;
  isAboutMe: boolean;
  yes: number;
  no: number;
  eligible: number;
  quorum: number;
  myChoice: 'yes' | 'no' | null;
  canVote: boolean;
  closesAt: string;
  decidedAt: string | null;
  createdAt: string;
}

export interface RemovalLogEntry {
  id: number;
  user: UserLabel;
  removedBy: UserLabel;
  byVote: boolean;
  reason: string;
  createdAt: string;
  rejoinAfter: string;
  lifted: boolean;
  blocking: boolean;
}

export interface RemovalOverview {
  votes: RemovalVoteView[];
  removals: RemovalLogEntry[];
}

const label = (u: UserLabel) => (u ? u.name || `@${u.username}` : '—');
const errorText = (e: any) => e?.response?.data?.message || String(e?.message || e);
const day = (iso: string) => new Date(iso).toLocaleDateString();

/** Loads the overview for members; null for non-members. */
export function useRemovalOverview(communityId: number | string | undefined, enabled: boolean) {
  const [data, setData] = useState<RemovalOverview | null>(null);
  const reload = useCallback(() => {
    if (!communityId || !enabled) { setData(null); return; }
    api.get<RemovalOverview>(`/api/communities/${communityId}/removals`)
      .then((r) => setData(r.data))
      .catch(() => setData(null));
  }, [communityId, enabled]);
  useEffect(reload, [reload]);
  return { data, reload };
}

// ─── Remove button + reason dialog ──────────────────────────────────────────

export function RemoveMemberButton({
  communityId, member, mode, onDone,
}: {
  communityId: number | string;
  member: { userId: number; username: string; name: string | null };
  mode: 'admin' | 'vote';
  onDone: (removed: boolean) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = member.name || `@${member.username}`;
  const tooShort = reason.trim().length < REMOVAL_REASON_MIN;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'admin') {
        await api.post(`/api/communities/${communityId}/members/${member.userId}/remove`, { reason: reason.trim() });
        onDone(true);
      } else {
        await api.post(`/api/communities/${communityId}/removal-votes`, { userId: member.userId, reason: reason.trim() });
        onDone(false);
      }
      setOpen(false);
      setReason('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
        data-testid={`remove-member-${member.userId}`}
        title={mode === 'admin' ? t('removal.remove') : t('removal.start_vote')}
      >
        <UserMinus className="h-4 w-4 sm:mr-1" />
        <span className="hidden sm:inline">{mode === 'admin' ? t('removal.remove') : t('removal.start_vote')}</span>
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === 'admin' ? t('removal.dialog_title_admin', { name: who }) : t('removal.dialog_title_vote', { name: who })}
            </DialogTitle>
            <DialogDescription>
              {mode === 'admin'
                ? t('removal.dialog_help_admin', { name: who, days: REJOIN_COOLDOWN_DAYS })
                : t('removal.dialog_help_vote', { days: REMOVAL_VOTE_DAYS, cooldown: REJOIN_COOLDOWN_DAYS })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="removal-reason">{t('removal.reason_label')}</label>
            <Textarea
              id="removal-reason"
              value={reason}
              maxLength={REMOVAL_REASON_MAX}
              rows={4}
              placeholder={t('removal.reason_placeholder')}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('removal.reason_note')}</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={submit} disabled={busy || tooShort}>
              {busy ? t('common.loading') : mode === 'admin' ? t('removal.confirm_admin') : t('removal.confirm_vote')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Votes + log ────────────────────────────────────────────────────────────

function VoteCard({ communityId, vote, onChange }: { communityId: number | string; vote: RemovalVoteView; onChange: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState(vote.targetResponse ?? '');
  const [saved, setSaved] = useState(false);
  const name = label(vote.target);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await fn(); onChange(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <li className="space-y-3 rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {vote.isAboutMe ? t('removal.vote_about_you') : t('removal.vote_title', { name })}
        </p>
        <span className="text-xs text-muted-foreground">{t('removal.closes', { date: day(vote.closesAt) })}</span>
      </div>
      <div className="text-sm">
        <p className="text-muted-foreground">{t('removal.reason_by', { name: label(vote.openedBy) })}</p>
        <p className="whitespace-pre-wrap">{vote.reason}</p>
      </div>

      {vote.isAboutMe ? (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`response-${vote.id}`}>{t('removal.your_response')}</label>
          <Textarea
            id={`response-${vote.id}`}
            value={response}
            rows={3}
            maxLength={REMOVAL_RESPONSE_MAX}
            placeholder={t('removal.response_placeholder')}
            onChange={(e) => { setResponse(e.target.value); setSaved(false); }}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={busy || response === (vote.targetResponse ?? '')}
              onClick={() => act(async () => {
                await api.put(`/api/communities/${communityId}/removal-votes/${vote.id}/response`, { text: response });
                setSaved(true);
              })}>
              {t('removal.save_response')}
            </Button>
            {saved && <span className="text-sm text-muted-foreground">{t('removal.saved')}</span>}
          </div>
        </div>
      ) : vote.targetResponse ? (
        <div className="rounded-lg border bg-background p-3 text-sm">
          <p className="text-muted-foreground">{t('removal.response_from', { name })}</p>
          <p className="whitespace-pre-wrap">{vote.targetResponse}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('removal.no_response_yet', { name })}</p>
      )}

      <div className="text-sm">
        <p>
          {t('removal.tally', { yes: vote.yes, no: vote.no, eligible: vote.eligible })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('removal.rule', { quorum: vote.quorum })}
        </p>
      </div>

      {vote.canVote && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={vote.myChoice === 'yes' ? 'destructive' : 'outline'} disabled={busy}
            onClick={() => act(() => api.post(`/api/communities/${communityId}/removal-votes/${vote.id}/ballot`, { choice: 'yes' }))}>
            {t('removal.vote_yes')}
          </Button>
          <Button size="sm" variant={vote.myChoice === 'no' ? 'default' : 'outline'} disabled={busy}
            onClick={() => act(() => api.post(`/api/communities/${communityId}/removal-votes/${vote.id}/ballot`, { choice: 'no' }))}>
            {t('removal.vote_no')}
          </Button>
          {vote.myChoice && <span className="text-xs text-muted-foreground">{t('removal.you_voted', { choice: t(vote.myChoice === 'yes' ? 'removal.vote_yes' : 'removal.vote_no') })}</span>}
          {vote.openedByMe && (
            <Button size="sm" variant="ghost" disabled={busy} className="ml-auto"
              onClick={() => { if (window.confirm(t('removal.withdraw_confirm'))) act(() => api.delete(`/api/communities/${communityId}/removal-votes/${vote.id}`)); }}>
              {t('removal.withdraw')}
            </Button>
          )}
        </div>
      )}
      {!vote.canVote && !vote.isAboutMe && (
        <p className="text-xs text-muted-foreground">{t('removal.cannot_vote')}</p>
      )}
      <p className="text-xs text-muted-foreground">{t('removal.secret_note')}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </li>
  );
}

export function RemovalPanel({
  communityId, overview, canLift, onChange,
}: {
  communityId: number | string;
  overview: RemovalOverview | null;
  canLift: boolean;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [showLog, setShowLog] = useState(false);
  if (!overview) return null;
  const open = overview.votes.filter((v) => v.status === 'open');
  const finished = overview.votes.filter((v) => v.status === 'rejected');
  const { removals } = overview;
  if (open.length === 0 && finished.length === 0 && removals.length === 0) return null;

  const lift = async (id: number) => {
    if (!window.confirm(t('removal.lift_confirm'))) return;
    try {
      await api.post(`/api/communities/${communityId}/removals/${id}/lift`);
      onChange();
    } catch (e) {
      alert(errorText(e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserMinus className="h-5 w-5" />{t('removal.panel_title')}</CardTitle>
        {open.length > 0 && <CardDescription>{t('removal.panel_open', { count: open.length })}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {open.length > 0 && (
          <ul className="space-y-3">
            {open.map((v) => <VoteCard key={v.id} communityId={communityId} vote={v} onChange={onChange} />)}
          </ul>
        )}

        {(removals.length > 0 || finished.length > 0) && (
          <div>
            <button type="button" className="flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setShowLog((s) => !s)} aria-expanded={showLog}>
              {showLog ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {t('removal.log_title', { count: removals.length })}
            </button>
            {showLog && (
              <ul className="mt-2 divide-y text-sm">
                {removals.map((r) => (
                  <li key={`r${r.id}`} className="space-y-1 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{label(r.user)}</span>
                      <span className="text-muted-foreground">
                        {r.byVote ? t('removal.log_by_vote', { date: day(r.createdAt) }) : t('removal.log_by_admin', { name: label(r.removedBy), date: day(r.createdAt) })}
                      </span>
                      {r.blocking
                        ? <Badge variant="secondary">{t('removal.log_until', { date: day(r.rejoinAfter) })}</Badge>
                        : <Badge variant="outline">{r.lifted ? t('removal.log_lifted') : t('removal.log_can_rejoin')}</Badge>}
                      {canLift && r.blocking && (
                        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => lift(r.id)}>{t('removal.lift')}</Button>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-muted-foreground">{r.reason}</p>
                  </li>
                ))}
                {finished.map((v) => (
                  <li key={`v${v.id}`} className="space-y-1 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{label(v.target)}</span>
                      <span className="text-muted-foreground">{t('removal.log_vote_failed', { yes: v.yes, no: v.no, date: day(v.decidedAt ?? v.closesAt) })}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-muted-foreground">{v.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
