/**
 * Democracy Points — the award engine.
 *
 * `awardPoints` is the single entry point for crediting civic participation.
 * It is:
 *  - idempotent — one award per (user, action, target), enforced by a unique
 *    index, so a hook firing twice (retry, replay) credits once;
 *  - cap-aware — honours the rolling-window caps in the schedule;
 *  - non-throwing — a points failure must never break the civic action that
 *    triggered it, so callers can `await awardPoints(...)` safely inline.
 *
 * Every award is one append-only `point_transactions` row plus a cached
 * `point_balances` update, written together in a transaction.
 */

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db';
import { pointTransactions, pointBalances } from '@shared/schema';
import { POINT_SCHEDULE } from './schedule';

export interface AwardArgs {
  userId: number;
  /** Must be a key in POINT_SCHEDULE. */
  actionKey: string;
  /** What the award is for, e.g. 'proposal' / 'sortition_member'. */
  refType: string;
  /** The id of that thing — the idempotency anchor. */
  refId: number;
  note?: string;
}

export interface AwardResult {
  awarded: boolean;
  points: number;
  reason: 'awarded' | 'already_awarded' | 'capped' | 'unknown_action' | 'error';
}

/** Award participation points for one civic action. Idempotent, never throws. */
export async function awardPoints(args: AwardArgs): Promise<AwardResult> {
  try {
    const rule = POINT_SCHEDULE[args.actionKey];
    if (!rule) return { awarded: false, points: 0, reason: 'unknown_action' };

    // Rolling-window cap (best-effort; idempotency handles exact double-claims).
    if (rule.cap) {
      const since = new Date(Date.now() - rule.cap.windowDays * 86_400_000);
      const [row] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(pointTransactions)
        .where(and(
          eq(pointTransactions.userId, args.userId),
          eq(pointTransactions.actionKey, args.actionKey),
          gte(pointTransactions.createdAt, since),
        ));
      if ((row?.c ?? 0) >= rule.cap.max) {
        return { awarded: false, points: 0, reason: 'capped' };
      }
    }

    const credited = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(pointTransactions)
        .values({
          userId: args.userId,
          kind: 'participation',
          points: rule.points,
          actionKey: args.actionKey,
          refType: args.refType,
          refId: args.refId,
          note: args.note ?? null,
        })
        .onConflictDoNothing({
          target: [
            pointTransactions.userId,
            pointTransactions.actionKey,
            pointTransactions.refType,
            pointTransactions.refId,
          ],
        })
        .returning({ id: pointTransactions.id });

      if (inserted.length === 0) return false; // already awarded

      await tx
        .insert(pointBalances)
        .values({
          userId: args.userId,
          balance: rule.points,
          lifetimeEarned: rule.points,
        })
        .onConflictDoUpdate({
          target: pointBalances.userId,
          set: {
            balance: sql`${pointBalances.balance} + ${rule.points}`,
            lifetimeEarned: sql`${pointBalances.lifetimeEarned} + ${rule.points}`,
            updatedAt: new Date(),
          },
        });
      return true;
    });

    return credited
      ? { awarded: true, points: rule.points, reason: 'awarded' }
      : { awarded: false, points: 0, reason: 'already_awarded' };
  } catch (err) {
    console.error('awardPoints failed:', err);
    return { awarded: false, points: 0, reason: 'error' };
  }
}

export interface PointSummary {
  balance: number;
  lifetimeEarned: number;
  transactions: (typeof pointTransactions.$inferSelect)[];
}

/** Balance + recent ledger for one user — for the citizen-facing API. */
export async function getPointSummary(
  userId: number,
  limit = 50,
): Promise<PointSummary> {
  const [balanceRow] = await db
    .select()
    .from(pointBalances)
    .where(eq(pointBalances.userId, userId))
    .limit(1);

  const transactions = await db
    .select()
    .from(pointTransactions)
    .where(eq(pointTransactions.userId, userId))
    .orderBy(desc(pointTransactions.id))
    .limit(limit);

  return {
    balance: balanceRow?.balance ?? 0,
    lifetimeEarned: balanceRow?.lifetimeEarned ?? 0,
    transactions,
  };
}
