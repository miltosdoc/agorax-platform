/**
 * Survey engine — per-respondent instrument rendering + response intake.
 *
 * Rendering rules:
 *   - piggyback-module items FIRST, fixed internal order, before any host
 *     item (order-effect control);
 *   - host items in authored order; option order randomized per respondent
 *     where the item says so, via a seed fixed on the response row (the
 *     instrument is stable across refreshes);
 *   - "Δεν ξέρω / Δεν απαντώ / Κανένα" style options are pinned at the end,
 *     outside the randomization;
 *   - answers are CANONICAL option indexes (the shuffle is presentation
 *     only), so marginals never need de-shuffling.
 *
 * Quality gate on submission (server-side, never trusts client timings for
 * the speeder check):
 *   - speeder: server-measured duration under a per-item floor;
 *   - straight-liner: ≥4 scale items all on the same canonical index;
 *   - attention: the mechanically-inserted check answered wrong.
 * Failing any flag marks the response quality_failed; it is excluded from
 * marginals and earns no Democracy Points.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, voteDb } from '../db';
import {
  surveyPolls, surveyItems, surveyResponses, surveyItemAnswers,
  type SurveyPoll, type SurveyItem, type SurveyResponse,
} from '@shared/schema';
import type { ResponseQualityFlags } from '@shared/polling';
import { respondentModuleItemIds } from './survey-module';
import { makeClaimCode } from './panel';

// ─── Option presentation ─────────────────────────────────────────────────────

const PINNED_OPTION_RE = /δεν ξέρω|δεν απαντώ|κανένα από|δγ\/δα|don't know|prefer not/i;

/** Deterministic per-(seed,item) shuffle of option display order. */
export function displayOrder(options: string[], randomize: boolean, seed: string, itemId: number): number[] {
  const indexes = options.map((_, i) => i);
  if (!randomize) return indexes;
  const movable = indexes.filter((i) => !PINNED_OPTION_RE.test(options[i]));
  const pinned = indexes.filter((i) => PINNED_OPTION_RE.test(options[i]));
  // Fisher–Yates driven by sha256(seed:itemId) bytes.
  const digest = createHash('sha256').update(`${seed}:${itemId}`).digest();
  for (let i = movable.length - 1; i > 0; i--) {
    const j = digest[i % digest.length] % (i + 1);
    [movable[i], movable[j]] = [movable[j], movable[i]];
  }
  return [...movable, ...pinned];
}

export interface InstrumentItem {
  id: number;
  text: string;
  itemType: string;
  /** Display-ordered options; `index` is the CANONICAL index to submit. */
  options: Array<{ index: number; text: string }> | null;
  required: boolean;
  isModuleItem: boolean;
  position: number;
}

export interface Instrument {
  pollId: number;
  title: string;
  tier: string;
  topicTag: string | null;
  responseId: number;
  status: string;
  /** Module items first (fixed order), then host items. */
  items: InstrumentItem[];
  moduleDisclosure: boolean;
}

// ─── Instrument build ────────────────────────────────────────────────────────

export async function loadPoll(pollId: number): Promise<SurveyPoll | null> {
  const [poll] = await db.select().from(surveyPolls).where(eq(surveyPolls.id, pollId)).limit(1);
  return poll ?? null;
}

/**
 * Build (or resume) the instrument for one panelist on one live poll.
 * Creates the in_progress response row on first touch.
 */
