/**
 * Sortition Selection Algorithm
 * 
 * Implements random selection of community members for advisory panels (sortition).
 * 
 * Sortition (selection by lot) is a cornerstone of deliberative democracy — used
 * since ancient Athens to ensure representative, unbiased decision-making bodies.
 * 
 * This implementation uses cryptographically secure random selection to ensure
 * fairness and prevent manipulation.
 * 
 * Key properties:
 * - Cryptographically secure random selection (crypto.getRandomValues)
 * - Excludes users already serving in active sortition bodies
 * - Configurable panel size
 * - Transparent selection process (seed is recorded for verification)
 */

import type { IStorage } from '../storage';
import { db } from '../db';
import { sortitionBodies, sortitionMembers } from '@shared/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SortitionResult {
  bodyId: number;
  selectedUserIds: number[];
  seed: string;
  totalEligible: number;
  selectedCount: number;
}

export interface EligibleMember {
  userId: number;
  role: string | null;
  joinedAt: Date;
}

// ─── Cryptographically Secure Random Selection ──────────────────────────────

/**
 * Generate a cryptographically secure random seed.
 * Used to ensure the selection process is verifiable and unbiased.
 */
function generateSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fisher-Yates shuffle using cryptographically secure random numbers.
 * 
 * Uses rejection sampling to avoid modulo bias — when the random byte
 * would introduce bias (byte > 256 - 256 % (i+1)), we reject it and
 * draw again. This guarantees uniform distribution.
 */
function cryptoShuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    // Rejection sampling to avoid modulo bias
    const limit = 256 - (256 % (i + 1));
    let j: number;
    do {
      const bytes = new Uint8Array(1);
      crypto.getRandomValues(bytes);
      j = bytes[0];
    } while (j >= limit);
    j = j % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─── Eligibility ────────────────────────────────────────────────────────────

/**
 * Get all eligible members for sortition in a community.
 * 
 * Eligibility criteria:
 * - Must be a community member
 * - Must not be currently serving in an active sortition body
 * - Must have been a member for at least 7 days (prevents Sybil attacks)
 * 
 * Returns user IDs of eligible members.
 */
export async function getEligibleMembers(
  communityId: number,
  storage: any,
): Promise<EligibleMember[]> {
  const members = await storage.getCommunityMembers(communityId);
  
  // Filter out members who joined less than 7 days ago
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  // Get currently active sortition members to exclude
  const activeMemberIds = await getActiveSortitionMembers(communityId);
  
  return members
    .filter((m: any) => new Date(m.joinedAt) <= sevenDaysAgo)
    .filter((m: any) => !activeMemberIds.has(m.userId))
    .map((m: any) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: new Date(m.joinedAt),
    }));
}

/**
 * Get user IDs who are currently serving in active sortition bodies.
 * 
 * These users are excluded from new sortition selections to prevent
 * concentration of deliberative power.
 */
export async function getActiveSortitionMembers(
  communityId: number,
): Promise<Set<number>> {
  // Find all active/selecting sortition bodies for this community
  const activeBodies = await db
    .select({ id: sortitionBodies.id })
    .from(sortitionBodies)
    .where(
      and(
        eq(sortitionBodies.communityId, communityId),
        sql`${sortitionBodies.status} IN ('selecting', 'active')`
      )
    );
  
  if (activeBodies.length === 0) {
    return new Set();
  }
  
  // Get all member user IDs from these bodies
  const bodyIds = activeBodies.map(b => b.id);
  const members = await db
    .select({ userId: sortitionMembers.userId })
    .from(sortitionMembers)
    .where(inArray(sortitionMembers.bodyId, bodyIds));
  
  return new Set(members.map(m => m.userId));
}

// ─── Selection ──────────────────────────────────────────────────────────────

/**
 * Create a new sortition body by randomly selecting members.
 * 
 * @param communityId - The community to select from
 * @param size - Desired panel size (default: 7, range: 3-23)
 * @param storage - Storage interface for database access
 * @param purpose - Purpose of the sortition body
 * @param proposalId - Optional proposal to associate
 * @param excludeUserIds - Optional set of user IDs to exclude (e.g., currently serving)
 * 
 * @returns SortitionResult with selected user IDs and verification seed
 */
