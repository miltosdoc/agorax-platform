/**
 * Job Handlers Registration
 * 
 * Registers all job type handlers and starts the background worker.
 * Import this module during server startup to wire up the job queue.
 */

import { registerHandler, startWorker, type JobPayload } from './job-queue';
import { handleSortitionCompletion, transitionToValidation } from './proposal-state-machine';
import { checkSortitionTimeout, completeSortitionBody, replaceNonRespondingMembers } from './sortition-timeout';
import { db } from '../db';
import { sortitionBodies } from '@shared/schema';
import { eq } from 'drizzle-orm';

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
  
  // createSortitionBody handles selection + DB insert in one call
  const result = await createSortitionBody(
    communityId,
    size,
    storage,
    purpose,
    proposalId ?? undefined,
  );
  
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

async function handleCleanupExpired(payload: JobPayload): Promise<void> {
  // TODO: Implement cleanup logic
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

// ─── Register all handlers ──────────────────────────────────────────────────

export function registerAllHandlers(): void {
  registerHandler('structure_proposal', handleStructureProposal);
  registerHandler('send_notification', handleSendNotification);
  registerHandler('create_sortition', handleCreateSortition);
  registerHandler('recalculate_score', handleRecalculateScore);
  registerHandler('cleanup_expired', handleCleanupExpired);
  registerHandler('sortition_timeout', handleSortitionTimeout);
  
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
  
  
  return stopWorker;
}
