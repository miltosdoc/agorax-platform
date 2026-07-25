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
// Direct import — every other server util that touches the DB does this, and
// the lazy/createRequire variants both break in one runtime or the other
// (bare `require` fails in ESM via tsx; createRequire fails in the esbuild
// bundle because `../db` is no longer a separate module on disk). The
// "CI without DATABASE_URL" worry the lazy pattern was defending against
// is hypothetical — unit tests that don't want to load this file simply
// shouldn't import it.
import { db } from '../db';
function database() { return db; }
import { proposals, validationResults, sortitionBodies } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
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

  // Track guards — the static transition map can't express per-proposal
  // rules, so the two track-specific edges are enforced here:
  // draft → voting is the direct-vote track only; final_review belongs to
  // the deliberation track only.
  const track = (proposal as any).track ?? 'deliberation';
  if (currentState === 'draft' && newState === 'voting' && track !== 'vote') {
    throw new Error('Only direct-vote proposals can go straight from draft to voting');
  }
  if (newState === 'final_review' && track === 'vote') {
    throw new Error('Direct-vote proposals have no final_review phase');
  }

  // Compute phase deadline when entering a time-limited phase. final_review
  // reuses the community's authorReviewHours budget.
  const DEFAULT_PHASE_HOURS = 48;
  const TIMED_PHASES: Record<string, 'authorReviewHours' | 'communitySignalHours' | 'votingHours'> = {
    author_review: 'authorReviewHours',
    community_signal: 'communitySignalHours',
    final_review: 'authorReviewHours',
    voting: 'votingHours',
  };
  let phaseDeadline: Date | null = null;
  if (TIMED_PHASES[newState]) {
    let hours = 0;
    try {
      const { communityRepo } = await import('../storage');
      const community = await communityRepo.getCommunity(proposal.communityId);
      hours = (community as any)?.[TIMED_PHASES[newState]] ?? 0;
      // The author's own duration wins for the vote they configured.
      if (newState === 'voting' && (proposal as any).votingDurationHours > 0) {
        hours = (proposal as any).votingDurationHours;
      }
    } catch (err: any) {
      console.warn(`[phase-deadline] lookup failed for proposal ${proposal.id}: ${err?.message}`);
    }
    // A timed phase MUST carry a deadline: the auto-advance sweep selects on
    // `phaseDeadline IS NOT NULL`, so a null one strands the proposal in that
    // phase forever with nothing to move it on. Fall back rather than skip.
    if (!(hours > 0)) {
      console.warn(
        `[phase-deadline] proposal ${proposal.id}: no ${TIMED_PHASES[newState]} configured for `
        + `community ${proposal.communityId}; defaulting ${newState} to ${DEFAULT_PHASE_HOURS}h`,
      );
      hours = DEFAULT_PHASE_HOURS;
    }
    phaseDeadline = new Date(Date.now() + hours * 3600 * 1000);
  }

  const updated = await storage.updateProposal(proposal.id, { status: newState, phaseDeadline });

  // Democracy Points: a proposal that passes quality validation — leaving
  // `review` for deliberation or straight to the vote — earns its author.
  // A return to `draft` or `archived` does not qualify.
  if (currentState === 'review' && (newState === 'author_review' || newState === 'community_signal' || newState === 'voting')) {
    const { awardPoints } = await import('../economy/points');
    await awardPoints({
      userId: proposal.authorId,
      actionKey: 'proposal_validated',
      refType: 'proposal',
      refId: proposal.id,
    });
  }

  return updated;
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
 * Legacy flow: review/author_review. Short deliberation flow: the single
 * community_signal amendments phase.
 */
