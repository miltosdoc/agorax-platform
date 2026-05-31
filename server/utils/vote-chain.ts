/**
 * Tamper-evident vote chain.
 *
 * Every proposal has an append-only SHA-256 hash chain over its votes. A new
 * vote's row_hash binds the previous row's row_hash, the vote payload, and
 * the cast_at timestamp, so any tampering (including by a DBA) breaks the
 * chain at the point of tampering. A user who changes their vote inserts a
 * new row and the previous row's superseded_by_id is set to the new id;
 * tallies and "my current vote" reads filter superseded_by_id IS NULL.
 *
 * The head hash is exposed publicly so a third party can pin it
 * periodically — true immutability requires external anchoring, since on
 * its own the server could rewrite the whole chain.
 */

import { createHash } from 'crypto';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '../db';
import { proposalVotes, type ProposalVote } from '@shared/schema';

export const GENESIS_PREV_HASH = '0'.repeat(64);

export interface VoteReceipt {
  voteId: number;
  proposalId: number;
  userId: number;
  choice: string;
  weight: string;
  castAt: string;
  prevHash: string;
  rowHash: string;
}

/**
 * Canonical serialization. Order and separators matter — any change here is
 * a chain-breaking change.
 *
 * For pseudonymous votes: millisecond precision (identity is already known).
 * For anonymous votes: coarsened to minute precision to prevent temporal
 * correlation between token issuance and vote casting.
 * See docs/compliance/AUDIT_IDENTITY_VOTE_ANONYMITY.md §G12
 */
function canonicalizeCastAt(castAt: Date, mode: 'pseudonymous' | 'anonymous'): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const d = new Date(castAt.getTime());
  const datePart =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

  if (mode === 'anonymous') {
    // Coarsen to minute precision — seconds and milliseconds are zeroed.
    // This prevents temporal correlation between the authenticated /blind-sign
    // request and the unauthenticated /anonymous-vote request.
    return `${datePart}:00.000Z`;
  }

  // Pseudonymous: full millisecond precision (identity is already known).
  return (
    `${datePart}:${pad(d.getUTCSeconds())}` +
    `.${pad(d.getUTCMilliseconds(), 3)}Z`
  );
}

/**
 * Compute a chain row hash. Two modes (per migration 0021):
 *   - pseudonymous: input set is (prev, proposal_id, user_id, choice, weight, cast_at)
 *   - anonymous:    input set is (prev, proposal_id, vote_token, choice, weight, cast_at)
 *
 * The mode token itself is included as a domain separator so a row in one
 * mode cannot be replayed as the other.
 */
