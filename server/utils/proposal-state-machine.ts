/**
 * Proposal State Machine v2
 * 
 * Implements the revised deliberation cycle with author-as-editor model:
 * 
 * draft → review → author_review → community_signal → sortition_synthesis → voting → decided
 * 
 * Plus an 'archived' state for proposals that are closed without reaching a decision.
 * 
 * State transitions are validated — invalid transitions throw an error.
 * This ensures proposals follow the deliberation cycle strictly.
 */

import type { Proposal } from '@shared/schema';
import type { IStorage } from '../storage';
import {
  PROPOSAL_STATE_DESCRIPTIONS,
  VALID_PROPOSAL_TRANSITIONS,
  assertProposalState,
  canTransitionProposal,
  getNextProposalStates,
  isTerminalProposalState,
  type ProposalState,
} from '@shared/proposal-lifecycle';
import { enqueueStructureProposal, enqueueNotification, enqueueCreateSortition, enqueueRecalculateScore, enqueueSortitionTimeout } from './job-queue';
import { completeSortitionBody } from './sortition-timeout';
import { storage } from '../storage';
// Lazy import — db throws if DATABASE_URL is unset (e.g. CI unit tests).
// Only transitionToValidation() needs it, so defer until called.
let getDb: () => typeof import('../db')['db'];
function database() {
  if (!getDb) {
    const dbMod = require('../db');
    getDb = () => dbMod.db;
  }
  return getDb();
}
import { proposals, validationResults } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { validateProposal, type LLMValidationResult } from './llm-validation';

export type { ProposalState } from '@shared/proposal-lifecycle';

// ─── Valid Transitions ──────────────────────────────────────────────────────
// 
// The state machine enforces a strict deliberation cycle:
// 
// draft → review (author submits for LLM validation)
// review → author_review (LLM validates, amendments can now be submitted)
// review → draft (LLM returns for revision)
// review → archived (LLM rejects outright)
// author_review → community_signal (author finishes reviewing all amendments)
// author_review → archived (author withdraws)
// community_signal → sortition_synthesis (signal period ends, flagged amendments identified)
// community_signal → archived (no amendments to flag, goes straight to voting)
// sortition_synthesis → voting (sortition body submits final text)
// sortition_synthesis → author_review (sortition returns for revision)
// voting → decided (vote completes)
// voting → archived (vote times out without quorum)
// any → archived (admin can archive at any time)
//
// Note: No backward transitions from voting → sortition_synthesis.
// Once voting starts, the proposal is locked.

const VALID_TRANSITIONS = VALID_PROPOSAL_TRANSITIONS;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if a state transition is valid.
 */
export function canTransition(from: ProposalState, to: ProposalState): boolean {
  return canTransitionProposal(from, to);
}

/**
 * Get all valid next states from the current state.
 */
export function getNextStates(current: ProposalState): ProposalState[] {
  return [...getNextProposalStates(current)];
}

/**
 * Validate and execute a state transition.
 * 
 * Throws an error if the transition is invalid.
 * Returns the updated proposal on success.
 */
export async function transitionProposal(
  proposal: Proposal,
  newState: ProposalState,
  storage: any,
): Promise<Proposal> {
  const currentState = assertProposalState(proposal.status);

  if (!canTransition(currentState, newState)) {
    throw new Error(
      `Invalid transition: ${proposal.status} → ${newState}. ` +
      `Valid transitions from ${proposal.status}: ${getNextStates(currentState).join(', ')}`
    );
  }

  return await storage.updateProposal(proposal.id, { status: newState });
}

/**
 * Get a human-readable description of a proposal state.
 * Used for UI display and notifications.
 */
export function getStateDescription(state: ProposalState): string {
  return PROPOSAL_STATE_DESCRIPTIONS[state];
}

/**
 * Check if a proposal is in a terminal state (no further transitions possible).
 */
export function isTerminalState(state: ProposalState): boolean {
  return isTerminalProposalState(state);
}

/**
 * Check if a proposal can still be edited by the author.
 * Only drafts can be edited.
 */
export function isEditable(state: ProposalState): boolean {
  return state === 'draft';
}

/**
 * Check if amendments can be submitted.
 * During review and author_review phases.
 */
export function canAmend(state: ProposalState): boolean {
  return state === 'review' || state === 'author_review';
}

/**
 * Check if the author can review amendments.
 */
export function canAuthorReview(state: ProposalState): boolean {
  return state === 'author_review';
}

/**
 * Check if community can vote on rejected amendments.
 */
export function canCommunitySignal(state: ProposalState): boolean {
  return state === 'community_signal';
}

