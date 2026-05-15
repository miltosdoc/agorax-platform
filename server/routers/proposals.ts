/**
 * Proposals Router
 *
 * Handles proposals routes.
 */

import type { Express, Request, Response } from 'express';
import {  communityRepo, proposalRepo, sortitionRepo , storage } from '../storage';
import { requireAuth } from '../auth';
import { db } from '../db';
import { eq, and, desc, sql, inArray, or } from 'drizzle-orm';
import {
  sortitionMembers,
  sortitionBodies,
  sortitionNotifications,
  communityMembers,
  proposals,
  castProposalVoteSchema,
} from '@shared/schema';
import { INITIAL_PROPOSAL_STATE, isProposalState } from '@shared/proposal-lifecycle';
import { createServer, type Server } from 'http';

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
  app.post("/api/communities/:communityId/proposals", requireAuth, async (req: any, res) => {
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
  app.post("/api/proposals/:id/support", requireAuth, async (req: any, res) => {
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
  // Cast a final ratification vote. The table is append-only and forms a
  // per-proposal SHA-256 hash chain; the response includes a receipt the
  // voter can use later to prove their ballot is included in the chain.
  app.post("/api/proposals/:id/vote", requireAuth, async (req: any, res) => {
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
      const isMember = await communityRepo.isCommunityMember(proposal.communityId, req.user.id);
      if (!isMember) {
        return res.status(403).json({ message: "Only community members may cast a final vote" });
      }
      const vote = await proposalRepo.castProposalVote(proposalId, req.user.id, parsed.data.choice);
      res.status(201).json(vote);
    } catch (error) {
      res.status(500).json({ message: "Failed to cast vote" });
    }
  });
  // Public chain head — any third party can pin this hash periodically to
  // turn the in-DB chain into an externally anchored append-only log.
  app.get("/api/proposals/:id/vote-chain/head", async (req, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      const { getChainHead } = await import('../utils/vote-chain');
      const head = await getChainHead(proposalId);
      res.json(head);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch vote chain head" });
    }
  });
  // Walk the chain and verify every row. Returns ok=false with the first
  // broken row if tampering is detected.
  app.get("/api/proposals/:id/vote-chain/verify", async (req, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      const { verifyChain } = await import('../utils/vote-chain');
      const result = await verifyChain(proposalId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to verify vote chain" });
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
      const results = await proposalRepo.getProposalVoteResults(proposalId);
      const userId = (req.user as any)?.id;
      const userVote = userId ? await proposalRepo.getUserProposalVote(proposalId, userId) : undefined;
      res.json({
        ...results,
        userVote: userVote?.choice ?? null,
      });
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
      const results = await proposalRepo.getProposalVoteResults(proposalId);
      // Use the community's minParticipationPct + decisive-vote check.
      // Archive if quorum was not met, or if there are zero yes/no votes
      // (only abstains can't decide a yes/no outcome).
      const hasDecisive = (results.yes + results.no) > 0;
      const nextState = results.meetsQuorum && hasDecisive ? 'decided' : 'archived';
      const { transitionProposal, triggerSideEffects } = await import('../utils/proposal-state-machine');
      const { storage: storageInstance } = await import('../storage');
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