export async function buildInstrument(poll: SurveyPoll, panelistId: number): Promise<Instrument> {
  // Get-or-create the response row (unique on poll+panelist).
  let [response] = await voteDb
    .select()
    .from(surveyResponses)
    .where(and(eq(surveyResponses.pollId, poll.id), eq(surveyResponses.panelistId, panelistId)))
    .limit(1);

  if (!response) {
    const moduleIds = await respondentModuleItemIds(poll.id, panelistId);
    [response] = await voteDb.insert(surveyResponses).values({
      pollId: poll.id,
      panelistId,
      orderSeed: randomBytes(16).toString('hex'),
      moduleItemIds: moduleIds,
      hostTopicTag: poll.topicTag,
    }).onConflictDoNothing().returning();
    if (!response) {
      [response] = await voteDb
        .select()
        .from(surveyResponses)
        .where(and(eq(surveyResponses.pollId, poll.id), eq(surveyResponses.panelistId, panelistId)))
        .limit(1);
    }
  }

  const allItems: SurveyItem[] = await db
    .select()
    .from(surveyItems)
    .where(eq(surveyItems.pollId, poll.id))
    .orderBy(asc(surveyItems.position));

  const assignedModuleIds = new Set((response.moduleItemIds as number[]) ?? []);
  const moduleItemsList = allItems.filter((i) => i.isModuleItem && assignedModuleIds.has(i.id));
  const hostItems = allItems.filter((i) => !i.isModuleItem);

  const toInstrumentItem = (item: SurveyItem): InstrumentItem => {
    const options = (item.options as string[] | null) ?? null;
    return {
      id: item.id,
      text: item.text,
      itemType: item.itemType,
      options: options
        ? displayOrder(options, item.randomizeOptions, response.orderSeed, item.id)
            .map((idx) => ({ index: idx, text: options[idx] }))
        : null,
      required: item.required,
      isModuleItem: item.isModuleItem,
      position: item.position,
    };
  };

  return {
    pollId: poll.id,
    title: poll.title,
    tier: poll.tier,
    topicTag: poll.topicTag,
    responseId: response.id,
    status: response.status,
    items: [...moduleItemsList.map(toInstrumentItem), ...hostItems.map(toInstrumentItem)],
    moduleDisclosure: moduleItemsList.length > 0,
  };
}

// ─── Submission ──────────────────────────────────────────────────────────────

export interface SubmittedAnswer {
  itemId: number;
  /** Canonical index | number[] | string, per item type. */
  value: unknown;
  timeMs?: number;
}

export type SubmitResult =
  | { ok: true; qualityPassed: boolean; flags: ResponseQualityFlags; claimCode: string | null }
  | { ok: false; status: number; message: string };

/** Per-item minimum plausible dwell for the speeder floor (ms). */
const SPEEDER_FLOOR_PER_ITEM_MS = 1_500;
/** Straight-lining needs at least this many scale items to be meaningful. */
const STRAIGHTLINE_MIN_ITEMS = 4;

function validateAnswerValue(item: SurveyItem, value: unknown): string | null {
  const options = (item.options as string[] | null) ?? [];
  switch (item.itemType) {
    case 'single_choice':
    case 'likert': {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= options.length) {
        return `item ${item.id}: expected option index 0..${options.length - 1}`;
      }
      return null;
    }
    case 'multi_choice': {
      if (!Array.isArray(value) || value.length === 0) return `item ${item.id}: expected non-empty index array`;
      for (const v of value) {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= options.length) {
          return `item ${item.id}: invalid option index`;
        }
      }
      if (new Set(value).size !== value.length) return `item ${item.id}: duplicate indexes`;
      return null;
    }
    case 'open_text': {
      if (typeof value !== 'string' || value.length > 2000) return `item ${item.id}: expected text ≤2000 chars`;
      return null;
    }
    default:
      return `item ${item.id}: unknown item type`;
  }
}

