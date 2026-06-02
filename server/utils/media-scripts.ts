/**
 * Greek media script generator.
 *
 * Two outputs per proposal:
 *   • Podcast script — a two-voice dialogue (~3–5 min read aloud).
 *   • Video teaser script — a ~30–60s narrator-style script.
 *
 * Generation path:
 *   1. Pull the proposal + community + top debate arguments from the DB.
 *   2. If `LLM_API_URL` / `LLM_API_KEY` / `LLM_MODEL` are configured,
 *      ask the configured private LLM to write the script in Greek
 *      using the structured context as the source of truth. The
 *      controller has audited this private endpoint (see §4.2 of the
 *      data-minimization audit) — the call is gated on env presence.
 *   3. If the LLM is unconfigured, unreachable, or returns garbage,
 *      fall back to the deterministic template in
 *      `media-script-templates.ts` so the feature never fails closed.
 *
 * The pure templates remain importable for unit tests.
 */

import { db } from '../db';
import { proposals, communities, debateArguments } from '../../shared/schema';
import { desc, eq, sql } from 'drizzle-orm';
import {
  SCRIPT_LIMITS,
  trim,
  podcastScript as templatePodcastScript,
  teaserScript as templateTeaserScript,
  type ScriptContext,
} from './media-script-templates';
import { chatCompletion, isLlmConfigured, LlmUnavailableError } from './llm-client';
import { logger } from './logger';

export interface ScriptInput {
  proposalId: number;
}

export interface ScriptResult {
  proposalId: number;
  kind: 'podcast' | 'video';
  language: 'el';
  script: string;
  /** `llm` when the configured model wrote it, `template` for the fallback. */
  source: 'llm' | 'template';
  meta: {
    communityName: string | null;
    question: string;
    forArgs: string[];
    againstArgs: string[];
  };
}

async function loadProposalContext(proposalId: number): Promise<ScriptContext> {
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId));
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  const [community] = await db
    .select({ name: communities.name })
    .from(communities)
    .where(eq(communities.id, proposal.communityId));

  const argRows = await db
    .select({
      side: debateArguments.side,
      text: debateArguments.text,
      support: debateArguments.supportCount,
      opposition: debateArguments.oppositionCount,
    })
    .from(debateArguments)
    .where(eq(debateArguments.proposalId, proposalId))
    .orderBy(
      desc(sql`COALESCE(${debateArguments.supportCount}, 0) - COALESCE(${debateArguments.oppositionCount}, 0)`),
      desc(debateArguments.createdAt),
    );

  const forArgs: string[] = [];
  const againstArgs: string[] = [];
  for (const row of argRows) {
    if (row.side === 'for' && forArgs.length < SCRIPT_LIMITS.MAX_ARGS_PER_SIDE) {
      forArgs.push(trim(row.text, SCRIPT_LIMITS.ARG_MAX_CHARS));
    } else if (row.side === 'against' && againstArgs.length < SCRIPT_LIMITS.MAX_ARGS_PER_SIDE) {
      againstArgs.push(trim(row.text, SCRIPT_LIMITS.ARG_MAX_CHARS));
    }
    if (
      forArgs.length >= SCRIPT_LIMITS.MAX_ARGS_PER_SIDE
      && againstArgs.length >= SCRIPT_LIMITS.MAX_ARGS_PER_SIDE
    ) break;
  }

  return {
    proposal: { question: proposal.question, solution: proposal.solution },
    communityName: community?.name ?? null,
    forArgs,
    againstArgs,
  };
}

// ─── LLM prompts ─────────────────────────────────────────────────────────────

const PODCAST_SYSTEM = [
  'Είσαι σεναριογράφος podcast για την AgoraX, μια ψηφιακή πλατφόρμα συμμετοχικής δημοκρατίας στην Ελλάδα.',
  'Γράφεις στα ελληνικά, με τόνο ψύχραιμο, ενημερωτικό και ισορροπημένο.',
  'Δεν παίρνεις πλευρά. Δεν κατασκευάζεις δεδομένα — χρησιμοποιείς μόνο όσα σου δίνονται.',
  'Παράγεις διάλογο δύο φωνών (Α: παρουσιαστής/τρια, Β: αναλυτής/τρια) σε καθαρή μορφή markdown με ενότητες ## .',
].join(' ');

const TEASER_SYSTEM = [
  'Είσαι σεναριογράφος σύντομων βίντεο (45 δευτερόλεπτα) για κοινωνικά δίκτυα, για την AgoraX.',
  'Γράφεις στα ελληνικά, άμεσα και καθαρά, με στόχο να οδηγήσεις τον θεατή να μπει στην πλατφόρμα και να ψηφίσει.',
  'Δεν παίρνεις πλευρά. Δεν κατασκευάζεις δεδομένα.',
  'Παράγεις 5 σκηνές σε καθαρή μορφή markdown με ενότητες ## που περιγράφουν Πλάνο και Αφήγηση.',
].join(' ');

