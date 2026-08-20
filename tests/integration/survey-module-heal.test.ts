/**
 * Piggyback-module assignment healing (regression).
 *
 * assignModuleSubset persists a panelist's deterministic module subset on
 * first touch. Historically, a panelist first touched while the pool was
 * EMPTY (question bank not yet seeded) was stored with itemIds: [] and kept
 * that empty subset forever — permanently excluding them from module items
 * on every future poll. The fix: empty stored assignments are recomputed
 * once the pool exists, and empty subsets are never persisted.
 *
 * Uses a dedicated poolVersion so the real pool (version 1) is untouched.
 * Requires DATABASE_URL (CI provides a service DB; locally the dev DB).
 */

import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db, voteDb } from '../../server/db';
import { moduleAssignments, moduleItems, panelists, questionBank } from '../../shared/schema';
import {
  assignModuleSubset,
  MODULE_ITEMS_PER_RESPONDENT,
} from '../../server/utils/survey-module';

const TEST_POOL_VERSION = 999001;
const createdPanelists: number[] = [];
const createdBank: number[] = [];

async function createPanelist(tag: string): Promise<number> {
  const [row] = await voteDb.insert(panelists).values({
    tokenHash: `test-heal-${tag}-${process.pid}-${Date.now()}`,
  }).returning({ id: panelists.id });
  createdPanelists.push(row.id);
  return row.id;
}

async function seedTestPool(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const [bank] = await db.insert(questionBank).values({
      code: `test_heal_${process.pid}_${Date.now()}_${i}`,
      version: 1,
      text: `Test item ${i}`,
      itemType: 'single_choice',
      options: ['a', 'b'],
      category: 'one_off',
    }).returning({ id: questionBank.id });
    createdBank.push(bank.id);
    await db.insert(moduleItems).values({
      questionBankId: bank.id,
      poolVersion: TEST_POOL_VERSION,
      position: i,
    });
  }
}

afterAll(async () => {
  if (createdPanelists.length) {
    await voteDb.delete(moduleAssignments)
      .where(inArray(moduleAssignments.panelistId, createdPanelists));
    await voteDb.delete(panelists).where(inArray(panelists.id, createdPanelists));
  }
  await db.delete(moduleItems).where(eq(moduleItems.poolVersion, TEST_POOL_VERSION));
  if (createdBank.length) {
    await db.delete(questionBank).where(inArray(questionBank.id, createdBank));
  }
});

describe('assignModuleSubset healing', () => {
  it('does not persist an empty assignment while the pool is empty, then heals once seeded', async () => {
    const panelist = await createPanelist('a');

    // First touch with an empty pool: empty subset, nothing persisted.
    const before = await assignModuleSubset(panelist, TEST_POOL_VERSION);
    expect(before).toEqual([]);
    const stored = await voteDb.select().from(moduleAssignments).where(and(
      eq(moduleAssignments.panelistId, panelist),
      eq(moduleAssignments.poolVersion, TEST_POOL_VERSION),
    ));
    expect(stored).toHaveLength(0);

    // Pool arrives later (bank seeded).
    await seedTestPool(5);

    const after = await assignModuleSubset(panelist, TEST_POOL_VERSION);
    expect(after).toHaveLength(MODULE_ITEMS_PER_RESPONDENT);
  });

  it('heals a legacy poisoned (empty) stored assignment in place', async () => {
    const panelist = await createPanelist('b');
    await voteDb.insert(moduleAssignments).values({
      panelistId: panelist,
      poolVersion: TEST_POOL_VERSION,
      itemIds: [],
    });

    const healed = await assignModuleSubset(panelist, TEST_POOL_VERSION);
    expect(healed).toHaveLength(MODULE_ITEMS_PER_RESPONDENT);

    // The stored row was updated, not duplicated.
    const rows = await voteDb.select().from(moduleAssignments).where(and(
      eq(moduleAssignments.panelistId, panelist),
      eq(moduleAssignments.poolVersion, TEST_POOL_VERSION),
    ));
    expect(rows).toHaveLength(1);
    expect(rows[0].itemIds as number[]).toEqual(healed);
  });

  it('assignment is deterministic and stable across calls', async () => {
    const panelist = await createPanelist('c');
    const first = await assignModuleSubset(panelist, TEST_POOL_VERSION);
    const second = await assignModuleSubset(panelist, TEST_POOL_VERSION);
    expect(first).toHaveLength(MODULE_ITEMS_PER_RESPONDENT);
    expect(second).toEqual(first);
  });
});