/**
 * Check if sortition body can compose final text.
 */
export function canSortitionSynthesize(state: ProposalState): boolean {
  return state === 'sortition_synthesis';
}

/**
 * Check if voting is active.
 */
export function isVoting(state: ProposalState): boolean {
  return state === 'voting';
}

// ─── Side Effects ───────────────────────────────────────────────────────────

/**
 * Trigger side effects for a state transition.
 * 
 * Each transition can trigger background jobs:
 * - draft → review: LLM validation job
 * - review → author_review: notify author to review amendments
 * - review → draft: notify author of return
 * - author_review → community_signal: open community voting on rejected amendments
 * - community_signal → sortition_synthesis: create sortition body for synthesis
 * - sortition_synthesis → voting: open voting phase
 */
export async function triggerSideEffects(
  fromState: ProposalState,
  toState: ProposalState,
  proposal: Proposal,
): Promise<void> {
  const transition = `${fromState}->${toState}`;
  
  switch (transition) {
    case 'draft->review':
      // Queue LLM validation job
      await enqueueStructureProposal(proposal.id, proposal.question, proposal.solution);
      break;
    
    case 'review->author_review':
      // Notify author to review submitted amendments
      await enqueueNotification(proposal.authorId, 'amendments_ready', 'Amendments are ready for your review');
      break;
    
    case 'review->draft':
      // Notify author that proposal was returned for revision
      await enqueueNotification(proposal.authorId, 'proposal_returned', 'Your proposal has been returned for revision');
      break;
    
    case 'author_review->community_signal':
      // Open community voting on rejected amendments
      await enqueueNotification(proposal.authorId, 'community_signal_open', 'Community is now voting on your rejected amendments');
      break;
    
    case 'community_signal->sortition_synthesis':
      // Create sortition body for text synthesis
      await enqueueCreateSortition(proposal.communityId, 12, proposal.id, 'text_synthesis');
      // Pre-fill finalText with the AI merge so the jury has a baseline.
      try {
        const { saveAiMergedFinalText } = await import('./ai-merger');
        await saveAiMergedFinalText(proposal.id);
      } catch { /* best-effort */ }
      break;

    case 'sortition_synthesis->voting':
    case 'community_signal->voting':
      // Recalculate democracy score when voting opens
      await enqueueRecalculateScore(proposal.communityId);
      // If we skipped sortition (no flagged amendments), run the AI merge
      // now so the vote happens on the integrated text, not the raw draft.
      try {
        const { saveAiMergedFinalText } = await import('./ai-merger');
        await saveAiMergedFinalText(proposal.id);
      } catch { /* best-effort */ }
      break;

    default:
      // Any transition into a terminal state should refresh the score too,
      // so the badge on the community dashboard reflects new outcomes.
      if (toState === 'decided' || toState === 'archived') {
        await enqueueRecalculateScore(proposal.communityId);
      }
      break;
  }
}

/**
 * Handle sortition body completion.
 * 
 * Called when a sortition body times out or all members have responded.
 * Computes the average score and transitions the proposal accordingly:
 * - score <= 33: return to author_review (needs revision)
 * - score 34-100: advance to voting (approved)
 * - null (no scores): archive the proposal
 * 
 * @param bodyId - The sortition body ID
 * @param proposalId - The linked proposal ID
 */
export async function handleSortitionCompletion(
  bodyId: number,
  proposalId: number,
): Promise<void> {
  // Complete the body and get the average score
  const average = await completeSortitionBody(bodyId);
  
  // Get the proposal
  const proposal = await storage.getProposal(proposalId);
  if (!proposal) {
    return;
  }
  
  // Determine target state based on score
  let targetState: ProposalState;
  if (average === null) {
    // No scores submitted — archive
    targetState = 'archived';
  } else if (average <= 33) {
    // Low score — return to author for revision
    targetState = 'author_review';
  } else {
    // Good score — advance to voting
    targetState = 'voting';
  }
  
  // Transition the proposal
  const currentState = assertProposalState(proposal.status);
  if (!canTransitionProposal(currentState, targetState)) {
  }
  
  await storage.updateProposal(proposalId, { status: targetState });
  
  // Trigger side effects for the transition
  await triggerSideEffects(currentState, targetState, { ...proposal, status: targetState });
  
  // Notify author
  const reason = average === null 
    ? 'No scores were submitted by the sortition body' 
    : average <= 33 
      ? `Low average score (${average.toFixed(1)}/100). Please revise and resubmit.`
      : `Approved with average score ${average.toFixed(1)}/100. Moving to voting phase.`;
  
  await enqueueNotification(
    proposal.authorId,
    'sortition_completed',
    `Your proposal has been ${targetState === 'voting' ? 'approved' : targetState === 'archived' ? 'archived' : 'returned for revision'}: ${reason}`,
    { proposalId, bodyId, average, targetState },
  );
  
}

