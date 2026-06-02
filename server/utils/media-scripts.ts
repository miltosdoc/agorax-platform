/**
 * Greek media script generator — local, deterministic, no external LLM.
 *
 * For each proposal we synthesise two scripts the user can paste into
 * NotebookLM (or any podcast/video tool):
 *
 *   • Podcast script — a two-voice dialogue (~3–5 minutes when read at a
 *     natural pace) covering the question, the proposed solution, the
 *     strongest supporting and opposing arguments, and a closing call to
 *     read and vote on AgoraX.
 *
 *   • Video teaser script — a ~30-60s narrator-style script with a hook,
 *     three claims, and a CTA.
 *
 * The composition is deterministic and template-driven. The GDPR audit
 * (docs/compliance/02_DATA_MINIMIZATION_AUDIT.md §4.2) bars proposal text
 * from leaving the instance via external LLMs; this module therefore
 * stays in-process. Greek phrasing is hand-curated to read naturally
 * aloud.
 */

import { db } from '../db';
import { proposals, communities, debateArguments, users } from '../../shared/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

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

const MAX_ARGS_PER_SIDE = 3;
const ARG_MAX_CHARS = 280;

function trim(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max - 1).replace(/[\s,.;]+$/, '') + '…';
}

async function loadProposalContext(proposalId: number) {
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
    if (row.side === 'for' && forArgs.length < MAX_ARGS_PER_SIDE) {
      forArgs.push(trim(row.text, ARG_MAX_CHARS));
    } else if (row.side === 'against' && againstArgs.length < MAX_ARGS_PER_SIDE) {
      againstArgs.push(trim(row.text, ARG_MAX_CHARS));
    }
    if (forArgs.length >= MAX_ARGS_PER_SIDE && againstArgs.length >= MAX_ARGS_PER_SIDE) break;
  }

  return {
    proposal,
    communityName: community?.name ?? null,
    forArgs,
    againstArgs,
  };
}

function bullet(text: string): string {
  return `• ${text}`;
}

function podcastScript(ctx: Awaited<ReturnType<typeof loadProposalContext>>): string {
  const { proposal, communityName, forArgs, againstArgs } = ctx;
  const opening = communityName
    ? `Καλώς ήρθατε στο AgoraX. Σήμερα, από την κοινότητα «${communityName}», συζητάμε μια πρόταση που σας αφορά.`
    : `Καλώς ήρθατε στο AgoraX. Σήμερα συζητάμε μια πρόταση που σας αφορά.`;

  const forBlock = forArgs.length
    ? forArgs.map((t, i) => `Β: Επιχείρημα ${i + 1} υπέρ. ${t}`).join('\n\n')
    : `Β: Δεν έχουν κατατεθεί ακόμη επιχειρήματα υπέρ. Καλούμε τα μέλη της κοινότητας να συμμετέχουν στον διάλογο.`;

  const againstBlock = againstArgs.length
    ? againstArgs.map((t, i) => `Α: Επιχείρημα ${i + 1} κατά. ${t}`).join('\n\n')
    : `Α: Δεν έχουν κατατεθεί ακόμη επιχειρήματα κατά. Η εικόνα μπορεί να αλλάξει καθώς προχωρά η διαβούλευση.`;

  return [
    `# Σενάριο podcast — AgoraX`,
    ``,
    `Φωνή Α (παρουσιαστής/ρια) · Φωνή Β (αναλυτής/τρια)`,
    `Διάρκεια στόχος: 3–5 λεπτά.`,
    `Τόνος: ψύχραιμος, ενημερωτικός, χωρίς επικριτικό ύφος.`,
    ``,
    `## Εισαγωγή`,
    `Α: ${opening}`,
    ``,
    `## Το ερώτημα`,
    `Α: Το ερώτημα που τέθηκε στην κοινότητα είναι το εξής:`,
    `Β: «${trim(proposal.question, 600)}»`,
    ``,
    `## Η προτεινόμενη λύση`,
    `Α: Η πρόταση που έχει τεθεί υπό διαβούλευση προτείνει:`,
    `Β: ${trim(proposal.solution, 900)}`,
    ``,
    `## Τι λένε όσοι υποστηρίζουν την πρόταση`,
    `Α: Ας ακούσουμε πρώτα την πλευρά που συμφωνεί.`,
    forBlock,
    ``,
    `## Τι λένε όσοι αντιτίθενται`,
    `Α: Και τώρα τα επιχειρήματα κατά.`,
    againstBlock,
    ``,
    `## Σύνοψη & κάλεσμα`,
    `Α: Αυτά τα επιχειρήματα δεν είναι τα μόνα. Η δική σας φωνή λείπει.`,
    `Β: Μπείτε στο AgoraX, διαβάστε όλη την πρόταση, καταθέστε ένα επιχείρημα ή μια τροπολογία, και ψηφίστε όταν ανοίξει η ψηφοφορία.`,
    `Α: Η δημοκρατία γίνεται καλύτερη όταν συμμετέχουμε ενημερωμένοι. Ευχαριστούμε που μας ακούσατε.`,
  ].join('\n');
}

