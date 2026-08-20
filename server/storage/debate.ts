/**
 * Debate Repository
 *
 * Handles debate threads: create arguments, get arguments for proposals, and support/oppose voting on arguments.
 */

import { db } from '../db';
import { debateArguments, type DebateArgument, type InsertDebateArgument } from '../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export class DebateRepository {

async createDebateArgument(insertArgument: InsertDebateArgument): Promise<DebateArgument> {
  const [argument] = await db
    .insert(debateArguments)
    .values(insertArgument)
    .returning();
  return argument;
}

async getDebateArguments(proposalId: number): Promise<DebateArgument[]> {
  return await db
    .select()
    .from(debateArguments)
    .where(eq(debateArguments.proposalId, proposalId));
}

async supportDebateArgument(argumentId: number, userId: number): Promise<DebateArgument> {
  const [argument] = await db
    .update(debateArguments)
    .set({ supportCount: sql`${debateArguments.supportCount} + 1` })
    .where(eq(debateArguments.id, argumentId))
    .returning();
  if (!argument) throw new Error("Debate argument not found");
  return argument;
}

async opposeDebateArgument(argumentId: number, userId: number): Promise<DebateArgument> {
  const [argument] = await db
    .update(debateArguments)
    .set({ oppositionCount: sql`${debateArguments.oppositionCount} + 1` })
    .where(eq(debateArguments.id, argumentId))
    .returning();
  if (!argument) throw new Error("Debate argument not found");
  return argument;
}

}