export function computeRowHash(input: {
  prevHash: string;
  proposalId: number;
  identity: { mode: 'pseudonymous'; userId: number } | { mode: 'anonymous'; voteToken: string };
  choice: string;
  weight: string;
  castAt: Date;
}): string {
  const mode = input.identity.mode;
  const identityField =
    mode === 'pseudonymous'
      ? String(input.identity.userId)
      : input.identity.voteToken;
  const canonical = [
    input.prevHash,
    String(input.proposalId),
    mode,
    identityField,
    input.choice,
    input.weight,
    canonicalizeCastAt(input.castAt, mode),
  ].join('|');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Cast a vote and extend the per-proposal hash chain.
 *
 * Concurrency: `SELECT ... FOR UPDATE` on the parent `proposals` row
 * serializes all votes against the same proposal, so the read-then-write
 * sequence for prev_hash cannot race.
 */
export async function castProposalVoteWithChain(args: {
  proposalId: number;
  userId: number;
  choice: string;
  weight?: string;
}): Promise<ProposalVote & { receipt: VoteReceipt }> {
  const { proposalId, userId, choice } = args;
  const weight = args.weight ?? '1';

  return await db.transaction(async (tx) => {
    // Serialize per proposal. If the proposal doesn't exist, the caller has
    // a bug — the route layer validates existence before us.
    await tx.execute(sql`SELECT id FROM proposals WHERE id = ${proposalId} FOR UPDATE`);

    const [prev] = await tx
      .select({ rowHash: proposalVotes.rowHash })
      .from(proposalVotes)
      .where(eq(proposalVotes.proposalId, proposalId))
      .orderBy(desc(proposalVotes.id))
      .limit(1);

    const prevHash = prev?.rowHash ?? GENESIS_PREV_HASH;
    const castAt = new Date();
    const rowHash = computeRowHash({
      prevHash,
      proposalId,
      identity: { mode: 'pseudonymous', userId },
      choice,
      weight,
      castAt,
    });

    const [inserted] = await tx
      .insert(proposalVotes)
      .values({
        proposalId,
        userId,
        choice,
        weight,
        castAt,
        prevHash,
        rowHash,
      })
      .returning();

    // Mark this user's prior current vote (if any) as superseded.
    await tx
      .update(proposalVotes)
      .set({ supersededById: inserted.id })
      .where(
        and(
          eq(proposalVotes.proposalId, proposalId),
          eq(proposalVotes.userId, userId),
          ne(proposalVotes.id, inserted.id),
          isNull(proposalVotes.supersededById),
        ),
      );

    return {
      ...inserted,
      receipt: {
        voteId: inserted.id,
        proposalId,
        userId,
        choice,
        weight,
        castAt: canonicalizeCastAt(castAt, 'pseudonymous'),
        prevHash,
        rowHash,
      },
    };
  });
}

/**
 * Cast an anonymous vote — token + signature only, no user_id. Caller is
 * responsible for verifying the RSA-blind signature on the token BEFORE
 * calling this. Caller is also responsible for the unauthenticated
 * request shape (we deliberately do not capture req.user here).
 *
 * Double-spend is prevented at the DB layer by the
 * proposal_votes_token_unique index (unique on (proposal_id, vote_token)
 * WHERE vote_token IS NOT NULL).
 */
export async function castAnonymousVoteWithChain(args: {
  proposalId: number;
  voteToken: string;
  choice: string;
  weight?: string;
}): Promise<ProposalVote & { receipt: Omit<VoteReceipt, 'userId'> & { voteToken: string } }> {
  const { proposalId, voteToken, choice } = args;
  const weight = args.weight ?? '1';

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM proposals WHERE id = ${proposalId} FOR UPDATE`);

    const [prev] = await tx
      .select({ rowHash: proposalVotes.rowHash })
      .from(proposalVotes)
      .where(eq(proposalVotes.proposalId, proposalId))
      .orderBy(desc(proposalVotes.id))
      .limit(1);

    const prevHash = prev?.rowHash ?? GENESIS_PREV_HASH;
    const castAt = new Date();
    const rowHash = computeRowHash({
      prevHash,
      proposalId,
      identity: { mode: 'anonymous', voteToken },
      choice,
      weight,
      castAt,
    });

    const [inserted] = await tx
      .insert(proposalVotes)
      .values({
        proposalId,
        userId: null,
        voteToken,
        votingMode: 'anonymous',
        choice,
        weight,
        castAt,
        prevHash,
        rowHash,
      })
      .returning();

    return {
      ...inserted,
      receipt: {
        voteId: inserted.id,
        proposalId,
        voteToken,
        choice,
        weight,
        castAt: canonicalizeCastAt(castAt, 'anonymous'),
        prevHash,
        rowHash,
      },
    };
  });
}

export interface ChainHead {
  proposalId: number;
  headHash: string;
  total: number;
  lastCastAt: Date | null;
}

export async function getChainHead(proposalId: number): Promise<ChainHead> {
  const [last] = await db
    .select({
      rowHash: proposalVotes.rowHash,
      castAt: proposalVotes.castAt,
    })
    .from(proposalVotes)
    .where(eq(proposalVotes.proposalId, proposalId))
    .orderBy(desc(proposalVotes.id))
    .limit(1);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(proposalVotes)
    .where(eq(proposalVotes.proposalId, proposalId));

  return {
    proposalId,
    headHash: last?.rowHash ?? GENESIS_PREV_HASH,
    total: total ?? 0,
    lastCastAt: last?.castAt ?? null,
  };
}

export interface ChainVerification {
  ok: boolean;
  proposalId: number;
  headHash: string;
  total: number;
  erasedCount: number;
  firstBreakAt?: { voteId: number; reason: string };
}

/**
 * Walk the chain and recompute each row hash. Returns ok=true iff every row
 * verifies and prev_hash links match. On break, firstBreakAt names the row
 * whose computed hash doesn't match its stored hash, or whose prev_hash
 * doesn't match the previous row's row_hash.
 *
 * Crypto-shredded rows (Art. 17 — see INTERNAL_POLICIES.md §2.4) are
 * recognised by erased_at IS NOT NULL. For those rows we verify only the
 * prev_hash linkage and accept the stored row_hash as opaque (we no longer
 * have the original user_id needed to recompute it). The chain therefore
 * remains intact across erased rows; only the row's *content* is opaque.
 */
export async function verifyChain(proposalId: number): Promise<ChainVerification> {
  const rows = await db
    .select()
    .from(proposalVotes)
    .where(eq(proposalVotes.proposalId, proposalId))
    .orderBy(proposalVotes.id);

  let expectedPrev = GENESIS_PREV_HASH;
  let erasedCount = 0;
  for (const row of rows) {
    if (row.prevHash !== expectedPrev) {
      return {
        ok: false,
        proposalId,
        headHash: rows[rows.length - 1]?.rowHash ?? GENESIS_PREV_HASH,
        total: rows.length,
        erasedCount,
        firstBreakAt: { voteId: row.id, reason: 'prev_hash mismatch' },
      };
    }
    if (row.erasedAt !== null) {
      // Crypto-shredded row — row_hash stays opaque, chain linkage intact.
      erasedCount++;
      expectedPrev = row.rowHash;
      continue;
    }
    let identity: { mode: 'pseudonymous'; userId: number } | { mode: 'anonymous'; voteToken: string } | null = null;
    if (row.votingMode === 'anonymous') {
      if (row.voteToken === null) {
        return {
          ok: false,
          proposalId,
          headHash: rows[rows.length - 1]?.rowHash ?? GENESIS_PREV_HASH,
          total: rows.length,
          erasedCount,
          firstBreakAt: { voteId: row.id, reason: 'anonymous row missing vote_token' },
        };
      }
      identity = { mode: 'anonymous', voteToken: row.voteToken };
    } else {
      if (row.userId === null) {
        return {
          ok: false,
          proposalId,
          headHash: rows[rows.length - 1]?.rowHash ?? GENESIS_PREV_HASH,
          total: rows.length,
          erasedCount,
          firstBreakAt: { voteId: row.id, reason: 'pseudonymous row missing user_id (not erased)' },
        };
      }
      identity = { mode: 'pseudonymous', userId: row.userId };
    }
    const recomputed = computeRowHash({
      prevHash: row.prevHash,
      proposalId: row.proposalId,
      identity,
      choice: row.choice,
      weight: row.weight,
      castAt: row.castAt,
    });
    if (recomputed !== row.rowHash) {
      return {
        ok: false,
        proposalId,
        headHash: rows[rows.length - 1]?.rowHash ?? GENESIS_PREV_HASH,
        total: rows.length,
        erasedCount,
        firstBreakAt: { voteId: row.id, reason: 'row_hash mismatch' },
      };
    }
    expectedPrev = row.rowHash;
  }

  return {
    ok: true,
    proposalId,
    headHash: rows[rows.length - 1]?.rowHash ?? GENESIS_PREV_HASH,
    total: rows.length,
    erasedCount,
  };
}
