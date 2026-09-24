/**
 * AI-written constitution articles.
 *
 * Each passed decision (see constitution.ts) is rewritten by the LLM as one
 * constitutional article: a short title and numbered clauses, faithful to
 * the adopted text. The model also flags decisions that set no rule at all
 * (a poll, a test vote, a call for ideas) so the AI version can move them
 * to an appendix instead of dressing them up as law.
 *
 * Results are cached in constitution_articles per (proposal, lang) and
 * reused while the adopted text is unchanged (source_hash). Generation runs
 * in the background, one article at a time across the whole server, on a
 * plain in-process queue rather than the shared job worker: a community
 * with 30 decisions would otherwise hold that worker — and every
 * notification behind it — for many minutes. A restart just drops the
 * queue; the next page view re-enqueues whatever is still missing.
 *
 * The adopted text stays authoritative; the AI version is a readable
 * consolidation and is labelled as such everywhere it appears.
 */

import { createHash } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { constitutionArticles } from '@shared/schema';
import { chatCompletion, isLlmConfigured, readLlmConfig } from './llm-client';
import { logger } from './logger';
import type { Decision, Lang } from './constitution';

export interface AiArticle {
  proposalId: number;
  normative: boolean;
  title: string;
  body: string;
}

export function sourceHash(d: Pick<Decision, 'question' | 'text'>): string {
  return createHash('sha256').update(`${d.question}\n\n${d.text}`).digest('hex');
}

/** Cached articles that still match their decision's adopted text. */
export async function getCachedArticles(decisions: Decision[], lang: Lang): Promise<Map<number, AiArticle>> {
  const out = new Map<number, AiArticle>();
  if (decisions.length === 0) return out;
  const rows = await db.select().from(constitutionArticles).where(and(
    eq(constitutionArticles.lang, lang),
    inArray(constitutionArticles.proposalId, decisions.map((d) => d.proposalId)),
  ));
  const want = new Map(decisions.map((d) => [d.proposalId, sourceHash(d)]));
  for (const r of rows) {
    if (want.get(r.proposalId) !== r.sourceHash) continue; // stale
    out.set(r.proposalId, { proposalId: r.proposalId, normative: r.normative, title: r.title, body: r.body });
  }
  return out;
}

// ─── Background queue ──────────────────────────────────────────────────────

interface Task { decision: Decision; lang: Lang; communityName: string }

const queue: Task[] = [];
const queued = new Set<string>();           // `${proposalId}:${lang}`
const failedAt = new Map<string, number>(); // back-off after a failed attempt
const RETRY_AFTER_MS = 10 * 60 * 1000;
let running = false;

export function aiAvailable(): boolean {
  return isLlmConfigured();
}

/** Is anything still queued or in flight for these decisions? */
export function pendingCount(decisions: Decision[], lang: Lang): number {
  return decisions.filter((d) => queued.has(`${d.proposalId}:${lang}`)).length;
}

/** Queue every decision that has no current article. Returns immediately. */
export function ensureArticles(decisions: Decision[], lang: Lang, communityName: string, have: Map<number, AiArticle>): void {
  if (!aiAvailable()) return;
  const now = Date.now();
  for (const d of decisions) {
    const key = `${d.proposalId}:${lang}`;
    if (have.has(d.proposalId) || queued.has(key)) continue;
    if (now - (failedAt.get(key) ?? 0) < RETRY_AFTER_MS) continue;
    queued.add(key);
    queue.push({ decision: d, lang, communityName });
  }
  if (!running) void drain();
}

async function drain(): Promise<void> {
  running = true;
  try {
    while (queue.length > 0) {
      const task = queue.shift()!;
      const key = `${task.decision.proposalId}:${task.lang}`;
      try {
        await generateAndStore(task);
        failedAt.delete(key);
      } catch (err: any) {
        failedAt.set(key, Date.now());
        logger.warn('constitution article generation failed', { proposalId: task.decision.proposalId, lang: task.lang, err: err?.message });
      } finally {
        queued.delete(key);
      }
    }
  } finally {
    running = false;
  }
}

// ─── Generation ────────────────────────────────────────────────────────────

const articleSchema = z.object({
  normative: z.boolean(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1),
});

function systemPrompt(lang: Lang): string {
  const language = lang === 'el' ? 'Greek' : 'English';
  return `You turn a decision that a community approved by vote into one article of that community's constitution.

Rules:
- Be faithful. Keep every rule, obligation, right, number, deadline and condition the adopted text contains. Add nothing that is not in it. Do not invent details, and do not add your own opinions or recommendations.
- Write formal, clear legal prose in ${language}. If the source is in another language, translate it faithfully.
- Drop discussion artifacts: labels such as "[Βελτίωση]" or "[Improvement]", calls such as "propose improvements", greetings, and meta-commentary about the voting process.
- The body is numbered clauses: "1. ...", "2. ...", one per line, separated by a blank line. A decision with one rule gets one clause.
- The title is short (at most 10 words) and names what the article governs, e.g. "Working group for coordination". No "Article N" prefix.
- normative is false when the decision sets no rule, obligation, right or course of action for the community: an opinion poll, a test vote, a preference ("which food do we prefer"), or an open call for ideas. For those, still give a title and a one-sentence body stating what was decided. Otherwise normative is true.

Respond with ONLY a JSON object: {"normative": boolean, "title": "...", "body": "..."}`;
}

async function generateAndStore({ decision, lang, communityName }: Task): Promise<void> {
  const user = `Community: ${communityName}
Question put to the vote: ${decision.question}
Result: ${decision.result}

Adopted text:
"""
${decision.text}
"""`;

  let lastErrors = '';
  for (let round = 1; round <= 2; round++) {
    const raw = await chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt(lang) },
        { role: 'user', content: round === 1 ? user : `${user}\n\nYour previous output failed validation (${lastErrors}). Return the corrected JSON only.` },
      ],
      temperature: 0.2,
      // Greek runs ~1 token per character; leave room for the full text.
      maxTokens: Math.max(4000, decision.text.length * 2),
      timeoutMs: 180_000,
      jsonMode: true,
    });
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { lastErrors = 'not valid JSON'; continue; }
    const r = articleSchema.safeParse(parsed);
    if (!r.success) { lastErrors = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '); continue; }

    const row = {
      proposalId: decision.proposalId,
      lang,
      sourceHash: sourceHash(decision),
      normative: r.data.normative,
      title: r.data.title.replace(/^(Άρθρο|Article)\s*\d+\s*[—:.-]\s*/i, ''),
      body: r.data.body,
      model: readLlmConfig()?.model ?? null,
      createdAt: new Date(),
    };
    await db.insert(constitutionArticles).values(row).onConflictDoUpdate({
      target: [constitutionArticles.proposalId, constitutionArticles.lang],
      set: { sourceHash: row.sourceHash, normative: row.normative, title: row.title, body: row.body, model: row.model, createdAt: row.createdAt },
    });
    return;
  }
  throw new Error(`article failed validation: ${lastErrors}`);
}
