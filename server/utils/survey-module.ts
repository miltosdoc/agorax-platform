/**
 * Piggyback module — the platform's 2–3 questions carried by EVERY poll.
 *
 * Design rules (order-effect control + planned missingness):
 *   - module items render FIRST, before the host poll's topic is visible;
 *   - their internal order is FIXED (module_items.position), never randomized;
 *   - each respondent answers a deterministic SUBSET of the rotating pool:
 *     sha256(panelistId:poolVersion:moduleItemId) ranks the pool and the
 *     top MODULE_ITEMS_PER_RESPONDENT survive. Per-respondent (not per-poll)
 *     so a panelist's subset is stable across polls — item assignment stays
 *     orthogonal to host-poll topic, and their within-person time series on
 *     those items is unbroken;
 *   - every module answer carries the host poll's topicTag (stored on the
 *     response row) for context-effect analysis.
 *
 * At fielding time the FULL pool is materialized as is_module_item rows on
 * the poll (positions before every host item); each respondent only sees /
 * answers their assigned subset.
 */
import { createHash } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, voteDb } from '../db';
import {
  moduleItems, moduleAssignments, questionBank, surveyItems,
  type ModuleItem, type SurveyItem,
} from '@shared/schema';

export const MODULE_ITEMS_PER_RESPONDENT = 3;
export const CURRENT_POOL_VERSION = 1;

export interface PoolEntry {
  moduleItem: ModuleItem;
  bank: typeof questionBank.$inferSelect;
}

/** The active pool for a version, in fixed module order. */
export async function loadPool(poolVersion = CURRENT_POOL_VERSION): Promise<PoolEntry[]> {
  const rows = await db
    .select({ moduleItem: moduleItems, bank: questionBank })
    .from(moduleItems)
    .innerJoin(questionBank, eq(moduleItems.questionBankId, questionBank.id))
    .where(and(eq(moduleItems.poolVersion, poolVersion), eq(moduleItems.active, true)))
    .orderBy(asc(moduleItems.position));
  return rows;
}

function rank(panelistId: number, poolVersion: number, moduleItemId: number): string {
  return createHash('sha256')
    .update(`${panelistId}:${poolVersion}:${moduleItemId}`)
    .digest('hex');
}

/**
 * The module_items.id subset for one panelist (deterministic), materialized
 * into module_assignments on first touch for auditability. Returned in
 * fixed module order regardless of hash rank.
 */
export async function assignModuleSubset(
  panelistId: number,
  poolVersion = CURRENT_POOL_VERSION,
): Promise<number[]> {
  const [existing] = await voteDb
    .select()
    .from(moduleAssignments)
    .where(and(
      eq(moduleAssignments.panelistId, panelistId),
      eq(moduleAssignments.poolVersion, poolVersion),
    ))
    .limit(1);
  if (existing) return existing.itemIds as number[];

  const pool = await loadPool(poolVersion);
  const subset = pool
    .map((p) => ({ id: p.moduleItem.id, position: p.moduleItem.position, r: rank(panelistId, poolVersion, p.moduleItem.id) }))
    .sort((a, b) => (a.r < b.r ? -1 : 1))
    .slice(0, MODULE_ITEMS_PER_RESPONDENT)
    .sort((a, b) => a.position - b.position) // restore fixed module order
    .map((x) => x.id);

  await voteDb.insert(moduleAssignments).values({
    panelistId,
    poolVersion,
    itemIds: subset,
  }).onConflictDoNothing();
  return subset;
}

/**
 * Materialize the full module pool as survey_items rows on a poll, occupying
 * positions 0..k-1 BEFORE every host item (host items are shifted up by the
 * caller). Returns a map module_items.id → created survey_items.id.
 */
export async function materializeModuleItems(pollId: number): Promise<Map<number, number>> {
  const pool = await loadPool();
  const map = new Map<number, number>();
  for (let i = 0; i < pool.length; i++) {
    const { moduleItem, bank } = pool[i];
    const [created] = await db.insert(surveyItems).values({
      pollId,
      questionBankId: bank.id,
      position: i,
      text: bank.text, // canonical wording, character-identical across waves
      itemType: bank.itemType,
      options: bank.options,
      randomizeOptions: bank.randomizeOptions,
      required: true,
      isModuleItem: true,
    }).returning({ id: surveyItems.id });
    map.set(moduleItem.id, created.id);
  }
  return map;
}

/**
 * For one respondent on one poll: the survey_items.id list of their module
 * subset, in fixed module order. `moduleItemMap` is materializeModuleItems'
 * output persisted on poll items (reconstructed from questionBankId here).
 */
export async function respondentModuleItemIds(
  pollId: number,
  panelistId: number,
): Promise<number[]> {
  const subset = await assignModuleSubset(panelistId);
  if (subset.length === 0) return [];
  const pool = await loadPool();
  const bankIdByModuleId = new Map(pool.map((p) => [p.moduleItem.id, p.bank.id]));
  const wantedBankIds = subset
    .map((id) => bankIdByModuleId.get(id))
    .filter((x): x is number => typeof x === 'number');
  if (wantedBankIds.length === 0) return [];

  const rows: SurveyItem[] = await db
    .select()
    .from(surveyItems)
    .where(and(
      eq(surveyItems.pollId, pollId),
      eq(surveyItems.isModuleItem, true),
      inArray(surveyItems.questionBankId, wantedBankIds),
    ))
    .orderBy(asc(surveyItems.position));
  return rows.map((r) => r.id);
}
