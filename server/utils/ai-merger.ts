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

// ─── Final review (short deliberation track) ────────────────────────────────
//
// Unlike the legacy merge above, the final-review pipeline treats
// counter-proposals (αντιπροτάσεις) as COMPETING ALTERNATIVES, not inline
// replacements: they are excluded from the merged text, restyled by the AI
// to match the final proposal's form, and stand on the ballot next to it.

/** Which amendments qualify for what, under the community's thresholds. */
function partitionAmendments(
  amendments: Array<typeof proposalAmendments.$inferSelect>,
  threshold: number,
) {
  const qualifies = (a: typeof proposalAmendments.$inferSelect): boolean => {
    const decision = decisionOf(a);
    const ratio = popularityRatio(a);
    if (decision === 'accepted') return true;
    if (decision !== 'rejected' && threshold < 1 && ratio >= threshold) return true;
    // Community override: enough members disagreed with the author's
    // rejection that the amendment earns its place anyway.
    if (decision === 'rejected' && ratio >= Math.max(threshold, 0.7)) return true;
    return false;
  };
  const real = amendments.filter(a => a.type !== 'sortition_revision');
  return {
    mergeIncluded: real.filter(a => a.type !== 'counter_proposal' && qualifies(a)),
    counterAlternatives: real.filter(a => a.type === 'counter_proposal' && qualifies(a)),
    excluded: real.filter(a => !qualifies(a)).map(a => a.id),
  };
}

const RESTYLE_PROMPT = `Είσαι ειδικός στη σύνταξη πολιτικών κειμένων.
Παρακάτω είναι το ΤΕΛΙΚΟ ΚΕΙΜΕΝΟ μιας πρότασης και μια ΑΝΤΙΠΡΟΤΑΣΗ που θα τεθεί σε ψηφοφορία ως εναλλακτική.
Ξαναγράψε την αντιπρόταση ώστε να έχει την ίδια δομή, μορφή και πληρότητα με το τελικό κείμενο, ως αυτόνομη ολοκληρωμένη πρόταση.

ΚΑΝΟΝΕΣ:
1. ΔΙΑΤΗΡΕΣΕ ΑΠΑΡΕΓΚΛΙΤΑ την ουσία, τις θέσεις και το κεντρικό μήνυμα της αντιπρότασης — ΔΕΝ επιτρέπεται να τα αμβλύνεις, να τα αλλοιώσεις ή να τα πλησιάσεις προς το τελικό κείμενο.
2. Άλλαξε ΜΟΝΟ ύφος, δομή και μορφοποίηση ώστε να συγκρίνεται δίκαια με το τελικό κείμενο.
3. Αν η αντιπρόταση καλύπτει μέρος μόνο του θέματος, συμπλήρωσε ΟΥΔΕΤΕΡΑ τα υπόλοιπα σημεία από το τελικό κείμενο, ώστε να είναι πλήρης εναλλακτική.
4. Απάντησε ΜΟΝΟ το κείμενο της εναλλακτικής, χωρίς σχόλια.

ΤΕΛΙΚΟ ΚΕΙΜΕΝΟ:
---
{finalText}
---

ΑΝΤΙΠΡΟΤΑΣΗ:
---
{counter}
---

ΕΝΑΛΛΑΚΤΙΚΗ ΠΡΟΤΑΣΗ:`;

