/**
 * Job Handlers Registration
 * 
 * Registers all job type handlers and starts the background worker.
 * Import this module during server startup to wire up the job queue.
 */

import { registerHandler, startWorker, enqueueJob, enqueueSortitionTimeout, type JobPayload } from './job-queue';
import { handleSortitionCompletion, transitionToValidation } from './proposal-state-machine';
import { checkSortitionTimeout, completeSortitionBody, replaceNonRespondingMembers } from './sortition-timeout';
import { db } from '../db';
import { sortitionBodies, proposals, proposalAmendments } from '@shared/schema';
import { and, eq, lt, isNotNull, inArray, sql } from 'drizzle-orm';
import {
  cleanupEmailDeliveries,
  deliverOptionalEmail,
  type OptionalEmailJob,
} from './email-service';

// ─── Handler: structure_proposal ────────────────────────────────────────────

/**
 * Handle the `structure_proposal` job.
 *
 * Nothing enqueues this any more: /api/proposals/:id/submit validates inline
 * so it can hand the score back in its own response, and a second validator
 * racing it was overwriting the route's routing decision. The handler stays
 * registered so any job still sitting in the queue from before that change
 * drains instead of erroring — `transitionToValidation` returns null without
 * touching a proposal that has already been routed.
 */
async function handleStructureProposal(payload: JobPayload): Promise<void> {
  const { proposalId } = payload.data as { proposalId: number };
  if (typeof proposalId !== 'number') {
    throw new Error(`structure_proposal: missing or invalid proposalId in payload`);
  }

  await transitionToValidation(proposalId);
}

// ─── Handler: send_notification ─────────────────────────────────────────────

async function handleSendNotification(payload: JobPayload): Promise<void> {
  const { userId, type, message } = payload.data;
  // TODO: Actually persist to notifications table and push via WebSocket/email
}

// ─── Handler: create_sortition ──────────────────────────────────────────────

async function handleCreateSortition(payload: JobPayload): Promise<void> {
  const { communityId, size, proposalId, purpose } = payload.data;

  const { createSortitionBody } = await import('./sortition');
  const { storage } = await import('../storage');

  try {
    // createSortitionBody handles selection + DB insert in one call
    await createSortitionBody(
      communityId,
      size,
      storage,
      purpose,
      proposalId ?? undefined,
    );
  } catch (err: any) {
    // AI fallback: a synthesis jury that cannot form (e.g. the community is
    // too small to have eligible members) must not deadlock the proposal in
    // sortition_synthesis. The AI merge synthesizes instead and the vote
    // opens — same outcome as a jury that never responds.
    if (purpose !== 'text_synthesis' || typeof proposalId !== 'number') throw err;
    console.warn(`[sortition] jury could not form for proposal ${proposalId} (${err?.message}) — falling back to AI synthesis`);
    const proposal = await storage.getProposal(proposalId);
    if (!proposal || proposal.status !== 'sortition_synthesis') return;
    const { prepareFinalReview } = await import('./ai-merger');
    try {
      await prepareFinalReview(proposalId);
    } catch { /* the transition side effect re-tries the merge */ }
    const { transitionProposal, triggerSideEffects } = await import('./proposal-state-machine');
    const updated = await transitionProposal(proposal as any, 'voting', storage);
    await triggerSideEffects('sortition_synthesis', 'voting', updated);
  }
}

// ─── Handler: recalculate_score ─────────────────────────────────────────────

async function handleRecalculateScore(payload: JobPayload): Promise<void> {
  const { communityId } = payload.data;
  if (typeof communityId !== 'number') return;
  const { calculateDemocracyScore } = await import('./democracy-score');
  const { storage } = await import('../storage');
  const { communityRepo } = await import('../storage');
  try {
    const result = await calculateDemocracyScore(communityId, storage as any);
    await communityRepo.updateCommunity(communityId, { democracyScore: String(result.score) });
  } catch {
    // Swallow — recompute is best-effort; next trigger will retry.
  }
}

// ─── Handler: cleanup_expired ───────────────────────────────────────────────

const NOTIFICATION_RETENTION_DAYS = 30;