function buildContextBlock(ctx: ScriptContext): string {
  const forBlock = ctx.forArgs.length
    ? ctx.forArgs.map((a, i) => `  ${i + 1}. ${a}`).join('\n')
    : '  (δεν έχουν κατατεθεί ακόμη επιχειρήματα)';
  const againstBlock = ctx.againstArgs.length
    ? ctx.againstArgs.map((a, i) => `  ${i + 1}. ${a}`).join('\n')
    : '  (δεν έχουν κατατεθεί ακόμη επιχειρήματα)';
  return [
    `Κοινότητα: ${ctx.communityName ?? '(γενική κοινότητα)'}`,
    `Ερώτημα της πρότασης:`,
    `  ${ctx.proposal.question}`,
    `Προτεινόμενη λύση:`,
    `  ${ctx.proposal.solution}`,
    `Επιχειρήματα υπέρ (σε σειρά δημοτικότητας):`,
    forBlock,
    `Επιχειρήματα κατά (σε σειρά δημοτικότητας):`,
    againstBlock,
  ].join('\n');
}

function podcastUserPrompt(ctx: ScriptContext): string {
  return [
    'Δομή που θέλω:',
    '  # Σενάριο podcast — AgoraX',
    '  ## Εισαγωγή — Α/Β χαιρετούν και πλαισιώνουν το θέμα μέσα στην κοινότητα.',
    '  ## Το ερώτημα — Α διαβάζει, Β σχολιάζει σύντομα γιατί τέθηκε.',
    '  ## Η προτεινόμενη λύση — Β εξηγεί τι περιλαμβάνει.',
    '  ## Τι λένε όσοι υποστηρίζουν την πρόταση — αναπτύσσει τα επιχειρήματα υπέρ.',
    '  ## Τι λένε όσοι αντιτίθενται — αναπτύσσει τα επιχειρήματα κατά.',
    '  ## Σύνοψη & κάλεσμα — Α/Β καλούν τους ακροατές να συμμετάσχουν.',
    '',
    'Όταν δεν υπάρχουν επιχειρήματα μιας πλευράς, αναγνώρισέ το ευγενικά και κάλεσε τα μέλη να συμμετέχουν.',
    'Στόχος συνολικής διάρκειας: 3–5 λεπτά εκφώνησης. Κάθε ατάκα Α: ή Β: σε νέα γραμμή.',
    '',
    'Δεδομένα της πρότασης:',
    '',
    buildContextBlock(ctx),
  ].join('\n');
}

function teaserUserPrompt(ctx: ScriptContext): string {
  return [
    'Δομή που θέλω:',
    '  # Σενάριο σύντομου βίντεο (~45 δευτερόλεπτα) — AgoraX',
    '  ## Σκηνή 1 — Hook (0:00–0:05)',
    '  ## Σκηνή 2 — Το ερώτημα (0:05–0:15)',
    '  ## Σκηνή 3 — Η πρόταση (0:15–0:25)',
    '  ## Σκηνή 4 — Δύο πλευρές (0:25–0:38)',
    '  ## Σκηνή 5 — Κάλεσμα δράσης (0:38–0:45)',
    '',
    'Σε κάθε σκηνή γράψε δύο γραμμές:',
    '  Πλάνο: σύντομη περιγραφή της εικόνας.',
    '  Αφήγηση: το κείμενο που θα ακουστεί.',
    '',
    'Όταν δεν υπάρχει επιχείρημα μιας πλευράς, ανάφερε ότι η συζήτηση είναι ανοιχτή.',
    'Άμεσος, καθαρός τόνος. Συνολική διάρκεια στόχος ~45 δευτερόλεπτα.',
    '',
    'Δεδομένα της πρότασης:',
    '',
    buildContextBlock(ctx),
  ].join('\n');
}

async function generateViaLlm(
  kind: 'podcast' | 'video',
  ctx: ScriptContext,
): Promise<string> {
  const system = kind === 'podcast' ? PODCAST_SYSTEM : TEASER_SYSTEM;
  const user = kind === 'podcast' ? podcastUserPrompt(ctx) : teaserUserPrompt(ctx);
  const out = await chatCompletion({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: kind === 'podcast' ? 2000 : 1200,
    temperature: 0.7,
    // The configured xsilico endpoint serves Qwen 3.6, a reasoning
    // model that, with thinking on, will spend the entire token
    // budget on internal chain-of-thought and emit nothing.
    enableThinking: false,
    timeoutMs: 90_000,
  });
  return out.trim();
}

async function generate(
  kind: 'podcast' | 'video',
  proposalId: number,
): Promise<ScriptResult> {
  const ctx = await loadProposalContext(proposalId);
  let script: string;
  let source: 'llm' | 'template' = 'template';
  if (isLlmConfigured()) {
    try {
      script = await generateViaLlm(kind, ctx);
      source = 'llm';
    } catch (err: any) {
      if (err instanceof LlmUnavailableError) {
        logger.warn('LLM script generation unavailable; using template', {
          proposalId, kind, err: err.message,
        });
      } else {
        logger.error('LLM script generation failed', {
          proposalId, kind, err: err?.message,
        });
      }
      script = kind === 'podcast' ? templatePodcastScript(ctx) : templateTeaserScript(ctx);
    }
  } else {
    script = kind === 'podcast' ? templatePodcastScript(ctx) : templateTeaserScript(ctx);
  }
  return {
    proposalId,
    kind,
    language: 'el',
    script,
    source,
    meta: {
      communityName: ctx.communityName,
      question: ctx.proposal.question,
      forArgs: ctx.forArgs,
      againstArgs: ctx.againstArgs,
    },
  };
}

export async function generatePodcastScript(input: ScriptInput): Promise<ScriptResult> {
  return generate('podcast', input.proposalId);
}

export async function generateTeaserScript(input: ScriptInput): Promise<ScriptResult> {
  return generate('video', input.proposalId);
}