function teaserScript(ctx: Awaited<ReturnType<typeof loadProposalContext>>): string {
  const { proposal, communityName, forArgs, againstArgs } = ctx;

  const hookCommunity = communityName ? `από την κοινότητα «${communityName}»` : `από την κοινότητα της AgoraX`;

  // Pick the strongest pro and the strongest con as one-line claims.
  const proLine = forArgs[0] ? `Υπέρ λένε: ${trim(forArgs[0], 180)}` : `Υπέρ: η συζήτηση είναι ανοιχτή — μπορείτε να καταθέσετε το πρώτο επιχείρημα.`;
  const conLine = againstArgs[0] ? `Κατά λένε: ${trim(againstArgs[0], 180)}` : `Κατά: η συζήτηση είναι ανοιχτή — μπορείτε να καταθέσετε το πρώτο επιχείρημα.`;

  return [
    `# Σενάριο σύντομου βίντεο (~45 δευτερόλεπτα) — AgoraX`,
    ``,
    `Τόνος: άμεσος, καθαρός. Έντονη εικόνα στις πρώτες τρεις σκηνές.`,
    `Στόχος: να οδηγήσει τον θεατή να μπει στην πλατφόρμα και να ψηφίσει.`,
    ``,
    `## Σκηνή 1 — Hook (0:00–0:05)`,
    `Πλάνο: τίτλος στην οθόνη.`,
    `Αφήγηση: Μια καινούργια πρόταση είναι σε διαβούλευση ${hookCommunity}.`,
    ``,
    `## Σκηνή 2 — Το ερώτημα (0:05–0:15)`,
    `Πλάνο: κάρτα κειμένου με το ερώτημα.`,
    `Αφήγηση: ${trim(proposal.question, 220)}`,
    ``,
    `## Σκηνή 3 — Η πρόταση (0:15–0:25)`,
    `Πλάνο: σύντομη υπογράμμιση των βασικών σημείων.`,
    `Αφήγηση: ${trim(proposal.solution, 260)}`,
    ``,
    `## Σκηνή 4 — Δύο πλευρές (0:25–0:38)`,
    `Πλάνο: split-screen ή δύο εικονίδια.`,
    `Αφήγηση: ${proLine}`,
    `Αφήγηση: ${conLine}`,
    ``,
    `## Σκηνή 5 — Κάλεσμα δράσης (0:38–0:45)`,
    `Πλάνο: λογότυπο AgoraX, διεύθυνση πλατφόρμας.`,
    `Αφήγηση: Διαβάστε την πρόταση, καταθέστε το επιχείρημά σας, ψηφίστε. AgoraX — η δημοκρατία γίνεται καλύτερη όταν συμμετέχουμε.`,
  ].join('\n');
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

// Exported for unit tests so they can exercise the templating without
// hitting the DB.
export const _internals = { podcastScript, teaserScript };
