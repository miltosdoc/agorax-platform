/**
 * Admin action audit log helper.
 *
 * Single insertion point for the `admin_audit_log` table. Every
 * admin-initiated privileged action calls logAdminAction(...) so the
 * resulting row is traceable: who, when, what, to whom.
 *
 * Per INTERNAL_POLICIES.md §1.2 this is the control that turns "the host
 * can read votes" into "we know when they did and why." It is therefore
 * non-negotiable: any new admin endpoint MUST log here, and the call
 * MUST NOT be reachable without the admin actually being authenticated
 * as an admin (the route layer is responsible for that gate).
 */
import { db } from '../db';
import { adminAuditLog } from '@shared/schema';

export interface AdminAuditInput {
  adminId: number;
  action: string;
  targetUserId?: number;
  targetResource?: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export async function logAdminAction(input: AdminAuditInput): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({
      adminId: input.adminId,
      action: input.action,
      targetUserId: input.targetUserId ?? null,
      targetResource: input.targetResource ?? null,
      details: input.details ?? null,
      requestId: input.requestId ?? null,
    });
  } catch (err) {
    // We do NOT throw — a logging failure must never break the action.
    // But it MUST be surfaced loud enough that ops catches it.
    // eslint-disable-next-line no-console
    console.error('[admin-audit] failed to write audit row', {
      action: input.action,
      adminId: input.adminId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
