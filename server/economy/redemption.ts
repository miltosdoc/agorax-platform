/**
 * Democracy Points — redemption.
 *
 * Redemption converts points to EUR. It is honestly gated twice:
 *  - the economy phase must be past `pre_revenue` (the platform must have
 *    real revenue to back a payout), and
 *  - the citizen must be identity-verified (Gov.gr) — this, not the ledger,
 *    is what stops Sybil farming from cashing out.
 *
 * A request debits (holds) the points immediately and records a
 * `point_redemptions` row. An admin then approves + pays it (writing a
 * transparent `treasury_ledger` entry) or rejects it (refunding the hold).
 * Payout itself is a deliberate human step — no fake automation.
 */

import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  pointTransactions,
  pointBalances,
  pointRedemptions,
  treasuryLedger,
  users,
} from '@shared/schema';
import { getEconomyPhase, getPointsPerEur, pointsToEur, redemptionOpen } from './config';

export type RedemptionDecision = 'approve' | 'reject' | 'pay';

export interface RedemptionResult {
  ok: boolean;
  reason?: 'invalid_amount' | 'phase_closed' | 'not_verified' | 'insufficient' | 'error';
  redemptionId?: number;
  eurAmount?: number;
}

/** Identity-verified (Gov.gr) — required before any redemption. */
export async function isVerified(userId: number): Promise<boolean> {
  const [u] = await db
    .select({ hash: users.govgrVoterHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Boolean(u?.hash);
}

/** Request a redemption — phase- and verification-gated; debits on success. */
export async function requestRedemption(
  userId: number,
  points: number,
): Promise<RedemptionResult> {
  try {
    if (!Number.isInteger(points) || points <= 0) {
      return { ok: false, reason: 'invalid_amount' };
    }
    if (!redemptionOpen(await getEconomyPhase())) {
      return { ok: false, reason: 'phase_closed' };
    }
    if (!(await isVerified(userId))) {
      return { ok: false, reason: 'not_verified' };
    }

    const eurAmount = pointsToEur(points, await getPointsPerEur());

    const redemptionId = await db.transaction(async (tx) => {
      const [bal] = await tx
        .select()
        .from(pointBalances)
        .where(eq(pointBalances.userId, userId))
        .limit(1);
      if (!bal || bal.balance < points) return null;

      const [redemption] = await tx
        .insert(pointRedemptions)
        .values({
          userId,
          points,
          eurAmount: String(eurAmount),
          targetCurrency: 'EUR',
          status: 'requested',
        })
        .returning({ id: pointRedemptions.id });

      // Hold the points: a negative ledger entry keyed to the redemption row.
      await tx.insert(pointTransactions).values({
        userId,
        kind: 'redemption',
        points: -points,
        actionKey: 'redemption',
        refType: 'redemption',
        refId: redemption.id,
        note: `Redemption request #${redemption.id}`,
      });
      await tx
        .update(pointBalances)
        .set({ balance: bal.balance - points, updatedAt: new Date() })
        .where(eq(pointBalances.userId, userId));

      return redemption.id;
    });

    if (redemptionId == null) return { ok: false, reason: 'insufficient' };
    return { ok: true, redemptionId, eurAmount };
  } catch (err) {
    console.error('requestRedemption failed:', err);
    return { ok: false, reason: 'error' };
  }
}

/** List redemptions — one user's own, or (no userId) all, newest first. */
export async function listRedemptions(userId?: number) {
  if (userId == null) {
    return db
      .select()
      .from(pointRedemptions)
      .orderBy(desc(pointRedemptions.id))
      .limit(200);
  }
  return db
    .select()
    .from(pointRedemptions)
    .where(eq(pointRedemptions.userId, userId))
    .orderBy(desc(pointRedemptions.id))
    .limit(200);
}

/** Admin: approve / reject (refunds the hold) / pay (writes a treasury entry). */
export async function decideRedemption(
  id: number,
  decision: RedemptionDecision,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const [r] = await db
      .select()
      .from(pointRedemptions)
      .where(eq(pointRedemptions.id, id))
      .limit(1);
    if (!r) return { ok: false, reason: 'not_found' };
    if (r.status === 'paid' || r.status === 'rejected') {
      return { ok: false, reason: 'already_decided' };
    }

    if (decision === 'approve') {
      await db
        .update(pointRedemptions)
        .set({ status: 'approved', decidedAt: new Date() })
        .where(eq(pointRedemptions.id, id));
      return { ok: true };
    }

    if (decision === 'reject') {
      // If the redemption's user was erased (Art. 17), the points-to-be-
      // refunded have no destination: balance row was deleted and the
      // ledger has no user binding. Reject without refund — the points
      // become unrecoverable from the user's perspective by their own
      // erasure request.
      const refundUserId = r.userId;
      await db.transaction(async (tx) => {
        await tx
          .update(pointRedemptions)
          .set({ status: 'rejected', decidedAt: new Date() })
          .where(eq(pointRedemptions.id, id));
        if (refundUserId == null) return;
        // Refund the held points.
        await tx.insert(pointTransactions).values({
          userId: refundUserId,
          kind: 'adjustment',
          points: r.points,
          actionKey: 'redemption_refund',
          refType: 'redemption',
          refId: r.id,
          note: `Refund of rejected redemption #${r.id}`,
        });
        await tx
          .update(pointBalances)
          .set({
            balance: sql`${pointBalances.balance} + ${r.points}`,
            updatedAt: new Date(),
          })
          .where(eq(pointBalances.userId, refundUserId));
      });
      return { ok: true };
    }

    // pay
    await db.transaction(async (tx) => {
      await tx
        .update(pointRedemptions)
        .set({ status: 'paid', decidedAt: new Date() })
        .where(eq(pointRedemptions.id, id));
      await tx.insert(treasuryLedger).values({
        entryType: 'citizen_payout',
        eurAmount: r.eurAmount,
        refType: 'redemption',
        refId: r.id,
        note: `Payout for redemption #${r.id}`,
      });
    });
    return { ok: true };
  } catch (err) {
    console.error('decideRedemption failed:', err);
    return { ok: false, reason: 'error' };
  }
}

/** Public treasury totals — the platform's transparent ledger summary. */
export async function treasurySummary() {
  const rows = await db.select().from(treasuryLedger);
  let inboundEur = 0;
  let citizenPayoutsEur = 0;
  for (const row of rows) {
    const eur = Number(row.eurAmount);
    if (row.entryType === 'inbound_payment') inboundEur += eur;
    else if (row.entryType === 'citizen_payout') citizenPayoutsEur += eur;
  }
  return { inboundEur, citizenPayoutsEur, entryCount: rows.length };
}