export { VALID_TRANSITIONS };

// ─── LLM Validation Transition ──────────────────────────────────────────────

export interface ValidationTransitionOutcome {
  proposalId: number;
  validationResultId: number;
  fromState: ProposalState;
  toState: ProposalState;
  category: LLMValidationResult['category'];
  score: number;
}

/**
 * Map a tiered LLM validation outcome to the appropriate canonical state.
 *
 * - `return`     → `draft`        (low confidence: send back for author revision)
 * - `sortition`  → `author_review` (mid confidence: open deliberation, sortition body
 *                                   created as a side effect for additional scoring)
 * - `auto_approve` → `voting`     (high confidence: skip deliberation, ratify directly)
 */
function targetStateFor(category: LLMValidationResult['category']): ProposalState {
  switch (category) {
    case 'return':
      return 'draft';
    case 'sortition':
      return 'author_review';
    case 'auto_approve':
      return 'voting';
  }
}

/**
 * Run LLM validation on a proposal and route it to the next canonical state.
 *
 * Persists the full structured result to `validation_results` (history), and
 * mirrors the latest score/feedback onto the proposal row for fast list
 * rendering. Side effects:
 *  - `return`       → notifies the author that their proposal was returned
 *  - `sortition`    → enqueues a sortition body for proposal scoring
 *  - `auto_approve` → recalculates the community democracy score
 *
 * The proposal must currently be in the `review` state — calling this from
 * any other state throws to keep the lifecycle honest.
 */
export async function transitionToValidation(proposalId: number): Promise<ValidationTransitionOutcome> {
  const proposal = await storage.getProposal(proposalId);
  if (!proposal) {
    throw new Error(`transitionToValidation: proposal ${proposalId} not found`);
  }

  const fromState = assertProposalState(proposal.status);
  if (fromState !== 'review') {
    throw new Error(
      `transitionToValidation: proposal ${proposalId} must be in 'review' state ` +
      `(current: ${fromState})`
    );
  }

  const result = await validateProposal(proposal.question, proposal.solution);
  const toState = targetStateFor(result.category);

  if (!canTransitionProposal(fromState, toState)) {
    throw new Error(
      `transitionToValidation: cannot route ${fromState} → ${toState} ` +
      `for category ${result.category}`
    );
  }

  // Persist the full structured result for history and audit.
  const db = database();
  const [persisted] = await db
    .insert(validationResults)
    .values({
      proposalId,
      score: Math.round(result.score),
      feedback: result.feedback,
      details: result.details,
      category: result.category,
    })
    .returning();

  // Mirror the latest scalar score onto the proposal row + advance state.
  await db
    .update(proposals)
    .set({
      status: toState,
      llmScore: String(result.score),
      llmFeedback: result.feedback,
      llmValidatedAt: new Date(),
      llmValidationRound: (proposal.llmValidationRound ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposalId));

  // Side effects per category. We do not reuse `triggerSideEffects` here
  // because the natural transition map (e.g. `review->author_review`) already
  // sends a generic "amendments ready" notification, which would be
  // misleading for a freshly-validated proposal.
  switch (result.category) {
    case 'return':
      await enqueueNotification(
        proposal.authorId,
        'proposal_returned',
        `Η πρόταση επιστράφηκε για αναθεώρηση (βαθμός ${Math.round(result.score)}/100): ${result.feedback}`,
        { proposalId, score: result.score, feedback: result.feedback },
      );
      break;
    case 'sortition':
      await enqueueCreateSortition(proposal.communityId, 12, proposalId, 'scoring');
      await enqueueNotification(
        proposal.authorId,
        'proposal_validated',
        `Η πρόταση πέρασε στην κοινοτική διαβούλευση (βαθμός ${Math.round(result.score)}/100).`,
        { proposalId, score: result.score },
      );
      break;
    case 'auto_approve':
      await enqueueRecalculateScore(proposal.communityId);
      await enqueueNotification(
        proposal.authorId,
        'proposal_auto_approved',
        `Η πρόταση εγκρίθηκε αυτόματα (βαθμός ${Math.round(result.score)}/100) και πέρασε σε ψηφοφορία.`,
        { proposalId, score: result.score },
      );
      break;
  }


  return {
    proposalId,
    validationResultId: persisted.id,
    fromState,
    toState,
    category: result.category,
    score: result.score,
  };
}