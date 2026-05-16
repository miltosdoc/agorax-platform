/**
 * Sortition Repository
 *
 * Handles sortition body lifecycle: create bodies, manage members, track attendance, and complete bodies.
 */

import { db } from '../db';
import { sortitionBodies, sortitionMembers, sortitionAttendance, type SortitionBody, type InsertSortitionBody, type SortitionMember, type SortitionAttendance } from '../../shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';

export class SortitionRepository {

async createSortitionBody(insertBody: InsertSortitionBody): Promise<SortitionBody> {
  const [body] = await db
    .insert(sortitionBodies)
    .values(insertBody)
    .returning();
  return body;
}

async getSortitionBody(id: number): Promise<SortitionBody | undefined> {
  const [body] = await db.select().from(sortitionBodies).where(eq(sortitionBodies.id, id));
  return body;
}

async getSortitionMembers(bodyId: number): Promise<SortitionMember[]> {
  return await db
    .select()
    .from(sortitionMembers)
    .where(eq(sortitionMembers.bodyId, bodyId));
}

async addSortitionMember(bodyId: number, userId: number): Promise<SortitionMember> {
  const [member] = await db
    .insert(sortitionMembers)
    .values({ bodyId, userId })
    .returning();
  return member;
}

async removeSortitionMember(bodyId: number, userId: number): Promise<boolean> {
  await db
    .delete(sortitionMembers)
    .where(and(eq(sortitionMembers.bodyId, bodyId), eq(sortitionMembers.userId, userId)));
  return true;
}

async updateSortitionMember(bodyId: number, userId: number, updates: Partial<SortitionMember>): Promise<SortitionMember> {
  const [member] = await db
    .update(sortitionMembers)
    .set(updates)
    .where(and(eq(sortitionMembers.bodyId, bodyId), eq(sortitionMembers.userId, userId)))
    .returning();
  if (!member) throw new Error("Sortition member not found");
  return member;
}

async completeSortitionBody(id: number): Promise<SortitionBody> {
  const [body] = await db
    .update(sortitionBodies)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(sortitionBodies.id, id))
    .returning();
  if (!body) throw new Error("Sortition body not found");
  return body;
}

async getAttendance(proposalId: number, memberId: number): Promise<SortitionAttendance | undefined> {
  const bodyIds = await this.bodyIdsForProposal(proposalId);
  if (bodyIds.length === 0) return undefined;
  const [row] = await db
    .select()
    .from(sortitionAttendance)
    .where(and(
      inArray(sortitionAttendance.bodyId, bodyIds),
      eq(sortitionAttendance.memberId, memberId),
    ))
    .limit(1);
  return row;
}

async upsertAttendance(
  proposalId: number,
  memberId: number,
  status: 'invited' | 'accepted' | 'declined' | 'no-show' | 'completed',
  notes?: string,
): Promise<SortitionAttendance> {
  const bodyIds = await this.bodyIdsForProposal(proposalId);
  if (bodyIds.length === 0) {
    throw new Error(`No sortition body exists for proposal ${proposalId}`);
  }

  // Resolve the sortition member row → bodyId + userId.
  const [member] = await db
    .select()
    .from(sortitionMembers)
    .where(and(
      inArray(sortitionMembers.bodyId, bodyIds),
      eq(sortitionMembers.id, memberId),
    ))
    .limit(1);
  if (!member) {
    throw new Error(`Sortition member ${memberId} not found for proposal ${proposalId}`);
  }

  const now = new Date();
  const respondedAt = status === 'invited' ? null : now;
  const completedAt = status === 'completed' ? now : null;

  const existing = await db
    .select()
    .from(sortitionAttendance)
    .where(and(
      eq(sortitionAttendance.bodyId, member.bodyId),
      eq(sortitionAttendance.memberId, memberId),
    ))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(sortitionAttendance)
      .set({
        status,
        notes: notes ?? existing[0].notes,
        respondedAt: respondedAt ?? existing[0].respondedAt,
        completedAt: completedAt ?? existing[0].completedAt,
        updatedAt: now,
      })
      .where(eq(sortitionAttendance.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(sortitionAttendance)
    .values({
      bodyId: member.bodyId,
      memberId,
      userId: member.userId,
      status,
      invitedAt: now,
      respondedAt,
      completedAt,
      notes: notes ?? null,
    })
    .returning();
  return created;
}

private async bodyIdsForProposal(proposalId: number): Promise<number[]> {
  const rows = await db
    .select({ id: sortitionBodies.id })
    .from(sortitionBodies)
    .where(eq(sortitionBodies.proposalId, proposalId));
  return rows.map(r => r.id);
}


  /**
   * Get the attendance summary for a proposal — counts drawn from the
   * sortition_attendance records (not the scoring `responded` flag).
   * `confirmedPct` is a fraction in [0,1]; callers multiply by 100 to display.
   */
  async getAttendanceSummary(proposalId: number) {
    // getSortitionMembers is keyed by bodyId; gather across the proposal's
    // sortition bodies.
    const bodyIds = await this.bodyIdsForProposal(proposalId);
    const members = bodyIds.length > 0
      ? await db
          .select()
          .from(sortitionMembers)
          .where(inArray(sortitionMembers.bodyId, bodyIds))
      : [];
    const total = members.length;
    const records = bodyIds.length > 0
      ? await db
          .select()
          .from(sortitionAttendance)
          .where(inArray(sortitionAttendance.bodyId, bodyIds))
      : [];
    const countOf = (status: string) =>
      records.filter(r => r.status === status).length;
    const accepted = countOf('accepted');
    const declined = countOf('declined');
    const completed = countOf('completed');
    const noShow = countOf('no-show');
    // Members without an attendance row yet are still merely 'invited'.
    const invited = countOf('invited') + Math.max(0, total - records.length);
    const confirmed = accepted + completed;
    return {
      invited,
      accepted,
      declined,
      noShow,
      completed,
      total,
      confirmedPct: total > 0 ? confirmed / total : 0,
      rate: total > 0 ? confirmed / total : 0,
    };
  }
}
