/**
 * Sortition Timeout & Completion
 *
 * Handles deadline checks, replacement of non-responders, and completion of
 * sortition bodies. Deadlines are derived from `selectedAt + responseHours`
 * (no separate `responseDeadline` column).
 *
 * Wired up by the recurring `sortition_timeout` job in the queue worker.
 */

import { db } from '../db';
import { storage } from '../storage';
import { sortitionBodies, sortitionMembers, proposals } from '@shared/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getEligibleMembers } from './sortition';
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
 * Replace non-responding members with fresh random picks from the eligible
 * pool. Returns the number of replacements actually made.
 */
export async function replaceNonRespondingMembers(
  bodyId: number,
  communityId: number,
  maxReplacements: number = 5,
): Promise<number> {
  const members = await storage.getSortitionMembers(bodyId);
  const nonResponders = members.filter(m => !m.responded);
  if (nonResponders.length === 0) return 0;

  const currentMemberIds = new Set(members.map(m => m.userId));

  const eligible = await getEligibleMembers(communityId, storage);
  const candidates = eligible.filter(m => !currentMemberIds.has(m.userId));

  if (candidates.length === 0) return 0;

  // Cryptographically secure shuffle for fairness, mirroring sortition.ts
  for (let i = candidates.length - 1; i > 0; i--) {
    const limit = 256 - (256 % (i + 1));
    let j: number;
    do {
      const bytes = new Uint8Array(1);
      crypto.getRandomValues(bytes);
      j = bytes[0];
    } while (j >= limit);
    j = j % (i + 1);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const replaceCount = Math.min(maxReplacements, nonResponders.length, candidates.length);
  let replaced = 0;
  for (let i = 0; i < replaceCount; i++) {
    const drop = nonResponders[i];
    const pick = candidates[i];

    // Remove the non-responder, add the replacement.
    await db
      .delete(sortitionMembers)
      .where(and(eq(sortitionMembers.bodyId, bodyId), eq(sortitionMembers.userId, drop.userId)));
    await storage.addSortitionMember(bodyId, pick.userId);
    replaced++;
  }

  return replaced;
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
