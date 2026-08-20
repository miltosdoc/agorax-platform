/**
 * Amendments Repository
 *
 * Handles amendment workflow: create, read, update amendments on proposals, and count amendments per proposal.
 */

import { db } from '../db';
import { proposalAmendments, type ProposalAmendment, type InsertProposalAmendment } from '../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export class AmendmentRepository {

async createAmendment(insertAmendment: InsertProposalAmendment): Promise<ProposalAmendment> {
  const [amendment] = await db
    .insert(proposalAmendments)
    .values(insertAmendment)
    .returning();
  return amendment;
}

async getAmendment(id: number): Promise<ProposalAmendment | undefined> {
  const [amendment] = await db.select().from(proposalAmendments).where(eq(proposalAmendments.id, id));
  return amendment;
}

async getAmendments(proposalId: number): Promise<ProposalAmendment[]> {
  return await db
    .select()
    .from(proposalAmendments)
    .where(eq(proposalAmendments.proposalId, proposalId));
}

async updateAmendment(id: number, updates: Partial<ProposalAmendment>): Promise<ProposalAmendment> {
  const [amendment] = await db
    .update(proposalAmendments)
    .set(updates)
    .where(eq(proposalAmendments.id, id))
    .returning();
  if (!amendment) throw new Error("Amendment not found");
  return amendment;
}

async countAmendmentsForProposal(proposalId: number): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(proposalAmendments)
    .where(eq(proposalAmendments.proposalId, proposalId));
  return result[0]?.count ?? 0;
}

}