export async function submitResponse(
  poll: SurveyPoll,
  panelistId: number,
  answers: SubmittedAnswer[],
): Promise<SubmitResult> {
  const [response] = await voteDb
    .select()
    .from(surveyResponses)
    .where(and(eq(surveyResponses.pollId, poll.id), eq(surveyResponses.panelistId, panelistId)))
    .limit(1);
  if (!response) return { ok: false, status: 400, message: 'No instrument requested for this poll' };
  if (response.status === 'completed') return { ok: false, status: 409, message: 'Already completed' };

  const allItems: SurveyItem[] = await db
    .select()
    .from(surveyItems)
    .where(eq(surveyItems.pollId, poll.id));
  const itemById = new Map(allItems.map((i) => [i.id, i]));

  const assignedModuleIds = new Set((response.moduleItemIds as number[]) ?? []);
  const expectedItems = allItems.filter(
    (i) => (i.isModuleItem ? assignedModuleIds.has(i.id) : true),
  );

  // Validate: every answer maps to an expected item, no strays, values typed.
  const answerByItem = new Map<number, SubmittedAnswer>();
  for (const a of answers) {
    const item = itemById.get(a.itemId);
    if (!item) return { ok: false, status: 400, message: `Unknown item ${a.itemId}` };
    if (item.isModuleItem && !assignedModuleIds.has(item.id)) {
      return { ok: false, status: 400, message: `Item ${a.itemId} not assigned to this respondent` };
    }
    const problem = validateAnswerValue(item, a.value);
    if (problem) return { ok: false, status: 400, message: problem };
    answerByItem.set(a.itemId, a);
  }
  for (const item of expectedItems) {
    if (item.required && !answerByItem.has(item.id)) {
      return { ok: false, status: 400, message: `Missing required item ${item.id}` };
    }
  }

  // ── Quality gate ──
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - new Date(response.startedAt).getTime();
  const answeredCount = answerByItem.size;
  const speeder = durationMs < answeredCount * SPEEDER_FLOOR_PER_ITEM_MS;

  const scaleAnswers: number[] = [];
  let failedAttention = false;
  for (const [itemId, a] of answerByItem) {
    const item = itemById.get(itemId)!;
    if (item.isAttentionCheck) {
      const options = (item.options as string[] | null) ?? [];
      const expectedIdx = options.indexOf(item.attentionExpected ?? '');
      if (expectedIdx !== -1 && a.value !== expectedIdx) failedAttention = true;
    } else if (
      // Straight-lining = same VISUAL position every time. Only fixed-order
      // scale items qualify: for randomized options the same canonical index
      // is a different screen position per item, so it can't be detected
      // (and an identical canonical index there is not straight-lining).
      (item.itemType === 'likert' || (item.itemType === 'single_choice' && !item.randomizeOptions)) &&
      typeof a.value === 'number'
    ) {
      scaleAnswers.push(a.value);
    }
  }
  const straightLiner =
    scaleAnswers.length >= STRAIGHTLINE_MIN_ITEMS && new Set(scaleAnswers).size === 1;

  const flags: ResponseQualityFlags = { speeder, straightLiner, failedAttention };
  const qualityPassed = !speeder && !straightLiner && !failedAttention;

  // Persist answers + completion atomically.
  const claim = qualityPassed ? makeClaimCode() : null;
  await voteDb.transaction(async (tx) => {
    for (const [itemId, a] of answerByItem) {
      await tx.insert(surveyItemAnswers).values({
        responseId: response.id,
        itemId,
        value: a.value as any,
        timeMs: typeof a.timeMs === 'number' && a.timeMs >= 0 && a.timeMs < 3_600_000 ? Math.round(a.timeMs) : null,
      }).onConflictDoNothing();
    }
    await tx.update(surveyResponses).set({
      status: 'completed',
      completedAt,
      durationMs,
      qualityFlags: flags,
      qualityPassed,
      claimCodeHash: claim?.codeHash ?? null,
    }).where(eq(surveyResponses.id, response.id));
  });

  return { ok: true, qualityPassed, flags, claimCode: claim?.code ?? null };
}

/** Completed-response counts for a poll (dashboards / auto-close checks). */
export async function completionStats(pollId: number): Promise<{ completed: number; qualityPassed: number }> {
  const rows = await voteDb
    .select({ qualityPassed: surveyResponses.qualityPassed })
    .from(surveyResponses)
    .where(and(eq(surveyResponses.pollId, pollId), eq(surveyResponses.status, 'completed')));
  return {
    completed: rows.length,
    qualityPassed: rows.filter((r) => r.qualityPassed === true).length,
  };
}