/**
 * Nothing ever deleted a notification, so every account accumulated them
 * without bound — 3,450 rows across 103 users before this landed. Read
 * notifications past the retention window carry no remaining value: the
 * user has seen them and the list only gets harder to scan.
 *
 * Unread ones are left alone at any age; deleting something a user has not
 * seen would hide it rather than tidy it.
 */
async function handleCleanupExpired(_payload: JobPayload): Promise<void> {
  const deleted = await db.execute(sql`
    DELETE FROM sortition_notifications
    WHERE read = true
      AND created_at < NOW() - (${NOTIFICATION_RETENTION_DAYS} || ' days')::interval
    RETURNING id
  `);
  if (deleted.rows.length > 0) {
    console.log(`[cleanup] removed ${deleted.rows.length} read notifications older than ${NOTIFICATION_RETENTION_DAYS}d`);
  }

  // Spent reset links. A used or expired token can no longer do anything,
  // but the row still ties an account to the moment someone asked for it —
  // and to the IP they asked from. There is no reason to keep either.
  const resets = await db.execute(sql`
    DELETE FROM password_reset_tokens
    WHERE used_at IS NOT NULL OR expires_at < NOW() - INTERVAL '24 hours'
    RETURNING id
  `);
  if (resets.rows.length > 0) {
    console.log(`[cleanup] removed ${resets.rows.length} spent password reset tokens`);
  }

  // Rate-limit counters past every window they could still be counted in.
  await db.execute(sql`
    DELETE FROM password_reset_requests
    WHERE requested_at < NOW() - INTERVAL '24 hours'
  `);

  // Spent confirmation links. Kept a week past expiry rather than dropped at
  // expiry, so "this link is dead" and "this link never existed" stay the
  // same answer for as long as anyone is plausibly still clicking one.
  const verifications = await db.execute(sql`
    DELETE FROM email_verification_tokens
    WHERE used_at IS NOT NULL OR expires_at < NOW() - INTERVAL '7 days'
    RETURNING id
  `);
  if (verifications.rows.length > 0) {
    console.log(`[cleanup] removed ${verifications.rows.length} spent email verification tokens`);
  }

  const mails = await cleanupEmailDeliveries();
  if (mails > 0) {
    console.log(`[cleanup] removed ${mails} email delivery records`);
  }
}

// ─── Handler: send_email ────────────────────────────────────────────────────

/**
 * One optional notification email for one member.
 *
 * The job payload carries no address and no rendered body — only ids and the
 * text that goes in the subject line. Preferences and address are read inside
 * deliverOptionalEmail() at the moment of sending, so a member who switched
 * the category off after the job was queued gets nothing.
 */
async function handleSendEmail(payload: JobPayload): Promise<void> {
  await deliverOptionalEmail(payload.data as unknown as OptionalEmailJob);
}

// ─── Handler: sortition_timeout ─────────────────────────────────────────────

async function handleSortitionTimeout(payload: JobPayload): Promise<void> {
  
  // Query all active sortition bodies
  const activeBodies = await db
    .select()
    .from(sortitionBodies)
    .where(eq(sortitionBodies.status, 'active'));
  
  let processed = 0;
  
  for (const body of activeBodies) {
    const isTimedOut = await checkSortitionTimeout(body.id);
    
    if (isTimedOut) {
      
      // First, try to replace non-responders
      const nonResponding = await replaceNonRespondingMembers(body.id, body.communityId);
      
      // Then complete the body and handle the proposal transition
      if (body.proposalId) {
        await handleSortitionCompletion(body.id, body.proposalId);
      } else {
        await completeSortitionBody(body.id);
      }
      
      processed++;
    }
  }
  
}

// ─── Handler: refresh_final_text ────────────────────────────────────────────

/**
 * Live re-merge during the deliberation phase: recompute the AI final text
 * (and restyled counter-proposal alternatives) whenever an amendment
 * decision or vote lands, so the community watches the vote-ready text
 * evolve instead of meeting it for the first time on the ballot.
 */
