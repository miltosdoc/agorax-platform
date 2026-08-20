/**
 * Admin Action Logger
 *
 * Logs all admin actions to the admin_actions table for audit trail.
 * Every admin action (deleting comments, banning users, overriding sortition
 * timeouts, managing membership, moderating proposals) is recorded with
 * full context for accountability and transparency.
 */

import { db } from '../db';
import { adminActions } from '@shared/schema';
import type { InsertAdminAction } from '@shared/schema';

// ─── Action Type Enum ───────────────────────────────────────────────────────

export type AdminActionType =
  | 'delete_comment'
  | 'ban_user'
  | 'override_sortition_timeout'
  | 'manage_membership'
  | 'moderate_proposal';

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Log an admin action to the database for audit trail.
 *
 * @param userId - The admin user who performed the action
 * @param communityId - The community where the action was taken (nullable)
 * @param actionType - The type of admin action performed
 * @param targetId - The ID of the entity that was acted upon (nullable)
 * @param details - Additional context stored as JSON (nullable)
 * @returns The ID of the created log entry
 */
export async function logAdminAction(
  userId: number,
  communityId: number | null,
  actionType: AdminActionType,
  targetId: number | null,
  details?: Record<string, unknown>,
): Promise<number> {
  const insertData: InsertAdminAction = {
    userId,
    communityId,
    actionType,
    targetId,
    details: details ?? null,
  };

  const [record] = await db
    .insert(adminActions)
    .values(insertData)
    .returning();

  return record.id;
}

/**
 * Convenience: log a comment deletion.
 */
export async function logDeleteComment(
  adminUserId: number,
  communityId: number | null,
  commentId: number,
  reason?: string,
): Promise<number> {
  return logAdminAction(
    adminUserId,
    communityId,
    'delete_comment',
    commentId,
    reason ? { reason } : undefined,
  );
}

/**
 * Convenience: log a user ban.
 */
export async function logBanUser(
  adminUserId: number,
  communityId: number | null,
  bannedUserId: number,
  reason?: string,
  duration?: string,
): Promise<number> {
  return logAdminAction(
    adminUserId,
    communityId,
    'ban_user',
    bannedUserId,
    { reason, duration },
  );
}

/**
 * Convenience: log a sortition timeout override.
 */
export async function logOverrideSortitionTimeout(
  adminUserId: number,
  communityId: number,
  bodyId: number,
  newDeadline: Date,
  reason?: string,
): Promise<number> {
  return logAdminAction(
    adminUserId,
    communityId,
    'override_sortition_timeout',
    bodyId,
    { newDeadline: newDeadline.toISOString(), reason },
  );
}

/**
 * Convenience: log a membership management action.
 */
export async function logManageMembership(
  adminUserId: number,
  communityId: number,
  targetUserId: number,
  action: 'add' | 'remove' | 'promote' | 'demote',
  role?: string,
  reason?: string,
): Promise<number> {
  return logAdminAction(
    adminUserId,
    communityId,
    'manage_membership',
    targetUserId,
    { action, role, reason },
  );
}

/**
 * Convenience: log a proposal moderation action.
 */
export async function logModerateProposal(
  adminUserId: number,
  communityId: number,
  proposalId: number,
  action: 'approve' | 'reject' | 'return' | 'escalate',
  reason?: string,
): Promise<number> {
  return logAdminAction(
    adminUserId,
    communityId,
    'moderate_proposal',
    proposalId,
    { action, reason },
  );
}
