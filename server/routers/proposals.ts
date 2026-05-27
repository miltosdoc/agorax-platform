/**
 * Proposals Router
 *
 * Handles proposals routes.
 */

import type { Express, Request, Response } from 'express';
import {  communityRepo, proposalRepo, sortitionRepo , storage } from '../storage';
import { requireAuth, requireConsent } from '../auth';
import { db } from '../db';
import { awardPoints } from '../economy/points';
import { eq, and, desc, sql, inArray, or, count } from 'drizzle-orm';
import {
  sortitionMembers,
  sortitionBodies,
  sortitionNotifications,
  communityMembers,
  communities,
  proposals,
  users,
  castProposalVoteSchema,
} from '@shared/schema';
import { INITIAL_PROPOSAL_STATE, isProposalState } from '@shared/proposal-lifecycle';
import type { VoterView } from '../voting';
import { createServer, type Server } from 'http';

/**
 * Build the vote-results payload the client expects from a backend-provided
 * VoterView plus the community's quorum config. Works for any VotingBackend:
 * private backends seal the tally (yes/no/abstain are 0 and `sealed` is true)
 * until the election closes.
 */
async function computeVoteResults(
  proposal: { communityId: number },
  view: VoterView,
) {
  const [community] = await db
    .select({ minParticipationPct: communities.minParticipationPct })
    .from(communities)
    .where(eq(communities.id, proposal.communityId));
  const minParticipationPct = Number(community?.minParticipationPct ?? 0);

  const [memberRow] = await db
    .select({ c: count() })
    .from(communityMembers)
    .where(eq(communityMembers.communityId, proposal.communityId));
  const memberCount = memberRow?.c ?? 0;

  const participants = view.ballotCount;
  const participationPct = memberCount > 0 ? participants / memberCount : 0;
  const meetsQuorum = participationPct >= minParticipationPct;

  const tally = view.tally;
  const yes = tally?.yes ?? 0;
  const no = tally?.no ?? 0;
  const abstain = tally?.abstain ?? 0;
  const total = tally?.total ?? view.ballotCount;
  const passes = !!tally && meetsQuorum && yes + no > 0 && yes > no;

  return {
    yes, no, abstain, total,
    sealed: view.tallySealed || !tally,
    hasVoted: view.hasVoted,
    ballotCount: view.ballotCount,
    participants, participationPct, meetsQuorum, passes, minParticipationPct,
    userVote: view.userChoice,
  };
}

