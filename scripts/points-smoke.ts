/**
 * Smoke test for the Democracy Points award engine against the dev DB.
 * Run: npx tsx scripts/points-smoke.ts   (cleans up its own rows)
 *
 * Dev-only: assumes user 1 has no real points yet.
 */
import { awardPoints, getPointSummary } from '../server/economy/points';
import { db } from '../server/db';
import { pointTransactions, pointBalances } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

const USER = 1;
const REF = 'smoke';

async function main() {
  let pass = true;
  const assert = (label: string, cond: boolean) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
    if (!cond) pass = false;
  };

  try {
    // Idempotency: same (user, action, target) twice → one credit.
    const r1 = await awardPoints({ userId: USER, actionKey: 'ratification_vote', refType: REF, refId: 1 });
    const r2 = await awardPoints({ userId: USER, actionKey: 'ratification_vote', refType: REF, refId: 1 });
    assert(`first award credited 25 (${r1.reason})`, r1.awarded && r1.points === 25);
    assert(`repeat award is idempotent (${r2.reason})`, !r2.awarded && r2.reason === 'already_awarded');

    // Different target → a fresh award.
    const r3 = await awardPoints({ userId: USER, actionKey: 'ratification_vote', refType: REF, refId: 2 });
    assert('different target → new award', r3.awarded && r3.points === 25);

    // Rolling cap: proposal_validated is capped at 3 / 30 days.
    const caps = [];
    for (let i = 1; i <= 4; i++) {
      caps.push(await awardPoints({ userId: USER, actionKey: 'proposal_validated', refType: REF, refId: 100 + i }));
    }
    assert('proposal cap: first 3 awarded', caps.slice(0, 3).every((r) => r.awarded));
    assert(`proposal cap: 4th blocked (${caps[3].reason})`, !caps[3].awarded && caps[3].reason === 'capped');

    // Unknown action → rejected, no credit.
    const r5 = await awardPoints({ userId: USER, actionKey: 'not_a_real_action', refType: REF, refId: 1 });
    assert(`unknown action rejected (${r5.reason})`, !r5.awarded && r5.reason === 'unknown_action');

    // Summary: 2 votes (50) + 3 proposals (600) = 650.
    const summary = await getPointSummary(USER);
    assert(`summary balance = 650 (got ${summary.balance})`, summary.balance === 650);
    assert(`summary lifetime = 650 (got ${summary.lifetimeEarned})`, summary.lifetimeEarned === 650);
    assert(`ledger has 5 transactions (got ${summary.transactions.length})`, summary.transactions.length === 5);
  } finally {
    await db.delete(pointTransactions).where(and(eq(pointTransactions.userId, USER), eq(pointTransactions.refType, REF)));
    await db.delete(pointBalances).where(eq(pointBalances.userId, USER));
    console.log('cleaned up smoke rows for user', USER);
  }

  console.log(pass ? '\nPOINTS SMOKE PASSED' : '\nPOINTS SMOKE FAILED');
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke error:', err);
  process.exit(1);
});
