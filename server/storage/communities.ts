/**
 * Community Repository
 *
 * Handles community lifecycle: create, read, update, delete, member management,
 * settings, governance model transitions, and community merging.
 */

import { db } from '../db';
import { communities, communityMembers, communityJoinRequests, communitySettingVotes, type Community, type InsertCommunity, type CommunityMember, type CommunityJoinRequest, type CommunitySettingVote } from '../../shared/schema';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import {
  GOVERNABLE_SETTING_KEYS,
  isGovernableSettingKey,
  readCurrentSetting,
  unparseGovernableSetting,
  type GovernableSettingKey,
} from '../../shared/governable-settings';

export class CommunityRepository {

  /**
   * Create a new community.
   * @returns The created community.
   */
  async createCommunity(insertCommunity: InsertCommunity): Promise<Community> {
    const [community] = await db
      .insert(communities)
      .values(insertCommunity)
      .returning();
    return community;
  }

  /**
   * Get a community by ID.
   * @returns The community or undefined if not found.
   */
  async getCommunity(id: number): Promise<Community | undefined> {
    const [community] = await db
      .select()
      .from(communities)
      .where(eq(communities.id, id));
    return community;
  }

  /**
   * List every community for discovery. Membership and approval state are
   * surfaced through the join-request flow, not by hiding rows here.
   * The userId argument is accepted for callers that still pass it.
   */
  async getCommunities(_userId?: number): Promise<Community[]> {
    return await db
      .select()
      .from(communities)
      .orderBy(desc(communities.createdAt));
  }

  /**
   * Update a community.
   * @returns The updated community.
   */
  async updateCommunity(id: number, updates: Partial<Community>): Promise<Community> {
    const [community] = await db
      .update(communities)
      .set(updates)
      .where(eq(communities.id, id))
      .returning();
    if (!community) throw new Error("Community not found");
    return community;
  }

  /**
   * Delete a community.
   * @returns True if deleted, false if not found.
   */
  async deleteCommunity(id: number): Promise<boolean> {
    const result = await db
      .delete(communities)
      .where(eq(communities.id, id));
    return true; // TODO: Check if row was actually deleted
  }

  /**
   * Get all members of a community.
   * @returns Array of community members.
   */
  async getCommunityMembers(communityId: number): Promise<CommunityMember[]> {
    return await db
      .select()
      .from(communityMembers)
      .where(eq(communityMembers.communityId, communityId));
  }

  /**
   * Add a member to a community.
   * @returns The created community member.
   */
  async addCommunityMember(communityId: number, userId: number, role?: string): Promise<CommunityMember> {
    const [member] = await db
      .insert(communityMembers)
      .values({ communityId, userId, role: role || 'member' })
      .returning();
    return member;
  }