async function handleRefreshFinalText(payload: JobPayload): Promise<void> {
  const { proposalId } = payload.data as { proposalId: number };
  if (typeof proposalId !== 'number') return;
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  // final_review is included: judging an amendment there has to move the
  // merged text, or the decision would be recorded and never reach the
  // ballot — final_review->voting only freezes the options, it does not
  // re-merge. Acceptance in final_review opens the vote, so there is no
  // window where a re-merge can rewrite text the author already signed off.
  if (!proposal || !['community_signal', 'final_review'].includes(proposal.status)) return;
  if ((proposal as any).track === 'vote') return;
  const { prepareFinalReview } = await import('./ai-merger');
  await prepareFinalReview(proposalId);
}

// ─── Handler: phase_auto_advance ─────────────────────────────────────────────

/**
 * Auto-advance proposals whose phase deadline has passed.
 * Runs periodically. Handles author_review, community_signal, and voting.
 */
async function handlePhaseAutoAdvance(_payload: JobPayload): Promise<void> {
  const now = new Date();

  // Find proposals in timed phases where deadline has passed.
  const expired = await db
    .select()
    .from(proposals)
    .where(
      and(
        inArray(proposals.status, ['author_review', 'community_signal', 'final_review', 'voting']),
        isNotNull(proposals.phaseDeadline),
        lt(proposals.phaseDeadline, now),
      ),
    );

  for (const proposal of expired) {
    try {
      const { transitionProposal, triggerSideEffects } = await import('./proposal-state-machine');
      const { storage } = await import('../storage');

      if (proposal.status === 'author_review') {
        const updated = await transitionProposal(proposal as any, 'community_signal', storage);
        await triggerSideEffects('author_review', 'community_signal', updated);

      } else if (proposal.status === 'community_signal') {
        // The final text merges LIVE throughout the phase (refresh_final_text
        // jobs), but the deadline used to open the vote the same second it
        // passed. An author who had not finished judging amendments lost them
        // all, so the ballot carried text the deliberation never touched —
        // reported by three users, and the reason final_review is back in the
        // flow: a short window where the merged text is visible, amendments
        // can still be judged, and silence accepts what the merge produced.
        // (Sortition synthesis remains reachable via manual /transition.)
        const updated = await transitionProposal(proposal as any, 'final_review', storage);
        await triggerSideEffects('community_signal', 'final_review', updated);

      } else if (proposal.status === 'final_review') {
        // Author silence = acceptance of the AI-merged text as-is.
        const updated = await transitionProposal(proposal as any, 'voting', storage);
        await triggerSideEffects('final_review', 'voting', updated);

      } else if (proposal.status === 'voting') {
        // Auto-finalize the vote
        const { getVotingBackend } = await import('../voting');
        const backend = getVotingBackend();
        await backend.closeAndTally({ proposalId: proposal.id });
        const view = await backend.getVoterView({ proposalId: proposal.id });
        const { computeVoteResults } = await import('../routers/proposals');
        const results = await computeVoteResults(proposal as any, view);
        const nextState = results.meetsQuorum && results.hasDecisive ? 'decided' : 'archived';
        const { storage: st } = await import('../storage');
        let updated = await transitionProposal(proposal as any, nextState, st);
        if (results.ballotOptions && nextState === 'decided' && results.winner) {
          updated = await st.updateProposal(proposal.id, { winningOption: results.winner });
        }
        await triggerSideEffects('voting', nextState, updated);
      }
    } catch (err) {
      // Log and continue — one failure shouldn't block others.
      console.error(`[phase_auto_advance] failed for proposal ${proposal.id}:`, err);
    }
  }

  await rescueStalledReviews(now);
}

/**
 * `review` is the one lifecycle phase with no deadline of its own, so the
 * sweep above cannot see it. Validation normally takes ~10–15s; if the
 * process dies mid-flight (or the submit route's LLM catch fires, which
 * leaves the row in `review` for a "manual handling" path that does not
 * exist), the proposal sits there forever.
 *
 * Fail open, consistently with an unavailable quality gate: after the grace
 * window, send it into deliberation and let members judge it.
 */
const REVIEW_GRACE_MS = 15 * 60_000;

