/**
 * Job Queue for Async Tasks
 * 
 * Simple Postgres-based job queue for async tasks like:
 * - LLM proposal structuring
 * - Notification delivery
 * - Sortition body creation
 * - Democracy score recalculation
 * 
 * Design: Postgres-based (no Redis/BullMQ) to avoid premature complexity.
 * Jobs are stored in a jobs table and processed by a worker loop.
 * 
 * Job states: pending → processing → completed | failed
 * Failed jobs are retried with exponential backoff (max 3 retries).
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────────────────

export type JobType =
  | 'structure_proposal'    // LLM proposal structuring
  | 'send_notification'     // Notification delivery
  | 'create_sortition'      // Sortition body creation
  | 'recalculate_score'     // Democracy score recalculation
  | 'cleanup_expired'       // Cleanup expired sessions/votes
  | 'sortition_timeout'     // Sortition deadline sweep & completion
  | 'phase_auto_advance'    // Advance proposals past expired phase deadlines
  | 'conference_reminder'   // "Starts soon" fan-out for scheduled meetings
  | 'refresh_final_text';   // Live re-merge of the AI final text during deliberation

export interface JobPayload {
  type: JobType;
  data: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
  retryCount?: number;
  maxRetries?: number;
}

export interface Job {
  id: string;
  type: JobType;
  payload: JobPayload;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

// ─── Job Queue ──────────────────────────────────────────────────────────────

/**
 * Enqueue a job for async processing.
 * 
 * @param payload - Job payload with type and data
 * @returns Job ID for tracking
 */
export async function enqueueJob(payload: JobPayload): Promise<string> {
  const jobId = generateJobId();
  const priority = payload.priority || 'normal';
  const maxRetries = payload.maxRetries || 3;
  
  // TODO: Create jobs table in schema
  // For now, use a raw SQL insert
  await db.execute(sql`
    INSERT INTO jobs (id, type, payload, status, priority, retry_count, max_retries, created_at)
    VALUES (${jobId}, ${payload.type}, ${JSON.stringify(payload)}, 'pending', ${priority}, 0, ${maxRetries}, NOW())
  `);
  
  return jobId;
}

/**
 * Get the next pending job to process.
 * 
 * Jobs are processed in priority order (high > normal > low), then FIFO.
 * Uses SELECT FOR UPDATE SKIP LOCKED to avoid race conditions.
 */
export async function getNextJob(): Promise<Job | null> {
  const result = await db.execute(sql`
    SELECT * FROM jobs 
    WHERE status = 'pending' 
    ORDER BY 
      CASE priority 
        WHEN 'high' THEN 1 
        WHEN 'normal' THEN 2 
        WHEN 'low' THEN 3 
      END,
      created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `);
  
  if (result.rows.length === 0) return null;
  
  const job = result.rows[0] as unknown as Job;
  
  // Mark as processing
  await db.execute(sql`
    UPDATE jobs SET status = 'processing', started_at = NOW() WHERE id = ${job.id}
  `);
  
  return job;
}

/**
 * Mark a job as completed.
 */
export async function completeJob(jobId: string, result?: any): Promise<void> {
  await db.execute(sql`
    UPDATE jobs SET status = 'completed', completed_at = NOW(), result = ${result ? JSON.stringify(result) : null} WHERE id = ${jobId}
  `);
}

/**
 * Mark a job as failed and schedule retry if retries remain.
 */
export async function failJob(jobId: string, error: string, retry: boolean = true): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  
  if (retry && job.retryCount < job.maxRetries) {
    // The next poll picks the job back up; exponential backoff is not yet
    // wired into the queue (no scheduled-job mechanism in place).
    await db.execute(sql`
      UPDATE jobs
      SET status = 'pending', error = ${error}, retry_count = ${job.retryCount + 1}, started_at = NULL
      WHERE id = ${jobId}
    `);
  } else {
    // Max retries exceeded — mark as permanently failed
    await db.execute(sql`
      UPDATE jobs SET status = 'failed', error = ${error} WHERE id = ${jobId}
    `);
  }
}

/**
 * Get a job by ID.
 */
export async function getJob(jobId: string): Promise<Job | null> {
  const result = await db.execute(sql`
    SELECT * FROM jobs WHERE id = ${jobId}
  `);
  
  return result.rows[0] as unknown as Job || null;
}

