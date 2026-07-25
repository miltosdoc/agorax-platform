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

// ─── Handler: structure_proposal ────────────────────────────────────────────

/**
 * Handle the `structure_proposal` job.
 *
 * Drives the proposal through LLM validation: scores it, persists the full
 * result to `validation_results`, and routes to the next canonical state
 * (`draft` for return, `author_review` for sortition, `voting` for auto-
 * approve). Notifications and follow-up jobs (sortition body, score recalc)
 * are queued by `transitionToValidation`. Errors propagate so the job queue
 * can retry — failure here leaves the proposal in `review`.
 */
async function handleStructureProposal(payload: JobPayload): Promise<void> {
  const { proposalId } = payload.data as { proposalId: number };
  if (typeof proposalId !== 'number') {
    throw new Error(`structure_proposal: missing or invalid proposalId in payload`);
  }

  const outcome = await transitionToValidation(proposalId);
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
  if (!proposal || proposal.status !== 'community_signal') return;
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
        // 3-step flow: the final text has been merging LIVE throughout the
        // phase (refresh_final_text jobs), so the deadline freezes it and
        // opens the vote immediately — no waiting room. The freeze itself
        // happens in the community_signal->voting side effect. (Sortition
        // synthesis remains reachable via the manual /transition endpoint;
        // final_review below only serves proposals already in it.)
        const updated = await transitionProposal(proposal as any, 'voting', storage);
        await triggerSideEffects('community_signal', 'voting', updated);

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

  // Retention sweep. Like the reminders, the handler was registered but
  // never fed, so it had never run once. Daily is ample for a 30-day window;
  // the first pass runs a minute after boot so a restart is enough to see it.
  const cleanupId = setInterval(() => {
    enqueueJob({ type: 'cleanup_expired', data: {}, priority: 'low' }).catch(() => {});
  }, 24 * 60 * 60_000);
  const firstCleanupId = setTimeout(() => {
    enqueueJob({ type: 'cleanup_expired', data: {}, priority: 'low' }).catch(() => {});
  }, 60_000);

  return () => {
    stopWorker();
    clearInterval(autoAdvanceId);
    clearInterval(sortitionSweepId);
    clearInterval(reminderSweepId);
    clearInterval(cleanupId);
    clearTimeout(firstCleanupId);
  };
}