async function rescueStalledReviews(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - REVIEW_GRACE_MS);
  const stalled = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.status, 'review'), lt(proposals.updatedAt, cutoff)));

  for (const proposal of stalled) {
    try {
      const { transitionProposal, triggerSideEffects } = await import('./proposal-state-machine');
      const { storage } = await import('../storage');
      if (!proposal.llmFeedback) {
        await storage.updateProposal(proposal.id, {
          llmFeedback:
            'Ο αυτόματος έλεγχος ποιότητας δεν ολοκληρώθηκε. Η πρόταση προωθήθηκε σε διαβούλευση '
            + 'για ανθρώπινη αξιολόγηση.',
        });
      }
      const updated = await transitionProposal(proposal as any, 'community_signal', storage);
      await triggerSideEffects('review', 'community_signal', updated);
      console.warn(`[phase_auto_advance] rescued proposal ${proposal.id} stalled in review`);
    } catch (err) {
      console.error(`[phase_auto_advance] review rescue failed for proposal ${proposal.id}:`, err);
    }
  }
}

// ─── Handler: conference_reminder ───────────────────────────────────────────

/**
 * How far ahead of a scheduled meeting the "starts soon" notice goes out.
 * Mirrors EARLY_START_WINDOW_MS in routers/livekit — the meeting becomes
 * joinable-as-live at roughly the moment members are told it's starting.
 */
const CONFERENCE_REMINDER_WINDOW_MS = 15 * 60_000;
/**
 * Past this much overdue we stop reminding. A meeting nobody ever opened
 * shouldn't page the community days later when the sweep finally notices.
 */
const CONFERENCE_REMINDER_STALE_MS = 60 * 60_000;

/**
 * Members were told once, at creation. A meeting announced two weeks out had
 * long scrolled past by the day it ran. Sweep the scheduled rooms coming due
 * and fan out a second notice.
 */
async function handleConferenceReminder(_payload: JobPayload): Promise<void> {
  const { livekitRepo } = await import('../storage');
  const { notifyConferenceScheduled } = await import('./conference-notify');

  const due = await livekitRepo.listDueForReminder(
    CONFERENCE_REMINDER_WINDOW_MS,
    CONFERENCE_REMINDER_STALE_MS,
  );

  for (const room of due) {
    try {
      // Mark first. A duplicate reminder is worse than a missed one, and a
      // crash mid-fan-out would otherwise re-notify everyone on the next pass.
      await livekitRepo.markReminderSent(room.id);
      await notifyConferenceScheduled({
        roomId: room.id,
        communityId: room.communityId,
        sortitionBodyId: room.sortitionBodyId,
        title: room.title,
        scheduledAt: room.scheduledAt ? new Date(room.scheduledAt) : null,
        actionUrl: `/conference/${room.id}`,
        // -1 excludes nobody: unlike the creation notice, the organiser wants
        // reminding about their own meeting too.
      }, -1, 'conference_starting');
    } catch (err) {
      console.error(`[conference_reminder] fan-out failed for room ${room.id}:`, err);
    }
  }
}

// ─── Vote-chain anchoring ───────────────────────────────────────────────────

/**
 * Publish the current head hash of every proposal whose chain moved since its
 * last anchor. Without an external copy of the head, the chain is only
 * tamper-evident to someone who already trusts the server — see
 * docs/VOTE_CHAIN_ANCHORING.md. A no-op when ANCHOR_GITHUB_* is unset.
 */
async function handleChainAnchor(_payload: JobPayload): Promise<void> {
  const { runAnchorSweep, isAnchoringConfigured } = await import('./chain-anchor');
  if (!isAnchoringConfigured()) return;
  const result = await runAnchorSweep();
  if (result.anchored > 0 || result.failed > 0) {
    console.log(`[chain-anchor] anchored=${result.anchored} skipped=${result.skipped} failed=${result.failed}`);
  }
}

// ─── Register all handlers ──────────────────────────────────────────────────