/**
 * Get all pending jobs (for monitoring).
 */
export async function getPendingJobs(): Promise<Job[]> {
  const result = await db.execute(sql`
    SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC
  `);
  
  return result.rows as unknown as Job[];
}

/**
 * Get all failed jobs (for monitoring/retry).
 */
export async function getFailedJobs(): Promise<Job[]> {
  const result = await db.execute(sql`
    SELECT * FROM jobs WHERE status = 'failed' ORDER BY created_at DESC
  `);
  
  return result.rows as unknown as Job[];
}

/**
 * Retry all failed jobs.
 */
export async function retryFailedJobs(): Promise<number> {
  const failed = await getFailedJobs();
  let retried = 0;
  
  for (const job of failed) {
    await db.execute(sql`
      UPDATE jobs SET status = 'pending', retry_count = 0, error = NULL, started_at = NULL WHERE id = ${job.id}
    `);
    retried++;
  }
  
  return retried;
}

/**
 * Clean up old completed/failed jobs (older than 7 days).
 */
export async function cleanupOldJobs(days: number = 7): Promise<number> {
  const result = await db.execute(sql`
    DELETE FROM jobs 
    WHERE status IN ('completed', 'failed') 
    AND completed_at < NOW() - INTERVAL '${days} days'
    RETURNING id
  `);
  
  return result.rows.length;
}

// ─── Worker ─────────────────────────────────────────────────────────────────

/**
 * Job handler function signature.
 */
export type JobHandler = (payload: JobPayload) => Promise<any>;

/**
 * Register a job handler for a specific job type.
 */
const handlers: Map<JobType, JobHandler> = new Map();

export function registerHandler(type: JobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

/**
 * Process the next pending job.
 * 
 * Returns true if a job was processed, false if no pending jobs.
 */
export async function processNextJob(): Promise<boolean> {
  const job = await getNextJob();
  if (!job) return false;
  
  try {
    const handler = handlers.get(job.type);
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.type}`);
    }
    
    await handler(job.payload);
    await completeJob(job.id);
    
    return true;
  } catch (error) {
    await failJob(job.id, error instanceof Error ? error.message : String(error));
    return true; // Still counts as processed (even though it failed)
  }
}

/**
 * Start the job worker loop.
 * 
 * Polls for pending jobs every `intervalMs` milliseconds.
 * Returns a cleanup function to stop the worker.
 */
export function startWorker(intervalMs: number = 5000): () => void {
  const interval = setInterval(async () => {
    try {
      await processNextJob();
    } catch (error) {
      }
  }, intervalMs);
  
  // Return cleanup function
  return () => clearInterval(interval);
}

/**
 * Generate a unique job ID.
 */
function generateJobId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Convenience Functions ──────────────────────────────────────────────────

/**
 * Enqueue a proposal structuring job.
 */
export async function enqueueStructureProposal(
  proposalId: number,
  question: string,
  solution: string,
): Promise<string> {
  return enqueueJob({
    type: 'structure_proposal',
    data: { proposalId, question, solution },
    priority: 'normal',
  });
}

/**
 * Enqueue a notification job.
 */
export async function enqueueNotification(
  userId: number,
  type: string,
  message: string,
  data?: Record<string, any>,
): Promise<string> {
  return enqueueJob({
    type: 'send_notification',
    data: { userId, type, message, ...data },
    priority: 'low',
  });
}

/**
 * Enqueue a sortition creation job.
 */
export async function enqueueCreateSortition(
  communityId: number,
  size: number,
  proposalId?: number,
  purpose: string = 'text_synthesis',
): Promise<string> {
  return enqueueJob({
    type: 'create_sortition',
    data: { communityId, size, proposalId, purpose },
    priority: 'high',
  });
}

/**
 * Enqueue a democracy score recalculation job.
 */
export async function enqueueRecalculateScore(
  communityId: number,
): Promise<string> {
  return enqueueJob({
    type: 'recalculate_score',
    data: { communityId },
    priority: 'low',
  });
}

/**
 * Enqueue a sortition timeout sweep job.
 * Sweeps all active sortition bodies, checks deadlines, replaces
 * non-responders, and completes bodies that have timed out.
 */
export async function enqueueSortitionTimeout(): Promise<string> {
  return enqueueJob({
    type: 'sortition_timeout',
    data: {},
    priority: 'normal',
  });
}