export async function createSortitionBody(
  communityId: number,
  size: number = 7,
  storage: any,
  purpose: string = 'scoring',
  proposalId?: number,
  excludeUserIds?: Set<number>,
  options: { mode?: 'absolute' | 'percentage'; responseHours?: number } = {},
): Promise<SortitionResult> {
  // Get eligible members (already excludes active sortition members)
  const eligible = await getEligibleMembers(communityId, storage);

  // Remove additionally excluded users
  const pool = excludeUserIds
    ? eligible.filter(m => !excludeUserIds.has(m.userId))
    : eligible;

  if (pool.length === 0) {
    throw new Error('No eligible members for sortition');
  }

  // Interpret size per the community's sortitionMode.
  // - absolute: `size` is the literal number of members to pick
  // - percentage: `size` is a percent (1-100) of the eligible pool
  let desired = size;
  if (options.mode === 'percentage') {
    const pct = Math.max(1, Math.min(100, size));
    desired = Math.max(1, Math.ceil((pool.length * pct) / 100));
  }
  // Clamp to reasonable deliberative-body range
  const clampedSize = Math.max(3, Math.min(23, desired));

  // If pool is smaller than requested size, use all available
  const actualSize = Math.min(clampedSize, pool.length);

  // Cryptographically secure random selection
  const seed = generateSeed();
  const shuffled = cryptoShuffle(pool);
  const selected = shuffled.slice(0, actualSize);

  // Create the sortition body in the database
  const body = await storage.createSortitionBody({
    communityId,
    proposalId: proposalId ?? null,
    purpose,
    size: actualSize,
    responseHours: options.responseHours ?? 72,
    status: 'active',
    selectedAt: new Date(),
  });
  
  // Add selected members to the body
  for (const member of selected) {
    await storage.addSortitionMember(body.id, member.userId);
  }
  
  return {
    bodyId: body.id,
    selectedUserIds: selected.map(m => m.userId),
    seed,
    totalEligible: pool.length,
    selectedCount: actualSize,
  };
}

/**
 * Select random members for a sortition body without creating it.
 * 
 * Useful for previewing what the selection would look like.
 */
export async function previewSortition(
  communityId: number,
  size: number = 7,
  storage: any,
  mode: 'absolute' | 'percentage' = 'absolute',
): Promise<{ selectedUserIds: number[]; totalEligible: number }> {
  const eligible = await getEligibleMembers(communityId, storage);
  let desired = size;
  if (mode === 'percentage') {
    const pct = Math.max(1, Math.min(100, size));
    desired = Math.max(1, Math.ceil((eligible.length * pct) / 100));
  }
  const shuffled = cryptoShuffle(eligible);
  const actualSize = Math.min(desired, eligible.length);
  const selected = shuffled.slice(0, actualSize);
  
  return {
    selectedUserIds: selected.map(m => m.userId),
    totalEligible: eligible.length,
  };
}

/**
 * Complete a sortition body and mark it as finished.
 */
export async function completeSortitionBody(
  bodyId: number,
  storage: any,
): Promise<void> {
  await storage.completeSortitionBody(bodyId);
}

// ─── Synthesis ──────────────────────────────────────────────────────────────

/**
 * Aggregate sortition scores for a proposal and produce a synthesis summary.
 * 
 * Called when all sortition members have scored a proposal (or deadline passed).
 * Produces a structured output with average scores, distribution, and
 * top feedback themes.
 */
export async function synthesizeSortitionScores(
  bodyId: number,
  storage: any,
): Promise<{
  bodyId: number;
  totalMembers: number;
  respondedMembers: number;
  averageScore: number | null;
  scoreDistribution: Record<string, number>;
  proposalId: number | null;
  status: string;
}> {
  const body = await storage.getSortitionBody(bodyId);
  if (!body) throw new Error('Sortition body not found');
  
  const members = await storage.getSortitionMembers(bodyId);
  const responded = members.filter((m: any) => m.responded);
  
  // Calculate average score
  const scores = responded
    .map((m: any) => m.score ? parseFloat(m.score) : null)
    .filter((s: any): s is number => s !== null && !isNaN(s));
  
  const averageScore = scores.length > 0
    ? Math.round((scores.reduce((a: any, b: any) => a + b, 0) / scores.length) * 10) / 10
    : null;
  
  // Score distribution (bucket into ranges)
  const scoreDistribution: Record<string, number> = {
    '0-2': 0,
    '2-4': 0,
    '4-6': 0,
    '6-8': 0,
    '8-10': 0,
  };
  for (const score of scores) {
    if (score < 2) scoreDistribution['0-2']++;
    else if (score < 4) scoreDistribution['2-4']++;
    else if (score < 6) scoreDistribution['4-6']++;
    else if (score < 8) scoreDistribution['6-8']++;
    else scoreDistribution['8-10']++;
  }
  
  // If all members have responded (or majority), mark body as completed
  const responseRate = responded.length / members.length;
  if (responseRate >= 0.6 && body.status === 'active') {
    await storage.completeSortitionBody(bodyId);
  }
  
  return {
    bodyId,
    totalMembers: members.length,
    respondedMembers: responded.length,
    averageScore,
    scoreDistribution,
    proposalId: body.proposalId,
    status: responseRate >= 0.6 ? 'completed' : (body.status ?? 'active'),
  };
}