export function registerAllHandlers(): void {
  registerHandler('structure_proposal', handleStructureProposal);
  registerHandler('refresh_final_text', handleRefreshFinalText);
  registerHandler('send_notification', handleSendNotification);
  registerHandler('create_sortition', handleCreateSortition);
  registerHandler('recalculate_score', handleRecalculateScore);
  registerHandler('cleanup_expired', handleCleanupExpired);
  registerHandler('sortition_timeout', handleSortitionTimeout);
  registerHandler('phase_auto_advance', handlePhaseAutoAdvance);
  registerHandler('conference_reminder', handleConferenceReminder);
  registerHandler('send_email', handleSendEmail);
  registerHandler('chain_anchor', handleChainAnchor);
}

// ─── Start the worker ───────────────────────────────────────────────────────

/**
 * Start the job queue worker and sortition timeout scheduler.
 * Returns a cleanup function to stop both.
 */
export function startJobQueue(): () => void {
  // Register handlers first
  registerAllHandlers();
  
  // Start the worker (polls every 5 seconds)
  const stopWorker = startWorker(5000);

  // Phase auto-advance: check every minute for expired phase deadlines.
  const autoAdvanceId = setInterval(() => {
    enqueueJob({ type: 'phase_auto_advance', data: {} }).catch(() => {});
  }, 60_000);

  // Sortition timeout sweep: replaces non-responders and completes timed-out
  // bodies (advancing their proposal out of sortition_synthesis). Deadlines
  // are hours-scale, so a 5-minute sweep is ample. Without this the
  // sortition_timeout handler is registered but never fed — a proposal whose
  // jury never fully responds would sit in sortition_synthesis forever.
  const sortitionSweepId = setInterval(() => {
    enqueueSortitionTimeout().catch(() => {});
  }, 5 * 60_000);

  // Deadline reminders. sendDeadlineReminders() existed but nothing ever
  // called it, so neither sortition members nor proposal authors were ever
  // reminded of anything. It is idempotent per subject per 24h, so a
  // 10-minute cadence sends one reminder, not one every sweep.
  const reminderSweepId = setInterval(() => {
    import('./notifications')
      .then(({ sendDeadlineReminders }) => sendDeadlineReminders())
      .catch((err) => console.error('[reminders] sweep failed:', err));
  }, 10 * 60_000);

  // Conference reminders. The window is 15 minutes, so a 5-minute cadence
  // gives every scheduled meeting at least two chances to be caught before
  // it starts — one missed sweep (restart, slow job) doesn't lose the notice.
  const conferenceReminderId = setInterval(() => {
    enqueueJob({ type: 'conference_reminder', data: {} }).catch(() => {});
  }, 5 * 60_000);

  // Retention sweep. Like the reminders, the handler was registered but
  // never fed, so it had never run once. Daily is ample for a 30-day window;
  // the first pass runs a minute after boot so a restart is enough to see it.
  const cleanupId = setInterval(() => {
    enqueueJob({ type: 'cleanup_expired', data: {}, priority: 'low' }).catch(() => {});
  }, 24 * 60 * 60_000);
  const firstCleanupId = setTimeout(() => {
    enqueueJob({ type: 'cleanup_expired', data: {}, priority: 'low' }).catch(() => {});
  }, 60_000);

  // Vote-chain anchoring. Publishes moved head hashes to the external anchor
  // repository. Ten minutes bounds how far behind the public record can lag
  // the live chain; the first pass runs two minutes after boot so a restart
  // is enough to catch up anything missed while down.
  const anchorSweepId = setInterval(() => {
    enqueueJob({ type: 'chain_anchor', data: {}, priority: 'low' }).catch(() => {});
  }, 10 * 60_000);
  const firstAnchorId = setTimeout(() => {
    enqueueJob({ type: 'chain_anchor', data: {}, priority: 'low' }).catch(() => {});
  }, 2 * 60_000);

  return () => {
    stopWorker();
    clearInterval(anchorSweepId);
    clearTimeout(firstAnchorId);
    clearInterval(autoAdvanceId);
    clearInterval(sortitionSweepId);
    clearInterval(reminderSweepId);
    clearInterval(conferenceReminderId);
    clearInterval(cleanupId);
    clearTimeout(firstCleanupId);
  };
}
