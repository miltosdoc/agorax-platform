/**
 * Amendments Router
 *
 * Handles amendments routes.
 */

import type { Express, Request, Response } from 'express';
import { amendmentRepo, communityRepo, proposalRepo } from '../storage';
import { requireAuth } from '../auth';
import { awardPoints } from '../economy/points';
import {
  authorReviewAmendment,
  castRejectionVote,
  calculateCommunitySignals,
  buildSortitionInput,
  saveFinalText,
} from '../utils/amendment-processor';

/** True if `userId` belongs to a sortition body assigned to `proposalId`. */
async function isSortitionMember(proposalId: number, userId: number): Promise<boolean> {
  const { db } = await import('../db');
  const { sortitionBodies, sortitionMembers } = await import('@shared/schema');
  const { and, eq } = await import('drizzle-orm');
  const rows = await db
    .select({ id: sortitionMembers.id })
    .from(sortitionMembers)
    .innerJoin(sortitionBodies, eq(sortitionBodies.id, sortitionMembers.bodyId))
    .where(and(
      eq(sortitionBodies.proposalId, proposalId),
      eq(sortitionMembers.userId, userId),
    ))
    .limit(1);
  return rows.length > 0;
}

export function registerAmendmentsRoutes(app: Express): void {
  app.get("/api/proposals/:id/amendments", async (req: any, res) => {
    try {
      const amendments = await amendmentRepo.getAmendments(parseInt(req.params.id));
      const userId = req.user?.id;
      let userVotes = new Map<number, number>();
      if (userId && amendments.length > 0) {
        const { db } = await import('../db');
        const { amendmentRejectionVotes } = await import('@shared/schema');
        const { inArray, and, eq } = await import('drizzle-orm');
        const rows = await db
          .select({ amendmentId: amendmentRejectionVotes.amendmentId, vote: amendmentRejectionVotes.vote })
          .from(amendmentRejectionVotes)
          .where(and(
            eq(amendmentRejectionVotes.userId, userId),
            inArray(amendmentRejectionVotes.amendmentId, amendments.map((a: any) => a.id)),
          ));
        userVotes = new Map(rows.map(r => [r.amendmentId, r.vote]));
      }
      const enriched = amendments.map((a: any) => {
        const up = a.rejectionUpvotes ?? 0;
        const down = a.rejectionDownvotes ?? 0;
        const total = up + down;
        return {
          ...a,
          // Reuse rejection-vote aggregates as general amendment popularity.
          upvotes: up,
          downvotes: down,
          popularityScore: up - down,
          popularityRatio: total > 0 ? up / total : 0,
          userVote: userVotes.get(a.id) ?? 0,
        };
      });
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch amendments" });
    }
  });
  app.post("/api/proposals/:id/amendments", requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      const isMember = await communityRepo.isCommunityMember(proposal.communityId, req.user!.id);
      if (!isMember) return res.status(403).json({ message: "Must be a community member" });
      // Check amendment cap
      const community = await communityRepo.getCommunity(proposal.communityId);
      const cap = community?.maxAmendmentsPerProposal ?? -1;
      if (cap > 0) {
        const currentCount = await amendmentRepo.countAmendmentsForProposal(proposalId);
        if (currentCount >= cap) {
          return res.status(400).json({
            message: `Amendment limit reached (${cap} per proposal)`,
          });
        }
      }
      const { type, text } = req.body;
      if (!type || !text) {
        return res.status(400).json({ message: "Type and text are required" });
      }
      const amendment = await amendmentRepo.createAmendment({
        proposalId,
        authorId: req.user.id,
        type,
        text,
        status: 'pending',
      });
      const { findDuplicateAmendments } = await import('../utils/amendment-merger');
      const groups = await findDuplicateAmendments(proposalId);
      const duplicateGroup = groups.find(g => g.amendmentIds.includes(amendment.id));
      // Democracy Points: award the contributor — skip flagged duplicate siblings.
      if (!duplicateGroup || duplicateGroup.representativeId === amendment.id) {
        await awardPoints({
          userId: req.user.id,
          actionKey: 'amendment',
          refType: 'amendment',
          refId: amendment.id,
        });
      }
      res.status(201).json({
        ...amendment,
        duplicate: duplicateGroup
          ? {
              representativeId: duplicateGroup.representativeId,
              siblingIds: duplicateGroup.amendmentIds.filter(id => id !== amendment.id),
              similarity: duplicateGroup.similarity,
            }
          : null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to create amendment" });
    }
  });
  // ─── Amendment Review: Author accepts/rejects an amendment ──────────────────
  app.post("/api/amendments/:id/review", requireAuth, async (req: any, res) => {
    try {
      const amendmentId = parseInt(req.params.id);
      const { decision, reason } = req.body;
      if (!['accepted', 'rejected'].includes(decision)) {
        return res.status(400).json({ message: "Decision must be 'accepted' or 'rejected'" });
      }
      const amendment = await amendmentRepo.getAmendment(amendmentId);
      if (!amendment) return res.status(404).json({ message: "Amendment not found" });
      // Only the proposal author can review amendments
      const proposal = await proposalRepo.getProposal(amendment.proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.authorId !== req.user.id) {
        return res.status(403).json({ message: "Only the proposal author can review amendments" });
      }
      await authorReviewAmendment(amendmentId, decision as 'accepted' | 'rejected', reason);
      res.json({ success: true, decision });
    } catch (error) {
      res.status(500).json({ message: "Failed to review amendment" });
    }
  });
  // ─── Amendment Review: Community votes on rejected amendments ───────────────
  // General amendment popularity vote — available in any phase.
  // (The old /rejection-vote alias is kept for backward compatibility but
  // no longer restricted to rejected amendments.)
  const handleAmendmentVote = async (req: any, res: any) => {
    try {
      const amendmentId = parseInt(req.params.id);
      const { vote } = req.body;
      if (![1, -1].includes(vote)) {
        return res.status(400).json({ message: "Vote must be +1 or -1" });
      }
      const amendment = await amendmentRepo.getAmendment(amendmentId);
      if (!amendment) return res.status(404).json({ message: "Amendment not found" });
      const proposal = await proposalRepo.getProposal(amendment.proposalId);
      if (!proposal) return res.status(404).json({ message: "Parent proposal not found" });
      const isMember = await communityRepo.isCommunityMember(proposal.communityId, req.user.id);
      if (!isMember) return res.status(403).json({ message: "Must be a community member" });
      await castRejectionVote(amendmentId, req.user.id, vote as 1 | -1);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to cast vote" });
    }
  };
  app.post("/api/amendments/:id/vote", requireAuth, handleAmendmentVote);
  app.post("/api/amendments/:id/rejection-vote", requireAuth, handleAmendmentVote);
  // ─── Amendment Duplicates: Flag overlapping amendments for author review ────
  app.get("/api/proposals/:id/amendments/duplicates", async (req, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      const thresholdParam = req.query.threshold;
      const threshold = typeof thresholdParam === 'string' ? Number.parseFloat(thresholdParam) : undefined;
      const { findDuplicateAmendments, DEFAULT_SIMILARITY_THRESHOLD } = await import('../utils/amendment-merger');
      const groups = await findDuplicateAmendments(
        proposalId,
        Number.isFinite(threshold as number) ? threshold : DEFAULT_SIMILARITY_THRESHOLD,
      );
      res.json({ proposalId, groups });
    } catch (error) {
      res.status(500).json({ message: "Failed to detect duplicate amendments" });
    }
  });
  // ─── Community Signal: Get signal data for all rejected amendments ──────────
  app.get("/api/proposals/:id/amendments/signals", async (req, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      const signals = await calculateCommunitySignals(proposalId, proposal.communityId);
      res.json(signals);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch signals" });
    }
  });
  // ─── Sortition Input: Get the sortition synthesis package ───────────────────
  app.get("/api/proposals/:id/sortition-input", requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      // Check if user is part of the sortition body for this proposal
      // (simplified check — in production, verify sortition membership)
      const input = await buildSortitionInput(proposalId, proposal.communityId);
      res.json(input);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sortition input" });
    }
  });
  // ─── Sortition: jury revisions ──────────────────────────────────────────────
  // A sortition body member's edit is recorded as an amendment layered on the
  // author's original — type 'sortition_revision' — so the voter sees the
  // original proposal plus every attributed revision, never an opaque blob.
  app.post("/api/proposals/:id/sortition-amendments", requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text) return res.status(400).json({ message: "Revision text is required" });
      if (!(await isSortitionMember(proposalId, req.user.id))) {
        return res.status(403).json({ message: "Only sortition body members may revise this proposal" });
      }
      const amendment = await amendmentRepo.createAmendment({
        proposalId,
        authorId: req.user.id,
        type: 'sortition_revision',
        text,
        status: 'accepted',
      });
      // Democracy Points: a sortition revision is an amendment contribution.
      await awardPoints({
        userId: req.user.id,
        actionKey: 'amendment',
        refType: 'amendment',
        refId: amendment.id,
      });
      res.status(201).json(amendment);
    } catch (error) {
      res.status(500).json({ message: "Failed to submit sortition revision" });
    }
  });

  app.get("/api/proposals/:id/sortition-amendments", async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const all = await amendmentRepo.getAmendments(proposalId);
      const revisions = all.filter((a: any) => a.type === 'sortition_revision');
      if (revisions.length === 0) return res.json([]);
      const { db } = await import('../db');
      const { users } = await import('@shared/schema');
      const { inArray } = await import('drizzle-orm');
      const authorIds = Array.from(new Set(revisions.map((a: any) => a.authorId)));
      const authors = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, authorIds));
      const nameById = new Map(authors.map((u) => [u.id, u.name]));
      res.json(
        revisions
          .sort((a: any, b: any) => a.id - b.id)
          .map((a: any) => ({
            id: a.id,
            text: a.text,
            authorId: a.authorId,
            authorName: nameById.get(a.authorId) ?? 'Unknown',
            createdAt: a.createdAt,
          })),
      );
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sortition revisions" });
    }
  });

  // ─── Sortition: Save final composed text (legacy — kept for compatibility) ──
  app.post("/api/proposals/:id/final-text", requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const { finalText } = req.body;
      if (!finalText) {
        return res.status(400).json({ message: "Final text is required" });
      }
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      // Check if proposal is in sortition_synthesis state
      if (proposal.status !== 'sortition_synthesis') {
        return res.status(400).json({ message: "Proposal must be in sortition_synthesis state" });
      }
      // Only a member of this proposal's sortition body may compose the text.
      if (!(await isSortitionMember(proposalId, req.user.id))) {
        return res.status(403).json({ message: "Only sortition body members may compose the final text" });
      }
      await saveFinalText(proposalId, finalText);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to save final text" });
    }
  });
  // ─── Demopolis: Debate Routes ──────────────────────────────────────────────
}