  /**
   * Remove a member from a community.
   * @returns True if removed, false if not found.
   */
  async removeCommunityMember(communityId: number, userId: number): Promise<boolean> {
    await db
      .delete(communityMembers)
      .where(and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId)
      ));
    return true;
  }

  /**
   * Update a member's role in a community.
   * @returns The updated community member.
   */
  async updateMemberRole(communityId: number, userId: number, role: string): Promise<CommunityMember> {
    const [member] = await db
      .update(communityMembers)
      .set({ role })
      .where(and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId)
      ))
      .returning();
    if (!member) throw new Error("Member not found");
    return member;
  }

  /**
   * Check if a user is a member of a community.
   * @returns True if member, false otherwise.
   */
  async isCommunityMember(communityId: number, userId: number): Promise<boolean> {
    const [member] = await db
      .select()
      .from(communityMembers)
      .where(and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId)
      ));
    return !!member;
  }

  /**
   * Get a member's role in a community.
   * @returns The role string or undefined if not a member.
   */
  async getCommunityMemberRole(communityId: number, userId: number): Promise<string | undefined> {
    const [member] = await db
      .select()
      .from(communityMembers)
      .where(and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId)
      ));
    return member?.role ?? undefined;
  }

  // ─── Join requests ─────────────────────────────────────────────────────────

  async getPendingJoinRequest(communityId: number, userId: number): Promise<CommunityJoinRequest | undefined> {
    const [row] = await db
      .select()
      .from(communityJoinRequests)
      .where(and(
        eq(communityJoinRequests.communityId, communityId),
        eq(communityJoinRequests.userId, userId),
        eq(communityJoinRequests.status, 'pending'),
      ));
    return row;
  }

  async createJoinRequest(communityId: number, userId: number, message?: string): Promise<CommunityJoinRequest> {
    const [row] = await db
      .insert(communityJoinRequests)
      .values({ communityId, userId, message: message ?? null })
      .returning();
    return row;
  }

  async listPendingJoinRequests(communityId: number): Promise<CommunityJoinRequest[]> {
    return await db
      .select()
      .from(communityJoinRequests)
      .where(and(
        eq(communityJoinRequests.communityId, communityId),
        eq(communityJoinRequests.status, 'pending'),
      ))
      .orderBy(desc(communityJoinRequests.createdAt));
  }

  async decideJoinRequest(
    requestId: number,
    decision: 'approved' | 'rejected',
    decidedByUserId: number,
  ): Promise<CommunityJoinRequest | undefined> {
    const [row] = await db
      .update(communityJoinRequests)
      .set({ status: decision, decidedAt: new Date(), decidedByUserId })
      .where(and(
        eq(communityJoinRequests.id, requestId),
        eq(communityJoinRequests.status, 'pending'),
      ))
      .returning();
    return row;
  }

  // ─── Liquid setting votes (autonomous communities) ─────────────────────────

  async upsertSettingVote(
    communityId: number,
    settingKey: GovernableSettingKey,
    userId: number,
    canonicalValue: string,
  ): Promise<CommunitySettingVote> {
    const now = new Date();
    const [row] = await db
      .insert(communitySettingVotes)
      .values({ communityId, settingKey, userId, choiceValue: canonicalValue })
      .onConflictDoUpdate({
        target: [communitySettingVotes.communityId, communitySettingVotes.settingKey, communitySettingVotes.userId],
        set: { choiceValue: canonicalValue, updatedAt: now },
      })
      .returning();
    return row;
  }

  async removeSettingVote(communityId: number, settingKey: GovernableSettingKey, userId: number): Promise<boolean> {
    const result = await db
      .delete(communitySettingVotes)
      .where(and(
        eq(communitySettingVotes.communityId, communityId),
        eq(communitySettingVotes.settingKey, settingKey),
        eq(communitySettingVotes.userId, userId),
      ));
    return (result as any).rowCount > 0;
  }

  async getMemberSettingVote(
    communityId: number,
    settingKey: GovernableSettingKey,
    userId: number,
  ): Promise<CommunitySettingVote | undefined> {
    const [row] = await db
      .select()
      .from(communitySettingVotes)
      .where(and(
        eq(communitySettingVotes.communityId, communityId),
        eq(communitySettingVotes.settingKey, settingKey),
        eq(communitySettingVotes.userId, userId),
      ));
    return row;
  }

  async tallySettingVotes(
    communityId: number,
    settingKey: GovernableSettingKey,
  ): Promise<Array<{ value: string; count: number }>> {
    const rows = await db
      .select({
        value: communitySettingVotes.choiceValue,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(communitySettingVotes)
      .where(and(
        eq(communitySettingVotes.communityId, communityId),
        eq(communitySettingVotes.settingKey, settingKey),
      ))
      .groupBy(communitySettingVotes.choiceValue);
    return rows.map(r => ({ value: r.value, count: r.count }));
  }

  /**
   * Recompute the plurality winner for one setting and write it back to the
   * community row if it changed. Ties keep the existing value. Returns the
   * resulting value (whether changed or not).
   */
  async recomputeAutonomousSetting(
    communityId: number,
    settingKey: GovernableSettingKey,
  ): Promise<string | null> {
    const community = await this.getCommunity(communityId);
    if (!community) return null;
    const current = readCurrentSetting(community as unknown as Record<string, unknown>, settingKey);
    const tally = await this.tallySettingVotes(communityId, settingKey);
    if (tally.length === 0) return current;

    let topCount = 0;
    let topValues: string[] = [];
    for (const row of tally) {
      if (row.count > topCount) {
        topCount = row.count;
        topValues = [row.value];
      } else if (row.count === topCount) {
        topValues.push(row.value);
      }
    }
    const winner = topValues.length === 1 ? topValues[0] : (topValues.includes(current) ? current : current);
    if (winner === current) return current;

    await db
      .update(communities)
      .set({ [settingKey]: unparseGovernableSetting(settingKey, winner) as any })
      .where(eq(communities.id, communityId));
    return winner;
  }

  /**
   * Tallies + current value for every governable setting at once. Used by
   * the autonomous-community settings page.
   */
  async listAllSettingTallies(communityId: number, userId?: number): Promise<Array<{
    key: GovernableSettingKey;
    currentValue: string;
    tally: Array<{ value: string; count: number }>;
    yourVote: string | null;
  }>> {
    const community = await this.getCommunity(communityId);
    if (!community) return [];

    const out: Array<{
      key: GovernableSettingKey;
      currentValue: string;
      tally: Array<{ value: string; count: number }>;
      yourVote: string | null;
    }> = [];
    for (const key of GOVERNABLE_SETTING_KEYS) {
      const tally = await this.tallySettingVotes(communityId, key);
      const yourVote = userId
        ? (await this.getMemberSettingVote(communityId, key, userId))?.choiceValue ?? null
        : null;
      out.push({
        key,
        currentValue: readCurrentSetting(community as unknown as Record<string, unknown>, key),
        tally,
        yourVote,
      });
    }
    return out;
  }

  /**
   * Merge two communities.
   * @returns Merge result with statistics.
   */
  async mergeCommunities(sourceId: number, targetId: number): Promise<{
    success: boolean;
    sourceId: number;
    targetId: number;
    membersTransferred: number;
    proposalsTransferred: number;
    errors: string[];
  }> {
    // TODO: Implement community merging logic
    // This requires transferring members and proposals from source to target
    return {
      success: false,
      sourceId,
      targetId,
      membersTransferred: 0,
      proposalsTransferred: 0,
      errors: ['Merge not yet implemented']
    };
  }

  /**
   * Get communities that have been merged into a target community.
   * @returns Array of merged communities.
   */
  async getMergedCommunities(targetId: number): Promise<Community[]> {
    // TODO: Implement merged communities query
    return [];
  }

}

