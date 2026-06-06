/**
 * Amendment merger — local LLM merge with deterministic fallback.
 *
 * Calls the configured local inference endpoint to intelligently merge
 * accepted (and community-flagged) amendments into the original proposal
 * text. The AI produces a single coherent solution that incorporates all
 * included amendments — not a concatenation of tagged blocks.
 *
 * If the LLM is unavailable, falls back to deterministic concatenation
 * (type-tagged blocks appended to the original solution).
 *
 * GDPR §4.2 compliance: proposal text never leaves the instance.
 * The LLM endpoint must be self-hosted / private.
 *
 * The merged text is written to `proposal.finalText`. The original
 * `question` / `solution` are never mutated — the UI can show a diff.
 */

import { db } from '../db';
import { proposalAmendments, proposals, communities } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { chatCompletion, isLlmConfigured, LlmUnavailableError } from './llm-client';

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

const MERGE_PROMPT = `Είσαι ειδικός στη σύνταξη πολιτικών κειμένων.
Έχεις μια αρχική πρόταση και μια λίστα αποδεκτών τροπολογιών.
Ενσωμάτωσε ΟΛΕΣ τις τροπολογίες στην αρχική πρόταση, παράγοντας ένα ενιαίο, συνεκτικό κείμενο.

ΚΑΝΟΝΕΣ:
1. ΔΙΑΤΗΡΕΣΕ το νόημα και τον τόνο της αρχικής πρότασης.
2. ΕΝΣΩΜΑΤΩΣΕ κάθε τροπολογία φυσικά στο κείμενο — ΜΗΝ τις προσθέσεις ως ξεχωριστά μπλοκ.
3. Αν μια τροπολογία είναι "Αφαίρεση", ΑΦΑΙΡΕΣΕ το αντίστοιχο τμήμα από την αρχική πρόταση.
4. Αν μια τροπολογία είναι "Αντιπρόταση", ΑΝΤΙΚΑΤΑΣΤΗΣΕ το αντίστοιχο τμήμα.
5. Αν μια τροπολογία είναι "Βελτίωση" ή "Προσθήκη", ΕΝΣΩΜΑΤΩΣΕ το νέο περιεχόμενο φυσικά.
6. Το τελικό κείμενο πρέπει να διαβάζεται ως ενιαίο έγγραφο, όχι ως παζλ.
7. Απάντησε ΜΟΝΟ το τελικό κείμενο, χωρίς σχόλια ή μεταδεδομένα.

ΑΡΧΙΚΗ ΠΡΟΤΑΣΗ:
---
{solution}
---

ΤΡΟΠΟΛΟΓΙΕΣ:
{amendments}

ΤΕΛΙΚΟ ΚΕΙΜΕΝΟ:`;

async function llmMerge(
  question: string,
  solution: string,
  amendments: Array<{ id: number; type: string; text: string }>,
): Promise<{ text: string; success: boolean }> {
  if (!isLlmConfigured()) {
    return { text: '', success: false };
  }

  const amendmentsText = amendments
    .map((a, i) => {
      const typeLabel =
        a.type === 'improvement' ? 'Βελτίωση' :
        a.type === 'addition' ? 'Προσθήκη' :
        a.type === 'removal' ? 'Αφαίρεση' :
        a.type === 'counter_proposal' ? 'Αντιπρόταση' : 'Τροπολογία';
      return `${i + 1}. [${typeLabel}] ${a.text}`;
    })
    .join('\n\n');

  const prompt = MERGE_PROMPT
    .replace('{solution}', solution.slice(0, 4000))
    .replace('{amendments}', amendmentsText.slice(0, 4000));

  try {
    const response = await chatCompletion({
      messages: [
        { role: 'system', content: 'Είσαι ειδικός στη σύνταξη και επεξεργασία πολιτικών κειμένων. Ενσωματώνεις τροπολογίες σε προτάσεις με φυσικό και συνεκτικό τρόπο.' },
        { role: 'user', content: prompt },
      ],
      maxTokens: 4000,
      temperature: 0.3,
      timeoutMs: 45_000,
      enableThinking: false,
    });

    if (response.trim().length > 0) {
      return { text: response.trim(), success: true };
    }
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      console.warn(`[ai-merger] LLM unavailable: ${err.message}`);
    } else {
      console.warn(`[ai-merger] Unexpected error: ${err}`);
    }
  }

  return { text: '', success: false };
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
      included.push({ id: a.id, type: a.type, text: a.text, reason: `popularity ${(ratio * 100).toFixed(0)}%` });
    } else if (decision === 'rejected' && ratio >= Math.max(threshold, 0.7)) {
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

  // Try LLM merge first; fall back to deterministic concat.
  const llmResult = await llmMerge(proposal.question, proposal.solution, included);
  if (llmResult.success) {
    base.mergedSolution = llmResult.text;
    base.source = 'llm';
    const cfg = (await import('./llm-client')).readLlmConfig();
    base.llmModel = cfg?.model;
  } else {
    base.mergedSolution = localConcat(proposal.question, proposal.solution, included);
  }

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