async function restyleCounter(finalText: string, counterText: string): Promise<string | null> {
  if (!isLlmConfigured()) return null;
  try {
    const response = await chatCompletion({
      messages: [
        { role: 'system', content: 'Είσαι ειδικός στη σύνταξη πολιτικών κειμένων. Ξαναγράφεις αντιπροτάσεις ώστε να συγκρίνονται δίκαια, χωρίς ποτέ να αλλοιώνεις την ουσία τους.' },
        { role: 'user', content: RESTYLE_PROMPT.replace('{finalText}', finalText.slice(0, 4000)).replace('{counter}', counterText.slice(0, 4000)) },
      ],
      maxTokens: 4000,
      temperature: 0.3,
      timeoutMs: 45_000,
      enableThinking: false,
    });
    return response.trim().length > 0 ? response.trim() : null;
  } catch (err) {
    console.warn(`[ai-merger] counter restyle failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export interface FinalReviewResult {
  proposalId: number;
  finalText: string;
  source: 'llm' | 'fallback';
  includedAmendmentIds: number[];
  counterAlternativeIds: number[];
  excludedAmendmentIds: number[];
}

/**
 * Entering final_review: merge accepted/promoted improvements into
 * proposal.finalText and restyle qualifying counter-proposals into
 * amendment.restyledText (falling back to their original text).
 */
export async function prepareFinalReview(proposalId: number): Promise<FinalReviewResult> {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  const [community] = await db
    .select({ t: communities.amendmentInclusionThreshold })
    .from(communities)
    .where(eq(communities.id, proposal.communityId));
  const threshold = community?.t != null ? Number(community.t) : 1;

  const amendments = await db
    .select()
    .from(proposalAmendments)
    .where(eq(proposalAmendments.proposalId, proposalId));
  const { mergeIncluded, counterAlternatives, excluded } = partitionAmendments(amendments, threshold);

  // Merge improvements/additions/removals into the vote-ready text.
  let finalText = proposal.solution;
  let source: 'llm' | 'fallback' = 'fallback';
  if (mergeIncluded.length > 0) {
    const llmResult = await llmMerge(
      proposal.question,
      proposal.solution,
      mergeIncluded.map(a => ({ id: a.id, type: a.type, text: a.text })),
    );
    if (llmResult.success) {
      finalText = llmResult.text;
      source = 'llm';
    } else {
      finalText = localConcat(proposal.question, proposal.solution, mergeIncluded.map(a => ({ id: a.id, type: a.type, text: a.text })));
    }
  }
  await db.update(proposals)
    .set({ finalText, updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));

  // Restyle each qualifying counter-proposal into a standalone alternative.
  for (const counter of counterAlternatives) {
    const restyled = await restyleCounter(finalText, counter.text);
    await db.update(proposalAmendments)
      .set({ restyledText: restyled ?? counter.text })
      .where(eq(proposalAmendments.id, counter.id));
  }

  return {
    proposalId,
    finalText,
    source,
    includedAmendmentIds: mergeIncluded.map(a => a.id),
    counterAlternativeIds: counterAlternatives.map(a => a.id),
    excludedAmendmentIds: excluded,
  };
}

const REFINE_PROMPT = `Είσαι ειδικός στη σύνταξη πολιτικών κειμένων.
Ο συγγραφέας μιας πρότασης ζητά μια μικρή τροποποίηση στο ΤΕΛΙΚΟ ΚΕΙΜΕΝΟ πριν την ψηφοφορία.
Το τελικό κείμενο έχει προκύψει από ενσωμάτωση τροπολογιών της κοινότητας — αυτές είναι ΑΠΑΡΑΒΙΑΣΤΕΣ.

ΚΑΝΟΝΕΣ:
1. Εφάρμοσε την οδηγία του συγγραφέα ΜΟΝΟ εφόσον δεν αποδυναμώνει, δεν αλλοιώνει και δεν αφαιρεί την ουσία καμίας από τις ΕΝΣΩΜΑΤΩΜΕΝΕΣ ΤΡΟΠΟΛΟΓΙΕΣ παρακάτω.
2. Αν η οδηγία συγκρούεται με τροπολογία, αγνόησε το συγκρουόμενο μέρος της οδηγίας και εφάρμοσε μόνο ό,τι δεν συγκρούεται.
3. Κράτησε τις αλλαγές στο ελάχιστο αναγκαίο για την οδηγία.
4. Απάντησε ΜΟΝΟ το νέο τελικό κείμενο, χωρίς σχόλια.

ΕΝΣΩΜΑΤΩΜΕΝΕΣ ΤΡΟΠΟΛΟΓΙΕΣ (απαραβίαστες):
{amendments}

ΤΕΛΙΚΟ ΚΕΙΜΕΝΟ:
---
{finalText}
---

ΟΔΗΓΙΑ ΣΥΓΓΡΑΦΕΑ:
{instruction}

ΝΕΟ ΤΕΛΙΚΟ ΚΕΙΜΕΝΟ:`;

/**
 * Author-requested refinement of the final text during final_review.
 * The author can ONLY modify the text through this constrained AI edit —
 * the incorporated amendments' substance is passed as inviolable context
 * so the instruction cannot dilute what the community added.
 * Throws LlmUnavailableError when no LLM is configured (no fallback: an
 * unguarded manual edit would defeat the purpose).
 */
export async function refineFinalText(proposalId: number, instruction: string): Promise<string> {
  if (!isLlmConfigured()) {
    throw new LlmUnavailableError('LLM required for guarded final-text refinement');
  }
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal || !proposal.finalText) throw new Error('No final text to refine');

  const [community] = await db
    .select({ t: communities.amendmentInclusionThreshold })
    .from(communities)
    .where(eq(communities.id, proposal.communityId));
  const threshold = community?.t != null ? Number(community.t) : 1;
  const amendments = await db
    .select()
    .from(proposalAmendments)
    .where(eq(proposalAmendments.proposalId, proposalId));
  const { mergeIncluded } = partitionAmendments(amendments, threshold);
  const amendmentsText = mergeIncluded.length > 0
    ? mergeIncluded.map((a, i) => `${i + 1}. ${a.text}`).join('\n\n')
    : '(καμία)';

  const response = await chatCompletion({
    messages: [
      { role: 'system', content: 'Είσαι ειδικός στη σύνταξη πολιτικών κειμένων. Εφαρμόζεις οδηγίες συγγραφέων χωρίς ποτέ να αποδυναμώνεις τις ενσωματωμένες τροπολογίες της κοινότητας.' },
      {
        role: 'user',
        content: REFINE_PROMPT
          .replace('{amendments}', amendmentsText.slice(0, 3000))
          .replace('{finalText}', proposal.finalText.slice(0, 5000))
          .replace('{instruction}', instruction.slice(0, 500)),
      },
    ],
    maxTokens: 4000,
    temperature: 0.2,
    timeoutMs: 45_000,
    enableThinking: false,
  });
  const refined = response.trim();
  if (refined.length === 0) throw new Error('Refinement produced empty text');

  await db.update(proposals)
    .set({ finalText: refined, updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));
  return refined;
}

/**
 * Freeze the option ballot when final_review hands over to voting.
 * Options: the merged final text, each restyled counter-proposal, and the
 * status quo. With no qualifying counter-proposals the ballot stays null —
 * the classic yes/no/abstain vote — so nothing degrades for simple cases.
 */
export async function buildBallotOptions(proposalId: number): Promise<Array<{ id: string; label: string }> | null> {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  const [community] = await db
    .select({ t: communities.amendmentInclusionThreshold })
    .from(communities)
    .where(eq(communities.id, proposal.communityId));
  const threshold = community?.t != null ? Number(community.t) : 1;
  const amendments = await db
    .select()
    .from(proposalAmendments)
    .where(eq(proposalAmendments.proposalId, proposalId));
  // Only counters that were restyled when final_review opened stand on the
  // ballot — qualification is frozen at merge time so late rejection-votes
  // can't add an option nobody saw during the review.
  const { counterAlternatives: qualified } = partitionAmendments(amendments, threshold);
  const counterAlternatives = qualified.filter(a => a.restyledText != null);

  if (counterAlternatives.length === 0) {
    return null; // classic yes/no/abstain ballot
  }

  const options = [
    { id: 'final', label: 'Η τελική πρόταση' },
    ...counterAlternatives.map((a, i) => ({
      id: `counter_${a.id}`,
      label: counterAlternatives.length === 1 ? 'Η αντιπρόταση' : `Αντιπρόταση ${i + 1}`,
    })),
    { id: 'status_quo', label: 'Καμία αλλαγή' },
  ];
  await db.update(proposals)
    .set({ ballotOptions: options, updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));
  return options;
}