export function canAmend(state: ProposalState): boolean {
  return state === 'review' || state === 'author_review' || state === 'community_signal';
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

  // Every entry into `voting`, whatever the path (auto-approve, community
  // signal, sortition synthesis), announces the vote to all members.
  // Best-effort: a notification failure must never block the transition.
  if (toState === 'voting' && fromState !== 'voting') {
    try {
      const { notifyVoteStarted } = await import('./notifications');
      await notifyVoteStarted(proposal.id, proposal.communityId, proposal.question);
    } catch (err: any) {
      console.warn(`[notify] vote_started fan-out failed for proposal ${proposal.id}: ${err?.message}`);
    }
  }

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
      // The members are the voters in this phase — tell them it opened.
      try {
        const { notifyProposalAdvanced } = await import('./notifications');
        await notifyProposalAdvanced(proposal.id, proposal.communityId, 'community_signal', proposal.question);
      } catch (err: any) {
        console.warn(`[notify] community_signal fan-out failed for proposal ${proposal.id}: ${err?.message}`);
      }
      break;
    
    case 'community_signal->sortition_synthesis':
      // Close out any LLM-triggered scoring body for this proposal before
      // creating the text-synthesis body. The scoring body was a peer-jury
      // sanity check on the LLM verdict; by the time the proposal has been
      // pushed through author_review + community_signal, the author has
      // chosen to proceed regardless and the jury's score no longer gates
      // anything. Without this step, in a small community (~size of one
      // sortition body) every eligible member is "active" in the scoring
      // body, so the text-synthesis body can't form (No eligible members
      // for sortition) and the proposal deadlocks for up to 72h.
      try {
        const closed = await database()
          .update(sortitionBodies)
          .set({ status: 'completed', completedAt: new Date() })
          .where(and(
            eq(sortitionBodies.proposalId, proposal.id),
            eq(sortitionBodies.purpose, 'scoring'),
            sql`${sortitionBodies.status} IN ('selecting', 'active')`,
          ))
          .returning({ id: sortitionBodies.id });
        if (closed.length > 0) {
          console.log(`[sortition] closed ${closed.length} scoring body(ies) for proposal ${proposal.id} before creating text_synthesis body: ${closed.map(c => '#' + c.id).join(', ')}`);
        }
      } catch (err: any) {
        console.warn(`[sortition] failed to close scoring bodies for proposal ${proposal.id}: ${err?.message}`);
      }
      // Create sortition body for text synthesis
      await enqueueCreateSortition(proposal.communityId, 12, proposal.id, 'text_synthesis');
      // Pre-fill finalText with the AI merge so the jury has a baseline.
      try {
        const { saveAiMergedFinalText } = await import('./ai-merger');
        await saveAiMergedFinalText(proposal.id);
      } catch { /* best-effort */ }
      break;

    case 'sortition_synthesis->voting':
      await enqueueRecalculateScore(proposal.communityId);
      try {
        const { saveAiMergedFinalText, buildBallotOptions } = await import('./ai-merger');
        // The text already on the proposal wins: either the jury's synthesis
        // or the AI pre-fill from phase entry. Merge only when neither
        // happened, then freeze the option ballot.
        if (!proposal.finalText) {
          await saveAiMergedFinalText(proposal.id);
        }
        await buildBallotOptions(proposal.id);
      } catch { /* best-effort */ }
      break;

    case 'community_signal->voting':
      // 3-step flow freeze: final re-merge (accepted + promoted amendments,
      // standing author refine re-applied), restyle counters, then lock the
      // option ballot. What everyone watched during deliberation is exactly
      // what lands on the ballot.
      await enqueueRecalculateScore(proposal.communityId);
      try {
        const { prepareFinalReview, buildBallotOptions } = await import('./ai-merger');
        await prepareFinalReview(proposal.id);
        await buildBallotOptions(proposal.id);
      } catch (err: any) {
        console.warn(`[final-text] freeze failed for proposal ${proposal.id}: ${err?.message}`);
      }
      break;

    case 'community_signal->final_review':
      // Short deliberation track: AI merges accepted + community-promoted
      // improvements into the vote-ready text and restyles qualifying
      // counter-proposals into standalone ballot alternatives. The author
      // then accepts (or AI-refines) the result during this phase.
      try {
        const { prepareFinalReview } = await import('./ai-merger');
        await prepareFinalReview(proposal.id);
      } catch (err: any) {
        console.warn(`[final-review] merge failed for proposal ${proposal.id}: ${err?.message}`);
      }
      await enqueueNotification(
        proposal.authorId,
        'final_review_ready',
        'Το τελικό κείμενο της πρότασής σας είναι έτοιμο για αποδοχή',
      );
      break;

    case 'final_review->voting':
      // Freeze the option ballot: final text + restyled counter-proposals +
      // status quo. Must happen before the first ballot is validated.
      try {
        const { buildBallotOptions } = await import('./ai-merger');
        await buildBallotOptions(proposal.id);
      } catch (err: any) {
        console.warn(`[final-review] ballot build failed for proposal ${proposal.id}: ${err?.message}`);
      }
      await enqueueRecalculateScore(proposal.communityId);
      break;

    default:
      // Any transition into a terminal state should refresh the score too,
      // so the badge on the community dashboard reflects new outcomes.
      if (toState === 'decided' || toState === 'archived') {
        await enqueueRecalculateScore(proposal.communityId);

        // A concluded vote is an outcome members should hear about.
        if (toState === 'decided') {
          try {
            const { notifyProposalAdvanced } = await import('./notifications');
            await notifyProposalAdvanced(proposal.id, proposal.communityId, 'decided', proposal.question);
          } catch (err: any) {
            console.warn(`[notify] decided fan-out failed for proposal ${proposal.id}: ${err?.message}`);
          }
        }

        // GDPR Art. 17 deferred-erasure hook: now that this proposal is
        // terminal, crypto-shred any votes on it that belong to members
        // whose erasure request was previously processed-but-deferred
        // (per INTERNAL_POLICIES.md §2.4). Idempotent + best-effort —
        // a failure here must not block the close.
        try {
          const { storage } = await import('../auth');
          await storage.processDeferredErasuresForProposal(proposal.id);
        } catch {
          // Logged elsewhere; do not throw from a side-effect hook.
        }
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

  const [body] = await database()
    .select({ purpose: sortitionBodies.purpose })
    .from(sortitionBodies)
    .where(eq(sortitionBodies.id, bodyId));

  // Determine target state based on score
  let targetState: ProposalState;
  if (body?.purpose === 'text_synthesis') {
    // A synthesis jury that times out must never kill the proposal: the AI
    // merge (pre-filled at phase entry, re-run in the side effect if
    // missing) stands in for the jury and the vote opens.
    targetState = 'voting';
  } else if (average === null) {
    // No scores submitted — archive
    targetState = 'archived';
  } else if (average <= 33) {
    // Low score — return to author for revision
    targetState = 'author_review';
  } else {
    // Good score — advance to voting
    targetState = 'voting';
  }
  
  // Transition the proposal — but only when the lifecycle allows it. A jury
  // finishing late (e.g. the proposal already moved on in the short flow)
  // must not force-rewrite the status: the body still completes and the
  // scores stay recorded, the state machine stays authoritative.
  const currentState = assertProposalState(proposal.status);
  if (!canTransitionProposal(currentState, targetState)) {
    console.warn(
      `[sortition] body ${bodyId} completed but ${currentState} → ${targetState} is not a legal transition — leaving proposal ${proposalId} untouched`,
    );
    return;
  }

  await storage.updateProposal(proposalId, { status: targetState });

  // Trigger side effects for the transition
  await triggerSideEffects(currentState, targetState, { ...proposal, status: targetState });
  
  // Notify author
  const reason = body?.purpose === 'text_synthesis'
    ? 'Η φάση σύνθεσης ολοκληρώθηκε — η πρόταση προχωρά σε ψηφοφορία.'
    : average === null
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
      return 'community_signal';
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
      // Short flow: no automatic scoring jury — deliberation + the ballot
      // (with «Καμία αλλαγή») are the quality gate. Sortition remains a
      // deliberate, manually-invoked institution (dispute juries via the
      // community_signal → sortition_synthesis transition), not a conveyor
      // step that drafts 12 members for every mid-score proposal.
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
      // This path skips triggerSideEffects, so announce the vote here.
      try {
        const { notifyVoteStarted } = await import('./notifications');
        await notifyVoteStarted(proposalId, proposal.communityId, proposal.question);
      } catch (err: any) {
        console.warn(`[notify] vote_started fan-out failed for proposal ${proposalId}: ${err?.message}`);
      }
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