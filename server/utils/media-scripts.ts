/**
 * Greek media script generator — loads the proposal + top arguments from
 * the DB and feeds them into the pure templates in
 * `media-script-templates.ts`. Two outputs:
 *
 *   • Podcast script — a two-voice dialogue (~3–5 min read aloud) covering
 *     the question, the proposed solution, the strongest supporting and
 *     opposing arguments, and a close that asks listeners to read & vote.
 *   • Video teaser script — a ~30–60s narrator-style script.
 *
 * The composition is deterministic, in-process, and never calls an
 * external LLM. The GDPR audit
 * (docs/compliance/02_DATA_MINIMIZATION_AUDIT.md §4.2) bars proposal
 * text from leaving the instance, so this module stays local.
 */

import { db } from '../db';
import { proposals, communities, debateArguments } from '../../shared/schema';
import { desc, eq, sql } from 'drizzle-orm';
import {
  SCRIPT_LIMITS,
  trim,
  podcastScript,
  teaserScript,
  type ScriptContext,
} from './media-script-templates';

export interface ScriptInput {
  proposalId: number;
}

export interface ScriptResult {
  proposalId: number;
  kind: 'podcast' | 'video';
  language: 'el';
  script: string;
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

export async function generatePodcastScript(input: ScriptInput): Promise<ScriptResult> {
  const ctx = await loadProposalContext(input.proposalId);
  return {
    proposalId: input.proposalId,
    kind: 'podcast',
    language: 'el',
    script: podcastScript(ctx),
    meta: {
      communityName: ctx.communityName,
      question: ctx.proposal.question,
      forArgs: ctx.forArgs,
      againstArgs: ctx.againstArgs,
    },
  };
}

export async function generateTeaserScript(input: ScriptInput): Promise<ScriptResult> {
  const ctx = await loadProposalContext(input.proposalId);
  return {
    proposalId: input.proposalId,
    kind: 'video',
    language: 'el',
    script: teaserScript(ctx),
    meta: {
      communityName: ctx.communityName,
      question: ctx.proposal.question,
      forArgs: ctx.forArgs,
      againstArgs: ctx.againstArgs,
    },
  };
}
