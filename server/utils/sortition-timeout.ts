/**
 * Sortition Timeout & Completion
 *
 * Handles deadline checks and completion of sortition bodies. Deadlines are
 * derived from `selectedAt + responseHours` (no separate `responseDeadline`
 * column).
 *
 * Wired up by the recurring `sortition_timeout` job in the queue worker.
 */

import { db } from '../db';
import { storage } from '../storage';
import { sortitionBodies, sortitionMembers, proposals } from '@shared/schema';
import { and, eq, sql } from 'drizzle-orm';
import { logOverrideSortitionTimeout } from './admin-action-logger';

// ─── Helpers ───────────────────────────────────────────────────────────────

function deriveDeadline(selectedAt: Date | null, responseHours: number | null): Date | null {
  if (!selectedAt) return null;
  const hours = responseHours ?? 72;
  return new Date(new Date(selectedAt).getTime() + hours * 60 * 60 * 1000);
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Returns true if the body's deadline has passed (and the body is still active). */
export async function checkSortitionTimeout(bodyId: number): Promise<boolean> {
  const body = await storage.getSortitionBody(bodyId);
  if (!body) return false;
  if (body.status !== 'active' && body.status !== 'selecting') return false;

  const deadline = deriveDeadline(body.selectedAt, body.responseHours);
  if (!deadline) return false;

  return Date.now() >= deadline.getTime();
}

/** Counts members of the body who have not yet responded. */
export async function getNonRespondingCount(bodyId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sortitionMembers)
    .where(and(eq(sortitionMembers.bodyId, bodyId), eq(sortitionMembers.responded, false)));
  return row?.count ?? 0;
}

/**
 * Mark the body as completed. Computes the average score from members who
 * responded and stores it on the linked proposal (if any). Returns the
 * computed average, or null when no scores were submitted.
 */
export async function completeSortitionBody(bodyId: number): Promise<number | null> {
  const body = await storage.getSortitionBody(bodyId);
  if (!body) return null;

  const members = await storage.getSortitionMembers(bodyId);
  const scores = members
    .filter(m => m.responded && m.score !== null && m.score !== undefined)
    .map(m => parseFloat(m.score as unknown as string))
    .filter(n => Number.isFinite(n));

  const average = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : null;

  await storage.completeSortitionBody(bodyId);

  if (body.proposalId && average !== null) {
    await db
      .update(proposals)
      .set({ sortitionAvgScore: String(average), updatedAt: new Date() })
      .where(eq(proposals.id, body.proposalId));
  }

  return average;
}

/**
 * Override the deadline by adjusting `selectedAt` (deadline = selectedAt +
 * responseHours). Logs the action to the admin audit trail.
 */
export async function overrideSortitionDeadline(
  bodyId: number,
  newDeadline: Date,
  adminUserId: number,
  reason: string,
): Promise<void> {
  const body = await storage.getSortitionBody(bodyId);
  if (!body) throw new Error('Sortition body not found');

  const responseHours = body.responseHours ?? 72;
  const newSelectedAt = new Date(newDeadline.getTime() - responseHours * 60 * 60 * 1000);

  await db
    .update(sortitionBodies)
    .set({ selectedAt: newSelectedAt })
    .where(eq(sortitionBodies.id, bodyId));

  await logOverrideSortitionTimeout(
    adminUserId,
    body.communityId,
    bodyId,
    newDeadline,
    reason,
  );
}
