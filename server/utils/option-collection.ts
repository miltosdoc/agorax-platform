/**
 * Co-drafting for an election or a poll: members build the ballot together.
 *
 * A decision is co-drafted by amending its text. An election and a poll have
 * no text to amend — they have options — so their co-drafting phase collects
 * those instead: candidacies (a member stands, or puts someone forward) and
 * poll answers the author did not think of. The author's own starting list
 * goes into the same table, so there is one list, not two.
 *
 * When the phase ends the active entries, in the order they came, become the
 * ballot and the list locks (lockCollectedOptions). An election that
 * gathered no candidate at all has nothing to vote on and is archived; a
 * poll that gathered no answer runs as a Yes/No question.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { proposalOptionSuggestions, proposals } from '@shared/schema';
import {
  MAX_COLLECTED_OPTIONS, kindCollectsOptions, proposalKindOf, refusalOptionLabel,
} from '@shared/proposal-kinds';

/** How many entries one member may add to a single list. */
export const MAX_OPTIONS_PER_MEMBER = 5;

export interface CollectedOption {
  id: number;
  label: string;
  userId: number | null;
  nomineeUserId: number | null;
  createdAt: Date;
}

export async function activeOptions(proposalId: number): Promise<CollectedOption[]> {
  return db
    .select({
      id: proposalOptionSuggestions.id,
      label: proposalOptionSuggestions.label,
      userId: proposalOptionSuggestions.userId,
      nomineeUserId: proposalOptionSuggestions.nomineeUserId,
      createdAt: proposalOptionSuggestions.createdAt,
    })
    .from(proposalOptionSuggestions)
    .where(and(eq(proposalOptionSuggestions.proposalId, proposalId), isNull(proposalOptionSuggestions.removedAt)))
    .orderBy(asc(proposalOptionSuggestions.createdAt), asc(proposalOptionSuggestions.id));
}

/** Whether this proposal is in its option-collecting phase right now. */
export function isCollecting(proposal: { status: string; track?: string | null; kind?: string | null }): boolean {
  return proposal.status === 'community_signal'
    && proposal.track !== 'vote'
    && kindCollectsOptions(proposalKindOf(proposal.kind));
}

export type AddOptionResult =
  | { ok: true; option: CollectedOption }
  | { ok: false; status: number; message: string };

/**
 * Add one entry to the list. `nomineeUserId` marks a member standing
 * themselves; everything else is a free-text name or answer.
 */
export async function addOption(opts: {
  proposalId: number;
  userId: number;
  label: string;
  nomineeUserId?: number | null;
  /** The author's starting list is not held to the per-member cap. */
  isAuthorSeed?: boolean;
}): Promise<AddOptionResult> {
  const label = opts.label.replace(/\s+/g, ' ').trim();
  if (label.length < 1 || label.length > 200) {
    return { ok: false, status: 400, message: 'Κάθε επιλογή πρέπει να έχει 1 έως 200 χαρακτήρες.' };
  }
  const current = await activeOptions(opts.proposalId);
  if (current.length >= MAX_COLLECTED_OPTIONS) {
    return { ok: false, status: 409, message: `Η λίστα γέμισε (${MAX_COLLECTED_OPTIONS} επιλογές).` };
  }
  if (current.some((o) => o.label.toLowerCase() === label.toLowerCase())) {
    return { ok: false, status: 409, message: 'Υπάρχει ήδη στη λίστα.' };
  }
  if (opts.nomineeUserId && current.some((o) => o.nomineeUserId === opts.nomineeUserId)) {
    return { ok: false, status: 409, message: 'Έχετε ήδη δηλώσει υποψηφιότητα.' };
  }
  if (!opts.isAuthorSeed && current.filter((o) => o.userId === opts.userId).length >= MAX_OPTIONS_PER_MEMBER) {
    return { ok: false, status: 429, message: `Κάθε μέλος προσθέτει έως ${MAX_OPTIONS_PER_MEMBER} επιλογές.` };
  }
  try {
    const [row] = await db.insert(proposalOptionSuggestions).values({
      proposalId: opts.proposalId,
      userId: opts.userId,
      nomineeUserId: opts.nomineeUserId ?? null,
      label,
    }).returning();
    return {
      ok: true,
      option: {
        id: row.id, label: row.label, userId: row.userId,
        nomineeUserId: row.nomineeUserId, createdAt: row.createdAt,
      },
    };
  } catch (err: any) {
    // Two members adding the same name in the same instant: the partial
    // unique index is the referee.
    if (err?.code === '23505') {
      return { ok: false, status: 409, message: 'Υπάρχει ήδη στη λίστα.' };
    }
    throw err;
  }
}

/**
 * Withdraw an entry. Whoever added it, the member it names, and the
 * proposal's author may; nobody else.
 */
export async function removeOption(opts: {
  proposalId: number;
  optionId: number;
  userId: number;
  isAuthor: boolean;
}): Promise<{ ok: boolean; status?: number; message?: string }> {
  const [row] = await db.select().from(proposalOptionSuggestions)
    .where(and(
      eq(proposalOptionSuggestions.id, opts.optionId),
      eq(proposalOptionSuggestions.proposalId, opts.proposalId),
      isNull(proposalOptionSuggestions.removedAt),
    ));
  if (!row) return { ok: false, status: 404, message: 'Η επιλογή δεν βρέθηκε.' };
  const allowed = opts.isAuthor || row.userId === opts.userId || row.nomineeUserId === opts.userId;
  if (!allowed) return { ok: false, status: 403, message: 'Την αφαιρεί μόνο όποιος την πρόσθεσε, το πρόσωπο που αφορά ή ο συντάκτης.' };
  await db.update(proposalOptionSuggestions)
    .set({ removedAt: new Date(), removedBy: opts.userId })
    .where(eq(proposalOptionSuggestions.id, row.id));
  return { ok: true };
}

/**
 * Freeze the collected list into the ballot. Runs before the proposal moves
 * to voting, so no ballot is ever validated against a list still changing.
 * Returns how many options were collected (the refusal option aside).
 */
export async function lockCollectedOptions(proposal: { id: number; kind?: string | null }): Promise<number> {
  const kind = proposalKindOf(proposal.kind);
  const options = (await activeOptions(proposal.id)).slice(0, MAX_COLLECTED_OPTIONS);
  const ballot = options.length > 0
    ? [
        ...options.map((o, i) => ({ id: `opt_${i + 1}`, label: o.label })),
        { id: 'status_quo', label: refusalOptionLabel(kind) },
      ]
    : null;
  await db.update(proposals)
    .set({ ballotOptions: ballot, updatedAt: sql`now()` })
    .where(eq(proposals.id, proposal.id));
  return options.length;
}
