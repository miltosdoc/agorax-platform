/**
 * Amendment merger — local-only.
 *
 * Builds a single coherent solution text by concatenating accepted (and
 * popular-enough) amendments onto the original solution, with type tags
 * (Βελτίωση / Προσθήκη / Αφαίρεση / Αντιπρόταση). Output goes to
 * `proposal.finalText` — we never mutate `question` / `solution` so the
 * original deliberation surface stays intact and the UI can show a diff.
 *
 * Previously this module also called an external LLM (OpenRouter) to
 * smooth-merge amendments into flowing prose. Per the GDPR audit
 * (`docs/compliance/02_DATA_MINIMIZATION_AUDIT.md §4.2`) that external
 * disclosure was removed — proposal text never leaves the instance.
 * Until a local model is wired, we use the deterministic concat
 * fallback that was already in place for the no-API-key path.
 */

import { db } from '../db';
import { proposalAmendments, proposals, communities } from '../../shared/schema';
import { eq } from 'drizzle-orm';

interface AiMergeOptions {
  /**
   * Popularity ratio (upvotes / (upvotes+downvotes)) above which a
   * non-accepted amendment is still pulled into the merge. 0..1.
   * Defaults to 1.0 — i.e. accepted-only — when not provided.
   */
  inclusionThreshold?: number;
}

export interface AiMergeResult {
  proposalId: number;
  originalQuestion: string;
  originalSolution: string;
  mergedSolution: string;
  includedAmendmentIds: number[];
  excludedAmendmentIds: number[];
  source: 'llm' | 'fallback';
  llmModel?: string;
}

function decisionOf(a: { authorDecision: string | null; status: string | null }):
  'accepted' | 'rejected' | 'pending' {
  if (a.authorDecision === 'accepted' || a.authorDecision === 'rejected') return a.authorDecision;
  if (a.status === 'accepted' || a.status === 'rejected') return a.status as any;
  return 'pending';
}

function popularityRatio(a: { rejectionUpvotes: number | null; rejectionDownvotes: number | null }): number {
  const up = a.rejectionUpvotes ?? 0;
  const down = a.rejectionDownvotes ?? 0;
  const total = up + down;
  return total > 0 ? up / total : 0;
}

function localConcat(question: string, solution: string, accepted: Array<{ id: number; type: string; text: string }>): string {
  if (accepted.length === 0) return solution;
  const tagFor = (type: string) =>
    type === 'improvement' ? 'Βελτίωση' :
    type === 'addition' ? 'Προσθήκη' :
    type === 'removal' ? 'Αφαίρεση' :
    type === 'counter_proposal' ? 'Αντιπρόταση' : 'Τροπολογία';
  return [
    solution,
    ...accepted.map(a => `\n\n[${tagFor(a.type)}] ${a.text}`),
  ].join('');
}

export async function aiMergeAmendments(
  proposalId: number,
  options: AiMergeOptions = {},
): Promise<AiMergeResult> {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  const amendments = await db
    .select()
    .from(proposalAmendments)
    .where(eq(proposalAmendments.proposalId, proposalId));

  // Pull threshold default from community config if not explicitly passed.
  let threshold = options.inclusionThreshold;
  if (threshold === undefined) {
    const [community] = await db
      .select({ t: communities.amendmentInclusionThreshold })
      .from(communities)
      .where(eq(communities.id, proposal.communityId));
    threshold = community?.t != null ? Number(community.t) : 1;
  }

  const included: Array<{ id: number; type: string; text: string; reason: string }> = [];
  const excluded: number[] = [];
  for (const a of amendments) {
    const decision = decisionOf(a);
    const ratio = popularityRatio(a);
    if (decision === 'accepted') {
      included.push({ id: a.id, type: a.type, text: a.text, reason: 'author-accepted' });
    } else if (decision !== 'rejected' && threshold < 1 && ratio >= threshold) {
      // Pending amendments with strong community support get pulled in.
      included.push({ id: a.id, type: a.type, text: a.text, reason: `popularity ${(ratio * 100).toFixed(0)}%` });
    } else if (decision === 'rejected' && ratio >= Math.max(threshold, 0.7)) {
      // Author rejected but community strongly disagrees — still include.
      included.push({ id: a.id, type: a.type, text: a.text, reason: `community-override ${(ratio * 100).toFixed(0)}%` });
    } else {
      excluded.push(a.id);
    }
  }

  const base: AiMergeResult = {
    proposalId,
    originalQuestion: proposal.question,
    originalSolution: proposal.solution,
    mergedSolution: proposal.solution,
    includedAmendmentIds: included.map(a => a.id),
    excludedAmendmentIds: excluded,
    source: 'fallback',
  };

  if (included.length === 0) {
    return base; // nothing to merge — return original verbatim
  }

  // GDPR §4.2 audit decision: external LLM merge removed. Until a local
  // inference path is wired, we always use the deterministic concat.
  base.mergedSolution = localConcat(proposal.question, proposal.solution, included);
  return base;
}

/**
 * Compute the AI merge and persist it to `proposal.finalText`. Returns the
 * full result so callers can show a diff.
 */
export async function saveAiMergedFinalText(
  proposalId: number,
  options: AiMergeOptions = {},
): Promise<AiMergeResult> {
  const result = await aiMergeAmendments(proposalId, options);
  await db.update(proposals)
    .set({ finalText: result.mergedSolution, updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));
  return result;
}