export function registerProposalsRoutes(app: Express): void {
  app.get("/api/proposals", async (req, res) => {
    try {
      const { limit } = req.query;
      const proposals = await proposalRepo.getAllProposals(limit ? parseInt(limit as string) : undefined);
      res.json(proposals);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch proposals" });
    }
  });
  app.get("/api/communities/:communityId/proposals", async (req, res) => {
    try {
      const communityId = parseInt(req.params.communityId);
      const { status, category } = req.query;
      const proposals = await proposalRepo.getProposals(communityId, {
        status: status as string,
        category: category as string,
      });
      res.json(proposals);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch proposals" });
    }
  });
  app.post("/api/communities/:communityId/proposals", requireAuth, requireConsent, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.communityId);
      const userId = req.user!.id;
      // Check membership
      const isMember = await communityRepo.isCommunityMember(communityId, userId);
      if (!isMember) {
        return res.status(403).json({ message: "Must be a community member to submit proposals" });
      }
      const { question, solution, category } = req.body;
      if (!question || !solution) {
        return res.status(400).json({ message: "Question and solution are required" });
      }
      if (typeof question !== "string" || typeof solution !== "string") {
        return res.status(400).json({ message: "Question and solution must be strings" });
      }
      if (question.length > 2000 || solution.length > 4000) {
        return res.status(400).json({ message: "Question max 2000 chars, solution max 4000 chars" });
      }
      const proposal = await proposalRepo.createProposal({
        communityId,
        authorId: userId,
        question,
        solution,
        category,
        status: INITIAL_PROPOSAL_STATE,
      });
      res.status(201).json(proposal);
    } catch (error) {
      console.error("create-proposal failed:", error);
      res.status(500).json({ message: "Failed to create proposal" });
    }
  });
  app.get("/api/proposals/:id", async (req, res) => {
    try {
      const proposal = await proposalRepo.getProposal(parseInt(req.params.id));
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      res.json(proposal);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch proposal" });
    }
  });
  app.patch("/api/proposals/:id", requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.authorId !== req.user.id) return res.status(403).json({ message: "Not the author" });
      if (proposal.status !== 'draft') return res.status(409).json({ message: "Can only edit drafts" });
      const updated = await proposalRepo.updateProposal(proposalId, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update proposal" });
    }
  });
  app.post("/api/proposals/:id/submit", requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.authorId !== req.user.id) return res.status(403).json({ message: "Not the author" });
      if (proposal.status !== 'draft') return res.status(409).json({ message: "Already submitted" });
      const { transitionProposal, triggerSideEffects } = await import('../utils/proposal-state-machine');
      const { storage: storageInstance } = await import('../storage');
      // draft → review (validated by the state machine; archived states blocked).
      const inReview = await transitionProposal(proposal, 'review', storage);      await triggerSideEffects(proposal.status, 'review', inReview);
      // ─── LLM Validation while the proposal sits in `review` ───────────────
      let llmScore: string | undefined;
      let llmFeedback: string | undefined;
      let llmValidatedAt: Date | undefined;
      let nextStatus: 'author_review' | 'draft' | 'review' = 'review';
      let category: 'return' | 'sortition' | 'auto_approve' | null = null;
      try {
        const { validateProposal } = await import('../utils/llm-validation');
        const result = await validateProposal(proposal.question, proposal.solution);
        llmScore = String(result.score);
        llmFeedback = result.feedback;
        llmValidatedAt = new Date();
        category = result.category;
        // Canonical lifecycle mapping from review:
        // - return:   review → draft   (author revises)
        // - sortition / auto_approve: review → author_review (amendments open)
        nextStatus = result.category === 'return' ? 'draft' : 'author_review';
      } catch (llmError) {
        // Persist the failure on the row but leave it in `review` for manual handling.
        llmFeedback = 'Το σύστημα αξιολόγησης δεν ήταν διαθέσιμο. Η πρόταση θα εξεταστεί χειροκίνητα.';
        llmValidatedAt = new Date();
      }
      // Persist the LLM scoring on the in-review row first so the columns stay
      // populated even if the follow-up transition is skipped.
      const scored = await storageInstance.updateProposal(proposalId, {
        llmScore,
        llmFeedback,
        llmValidatedAt,
      });
      let updated = scored;
      if (nextStatus !== 'review') {
        updated = await transitionProposal(scored, nextStatus, storage);
        await triggerSideEffects('review', nextStatus, updated);
      }
      res.json({
        ...updated,
        validation: {
          score: llmScore ? Number(llmScore) : null,
          feedback: llmFeedback,
          category,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to submit proposal" });
    }
  });
  // ─── Demopolis: Amendment Routes ───────────────────────────────────────────
  app.post("/api/proposals/:id/support", requireAuth, requireConsent, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const { type } = req.body; // 'support' or 'oppose'
      if (!type || !['support', 'oppose'].includes(type)) {
        return res.status(400).json({ message: "Type must be 'support' or 'oppose'" });
      }
      const support = await proposalRepo.getProposalSupport(proposalId);
      res.status(201).json(support);
    } catch (error) {
      res.status(500).json({ message: "Failed to create support" });
    }
  });
  app.get("/api/proposals/:id/support", async (req: any, res) => {
    try {
      const userId = (req.user as any)?.id;
      const support = await proposalRepo.getProposalSupport(parseInt(req.params.id), userId);
      res.json(support);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch support" });
    }
  });
  // ─── Demopolis: Proposal Final Ratification Vote Routes ────────────────────
  // Cast a final ratification vote. Routed through the configured
  // VotingBackend (see server/voting/) — today's hash-chain backend records
  // an append-only SHA-256 chain; a future Helios backend would encrypt the
  // ballot and decrypt only the aggregate tally. The receipt shape is
  // backend-specific, but every backend returns one.
  app.post("/api/proposals/:id/vote", requireAuth, requireConsent, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const parsed = castProposalVoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Choice must be one of 'yes', 'no', 'abstain'",
          errors: parsed.error.flatten(),
        });
      }
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.status !== 'voting') {
        return res.status(409).json({
          message: "Proposal is not currently in the voting phase",
          current_status: proposal.status,
        });
      }
      // Anonymous-mode proposals MUST use the /blind-sign + /anonymous-vote
      // pair so the user_id never gets bound to the vote row.
      if (proposal.votingMode === 'anonymous') {
        return res.status(409).json({
          message: "This proposal uses anonymous voting — use /blind-sign + /anonymous-vote",
          voting_mode: 'anonymous',
        });
      }
      const isMember = await communityRepo.isCommunityMember(proposal.communityId, req.user.id);
      if (!isMember) {
        return res.status(403).json({ message: "Only community members may cast a final vote" });
      }
      const { getVotingBackend } = await import('../voting');
      const backend = getVotingBackend();
      const receipt = await backend.castSignedBallot({
        proposalId,
        userId: req.user.id,
        choice: parsed.data.choice,
        signature: req.body.signature,
      });
      // Democracy Points: award one ballot's worth, once per (proposal, voter).
      await awardPoints({
        userId: req.user.id,
        actionKey: 'ratification_vote',
        refType: 'proposal',
        refId: proposalId,
      });
      res.status(201).json(receipt);
    } catch (error) {
      res.status(500).json({ message: "Failed to cast vote" });
    }
  });

  // ─── Anonymous voting (blind-signed tokens, malicious-operator unlinkable) ──
  // See docs/compliance/04_ANONYMOUS_VOTING_DESIGN.md. Two-step flow:
  //   1. Authenticated voter requests a blind signature on a token they
  //      generated client-side. We record THAT they got a signature.
  //   2. Anyone (no auth) presents (token, signature, choice) to cast.
  //      We verify the signature, store (token, choice), no user_id.

  // Step 1: blind-sign a voter-provided blinded value.
  app.post("/api/proposals/:id/blind-sign", requireAuth, requireConsent, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id, 10);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const blinded: unknown = req.body?.blindedToken;
      if (typeof blinded !== 'string' || blinded.length === 0) {
        return res.status(400).json({ message: "blindedToken (base64) required" });
      }

      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.status !== 'voting') {
        return res.status(409).json({ message: "Proposal is not in the voting phase" });
      }
      if (proposal.votingMode !== 'anonymous') {
        return res.status(409).json({ message: "Proposal does not use anonymous voting" });
      }
      const isMember = await communityRepo.isCommunityMember(proposal.communityId, req.user.id);
      if (!isMember) {
        return res.status(403).json({ message: "Only community members may vote" });
      }

      // Validate the blinded value LOOKS like base64 of a positive bigint
      // before we touch the DB — saves a wasted issuance burn on garbage.
      let blindedBytes: Uint8Array;
      try {
        const { base64ToBytes } = await import('@shared/blind-sig');
        blindedBytes = base64ToBytes(blinded);
      } catch {
        return res.status(400).json({ message: "blindedToken must be valid base64" });
      }
      if (blindedBytes.length < 16 || blindedBytes.every(b => b === 0)) {
        return res.status(400).json({ message: "blindedToken is malformed" });
      }

      // Ensure key exists FIRST (outside the tx). Then in a single tx:
      // claim issuance + sign. If signing throws, the tx rolls back and
      // the user keeps their one-shot.
      const { blindSigIssuance } = await import('@shared/schema');
      const { ensureKey, loadPrivateKey } = await import('../utils/blind-sig-vault');
      const { signBlinded } = await import('@shared/blind-sig');
      const pub = await ensureKey(proposalId);

      let signature: string;
      try {
        signature = await db.transaction(async (tx) => {
          await tx.insert(blindSigIssuance).values({ proposalId, userId: req.user.id });
          const priv = await loadPrivateKey(proposalId);
          return signBlinded(blinded, priv);
        });
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (/duplicate key|unique/i.test(msg)) {
          return res.status(409).json({ message: "You have already requested a signature for this proposal" });
        }
        if (/out of range/i.test(msg)) {
          return res.status(400).json({ message: "blindedToken is out of valid RSA range for this key" });
        }
        throw err;
      }
      res.json({ signature, publicKey: pub });
    } catch (error) {
      res.status(500).json({ message: "Failed to issue blind signature" });
    }
  });

  // Step 2: cast an anonymous vote. NO AUTH — would correlate with the
  // blind-sign request and defeat the property. Rate-limited per-IP by the
  // global /api/ limiter; the unique (proposal_id, vote_token) index is
  // the double-spend guard.
  app.post("/api/proposals/:id/anonymous-vote", async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id, 10);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const { token, signature, choice } = req.body ?? {};
      if (typeof token !== 'string' || typeof signature !== 'string') {
        return res.status(400).json({ message: "token + signature (base64) required" });
      }
      if (choice !== 'yes' && choice !== 'no' && choice !== 'abstain') {
        return res.status(400).json({ message: "choice must be yes / no / abstain" });
      }

      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.status !== 'voting') {
        return res.status(409).json({ message: "Proposal is not in the voting phase" });
      }
      if (proposal.votingMode !== 'anonymous') {
        return res.status(409).json({ message: "Proposal does not use anonymous voting" });
      }

      const { ensureKey } = await import('../utils/blind-sig-vault');
      const { verify, base64ToBytes } = await import('@shared/blind-sig');
      const pub = await ensureKey(proposalId);
      const tokenBytes = base64ToBytes(token);
      const ok = await verify(tokenBytes, signature, pub);
      if (!ok) return res.status(400).json({ message: "Invalid signature on token" });

      const { castAnonymousVoteWithChain } = await import('../utils/vote-chain');
      try {
        const result = await castAnonymousVoteWithChain({
          proposalId,
          voteToken: token,
          choice,
        });
        res.status(201).json({
          voteId: result.id,
          rowHash: result.receipt.rowHash,
          prevHash: result.receipt.prevHash,
          castAt: result.receipt.castAt,
          backend: 'hash-chain',
          mode: 'anonymous',
        });
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        // Postgres unique-violation on (proposal_id, vote_token) → double-spend.
        if (/duplicate key|unique/i.test(msg)) {
          return res.status(409).json({ message: "This token has already been used" });
        }
        throw err;
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to cast anonymous vote" });
    }
  });

  // Step 3 (optional): verify your own vote landed. Deniable receipt —
  // anyone holding a token can do this lookup, so a third party cannot
  // use the result to prove how you voted.
  app.get("/api/proposals/:id/verify-receipt", async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id, 10);
      const token = typeof req.query?.token === 'string' ? req.query.token : '';
      if (!Number.isFinite(proposalId) || !token) {
        return res.status(400).json({ message: "proposal id + token required" });
      }
      const { proposalVotes: pvTable } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const [row] = await db
        .select({ choice: pvTable.choice, castAt: pvTable.castAt, rowHash: pvTable.rowHash })
        .from(pvTable)
        .where(and(eq(pvTable.proposalId, proposalId), eq(pvTable.voteToken, token)))
        .limit(1);
      if (!row) return res.json({ found: false });
      res.json({ found: true, choice: row.choice, castAt: row.castAt, rowHash: row.rowHash });
    } catch (error) {
      res.status(500).json({ message: "Failed to verify receipt" });
    }
  });
  // Public election proof — backend-specific artifact a third party can
  // pin periodically to anchor the election externally.
  app.get("/api/proposals/:id/election/proof", async (req, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      const { getVotingBackend } = await import('../voting');
      const proof = await getVotingBackend().getProof({ proposalId });
      res.json(proof);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch election proof" });
    }
  });
  // Backend-internal consistency check. Returns ok=false with the first
  // inconsistency if tampering is detected.
  app.get("/api/proposals/:id/election/verify", async (req, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      const { getVotingBackend } = await import('../voting');
      const result = await getVotingBackend().verify({ proposalId });
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to verify election" });
    }
  });
  // Get aggregated final-vote results for a proposal.
  app.get("/api/proposals/:id/vote-results", async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      // Source the tally from the active voting backend, not the hash-chain
      // table directly — so a private backend can seal it until close.
      const { getVotingBackend } = await import('../voting');
      const view = await getVotingBackend().getVoterView({
        proposalId,
        userId: (req.user as any)?.id,
      });
      res.json(await computeVoteResults(proposal, view));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch vote results" });
    }
  });
  // Finalize the ratification vote and transition the proposal to `decided`
  app.post("/api/proposals/:id/finalize", requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.status !== 'voting') {
        return res.status(409).json({
          message: "Only proposals in the voting phase can be finalized",
          current_status: proposal.status,
        });
      }
      if (proposal.authorId !== req.user.id) {
        const role = await communityRepo.getCommunityMemberRole(proposal.communityId, req.user.id);
        if (role !== 'admin' && role !== 'founder') {
          return res.status(403).json({ message: "Not authorized to finalize this proposal" });
        }
      }
      // Close the election with the active backend first: this triggers
      // trustee decryption + seals the published record for ElectionGuard,
      // and is a head read for the hash chain. The final tally then comes
      // from the backend, so finalize works the same for any backend.
      const { getVotingBackend } = await import('../voting');
      const backend = getVotingBackend();
      await backend.closeAndTally({ proposalId });
      const view = await backend.getVoterView({ proposalId });
      const results = await computeVoteResults(proposal, view);
      // Use the community's minParticipationPct + decisive-vote check.
      // Archive if quorum was not met, or if there are zero yes/no votes
      // (only abstains can't decide a yes/no outcome).
      const hasDecisive = (results.yes + results.no) > 0;
      const nextState = results.meetsQuorum && hasDecisive ? 'decided' : 'archived';
      const { transitionProposal, triggerSideEffects } = await import('../utils/proposal-state-machine');
      const updated = await transitionProposal(proposal, nextState, storage);
      await triggerSideEffects(proposal.status, nextState, updated);
      res.json({ proposal: updated, results });
    } catch (error) {
      res.status(500).json({ message: "Failed to finalize proposal" });
    }
  });
  // ─── Demopolis: State Machine Routes ───────────────────────────────────────
  app.post("/api/proposals/:id/transition", requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      const { newState } = req.body;
      if (!isProposalState(newState)) {
        return res.status(400).json({ message: "A valid canonical proposal state is required" });
      }
      if (!isProposalState(proposal.status)) {
        return res.status(409).json({
          message: `Proposal has legacy or invalid status: ${proposal.status}`,
          current_status: proposal.status,
        });
      }
      // Import state machine
      const { transitionProposal, canTransition, getNextStates, triggerSideEffects } = await import('../utils/proposal-state-machine');
      // Validate transition
      if (!canTransition(proposal.status, newState)) {
        const valid = getNextStates(proposal.status);
        return res.status(409).json({
          message: `Invalid transition: ${proposal.status} → ${newState}`,
          valid_transitions: valid,
        });
      }
      // Check permissions
      if (proposal.authorId !== req.user.id) {
        const role = await communityRepo.getCommunityMemberRole(proposal.communityId, req.user.id);
        if (role !== 'admin' && role !== 'founder') {
          return res.status(403).json({ message: "Not authorized" });
        }
      }
      // Enforce maxConcurrentVotes when entering the voting phase.
      if (newState === 'voting') {
        const community = await communityRepo.getCommunity(proposal.communityId);
        const cap = community?.maxConcurrentVotes ?? -1;
        if (cap > 0) {
          const active = await proposalRepo.getProposals(proposal.communityId, { status: 'voting' });
          if (active.length >= cap) {
            return res.status(409).json({
              message: `Community has reached its concurrent-votes cap (${cap}). Wait for an existing vote to finalize.`,
              maxConcurrentVotes: cap,
              activeVotes: active.length,
            });
          }
        }
      }
      const { storage: storageInstance } = await import('../storage');
      const updated = await transitionProposal(proposal, newState, storage);
      await triggerSideEffects(proposal.status, newState, updated);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to transition proposal" });
    }
  });
  // ─── Demopolis: Sortition Routes ──────────────────────────────────────────
  app.get("/api/proposals/:id/attendance", requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const summary = await sortitionRepo.getAttendanceSummary(proposalId);
      // Find the current user's sortition member id (if any) for this proposal
      const userId = req.user.id;
      const bodies = await db
        .select()
        .from(sortitionBodies)
        .where(eq(sortitionBodies.proposalId, proposalId));
      let userMemberId: number | null = null;
      let userAttendance: any = null;
      for (const body of bodies) {
        const [member] = await db
          .select()
          .from(sortitionMembers)
          .where(and(eq(sortitionMembers.bodyId, body.id), eq(sortitionMembers.userId, userId)))
          .limit(1);
        if (member) {
          userMemberId = member.id;
          userAttendance = await sortitionRepo.getAttendance(proposalId, member.id) ?? null;
          break;
        }
      }
      const responseDeadline = bodies[0]?.selectedAt
        ? new Date(new Date(bodies[0].selectedAt).getTime() + (bodies[0].responseHours ?? 72) * 60 * 60 * 1000).toISOString()
        : null;
      res.json({ summary, userMemberId, userAttendance, responseDeadline });
    } catch (error) {
      res.status(500).json({ message: "Failed to get attendance" });
    }
  });
  app.post("/api/proposals/:id/attendance", requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const { status, notes, memberId } = req.body ?? {};
      const allowed = ['accepted', 'declined', 'completed'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: `status must be one of ${allowed.join(', ')}` });
      }
      // Resolve member id from current user if not supplied
      let resolvedMemberId = Number(memberId);
      if (!Number.isFinite(resolvedMemberId)) {
        const userId = req.user.id;
        const bodies = await db
          .select()
          .from(sortitionBodies)
          .where(eq(sortitionBodies.proposalId, proposalId));
        for (const body of bodies) {
          const [member] = await db
            .select()
            .from(sortitionMembers)
            .where(and(eq(sortitionMembers.bodyId, body.id), eq(sortitionMembers.userId, userId)))
            .limit(1);
          if (member) {
            resolvedMemberId = member.id;
            break;
          }
        }
      }
      if (!Number.isFinite(resolvedMemberId)) {
        return res.status(403).json({ message: "Not a member of this proposal's sortition body" });
      }
      // Verify this member belongs to the requesting user
      const [memberRow] = await db
        .select()
        .from(sortitionMembers)
        .where(eq(sortitionMembers.id, resolvedMemberId))
        .limit(1);
      if (!memberRow || memberRow.userId !== req.user.id) {
        return res.status(403).json({ message: "Not your assignment" });
      }
      const attendance = await sortitionRepo.upsertAttendance(proposalId, resolvedMemberId, status, notes);
      const summary = await sortitionRepo.getAttendanceSummary(proposalId);
      // Notify the proposal author when ≥50% confirm
      try {
        if (summary.confirmedPct >= 0.5 && summary.total > 0) {
          const proposal = await proposalRepo.getProposal(proposalId);
          if (proposal) {
            const { createNotification } = await import('../utils/notifications');
            await createNotification({
              userId: proposal.authorId,
              type: 'sortition_assigned',
              title: 'Sortition body confirmed',
              message: `${Math.round(summary.confirmedPct * 100)}% of selected members have confirmed attendance.`,
              proposalId,
              communityId: proposal.communityId,
              actionUrl: `/proposals/${proposalId}`,
            });
          }
        }
      } catch (e) {
        }
      res.json({ attendance, summary });
    } catch (error) {
      res.status(500).json({ message: "Failed to update attendance" });
    }
  });
  // Snapshot of the sortition body for a proposal: who's on the jury,
  // how many have responded, deadline, status, the AI-pre-merged baseline.
  app.get("/api/proposals/:id/sortition-body", async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      const bodies = await db
        .select()
        .from(sortitionBodies)
        .where(eq(sortitionBodies.proposalId, proposalId))
        .orderBy(desc(sortitionBodies.createdAt));
      if (bodies.length === 0) {
        return res.json({ body: null, members: [], userIsMember: false, deadline: null, baseline: null });
      }
      const body = bodies[0];
      const memberRows = await db
        .select({
          memberId: sortitionMembers.id,
          userId: sortitionMembers.userId,
          responded: sortitionMembers.responded,
          scoredAt: sortitionMembers.scoredAt,
          username: users.username,
          name: users.name,
          profilePicture: users.profilePicture,
        })
        .from(sortitionMembers)
        .innerJoin(users, eq(users.id, sortitionMembers.userId))
        .where(eq(sortitionMembers.bodyId, body.id));
      const userId = req.user?.id;
      const userIsMember = userId ? memberRows.some(m => m.userId === userId) : false;
      const deadline = body.selectedAt
        ? new Date(new Date(body.selectedAt).getTime() + (body.responseHours ?? 72) * 60 * 60 * 1000).toISOString()
        : null;
      const responded = memberRows.filter(m => m.responded).length;
      res.json({
        body: {
          id: body.id,
          status: body.status,
          purpose: body.purpose,
          size: body.size,
          responseHours: body.responseHours,
          selectedAt: body.selectedAt,
          completedAt: body.completedAt,
        },
        members: memberRows,
        respondedCount: responded,
        userIsMember,
        deadline,
        baseline: proposal.finalText ?? proposal.solution,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sortition body" });
    }
  });

  // Preview or recompute the AI-merged final text. Anyone can read; the
  // POST variant persists the result to finalText (author or admin only).
  app.get("/api/proposals/:id/merge-preview", async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const { aiMergeAmendments } = await import('../utils/ai-merger');
      const result = await aiMergeAmendments(proposalId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to compute merge preview" });
    }
  });

  app.post("/api/proposals/:id/merge", requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.authorId !== req.user.id) {
        const role = await communityRepo.getCommunityMemberRole(proposal.communityId, req.user.id);
        if (role !== 'admin' && role !== 'founder') {
          return res.status(403).json({ message: "Only the author or an admin can recompute the merge" });
        }
      }
      const { saveAiMergedFinalText } = await import('../utils/ai-merger');
      const result = await saveAiMergedFinalText(proposalId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to save merge" });
    }
  });

  app.delete("/api/proposals/:id", requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.authorId !== req.user.id) {
        return res.status(403).json({ message: "Only the author can delete this proposal" });
      }
      if (proposal.status !== 'draft') {
        return res.status(409).json({ message: "Only draft proposals can be deleted" });
      }
      await proposalRepo.deleteProposal(proposalId);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete proposal" });
    }
  });

  app.post("/api/proposals/:id/revalidate", requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.authorId !== req.user.id) {
        return res.status(403).json({ message: "Only the author can request re-validation" });
      }
      const { validateProposal } = await import('../utils/llm-validation');
      const { validationResults } = await import('@shared/schema');
      const result = await validateProposal(proposal.question, proposal.solution);
      await db.insert(validationResults).values({
        proposalId,
        score: Math.round(result.score),
        feedback: result.feedback,
        details: result.details,
        category: result.category,
      });
      const updated = await proposalRepo.updateProposal(proposalId, {
        llmScore: String(result.score),
        llmFeedback: result.feedback,
        llmValidatedAt: new Date(),
        llmValidationRound: (proposal.llmValidationRound ?? 1) + 1,
      });
      res.json({
        proposal: updated,
        validation: {
          score: result.score,
          feedback: result.feedback,
          category: result.category,
          details: result.details,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to re-validate proposal" });
    }
  });
  const httpServer = createServer(app);
  void httpServer;
}