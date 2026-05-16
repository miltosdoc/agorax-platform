/**
 * Sortition Router
 *
 * Handles sortition routes.
 */

import type { Express, Request, Response } from 'express';
import { db } from '../db';
import {  communityRepo, proposalRepo, sortitionRepo, userRepo , storage } from '../storage';

import { requireAuth } from '../auth';
import { awardPoints } from '../economy/points';
import { eq, and, desc, sql, inArray, or } from 'drizzle-orm';
import {
  sortitionMembers,
  sortitionBodies,
  sortitionNotifications,
  communityMembers,
  proposals,
  castProposalVoteSchema,
} from '@shared/schema';

export function registerSortitionRoutes(app: Express): void {
  app.get("/api/sortition/my-bodies", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const memberships = await db
        .select({ communityId: communityMembers.communityId })
        .from(communityMembers)
        .where(eq(communityMembers.userId, userId));
      if (memberships.length === 0) {
        return res.json([]);
      }
      const communityIds = memberships.map(m => m.communityId);
      const bodies = await db
        .select()
        .from(sortitionBodies)
        .where(inArray(sortitionBodies.communityId, communityIds))
        .orderBy(desc(sortitionBodies.createdAt));
      const enriched = await Promise.all(
        bodies.map(async (body) => {
          const members = await sortitionRepo.getSortitionMembers(body.id);
          const community = await communityRepo.getCommunity(body.communityId);
          const proposal = body.proposalId ? await proposalRepo.getProposal(body.proposalId) : null;
          const responded = members.filter(m => m.responded).length;
          const scores = members
            .filter(m => m.responded && m.score !== null)
            .map(m => parseFloat(m.score as unknown as string))
            .filter(n => Number.isFinite(n));
          const averageScore = scores.length
            ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
            : null;
          const deadline = body.selectedAt
            ? new Date(new Date(body.selectedAt).getTime() + (body.responseHours ?? 72) * 60 * 60 * 1000).toISOString()
            : null;
          const userMember = members.find(m => m.userId === userId) ?? null;
          return {
            id: body.id,
            communityId: body.communityId,
            communityName: community?.name ?? null,
            proposalId: body.proposalId,
            proposalQuestion: proposal?.question ?? null,
            purpose: body.purpose,
            status: body.status,
            size: body.size,
            memberCount: members.length,
            respondedCount: responded,
            averageScore,
            selectedAt: body.selectedAt,
            completedAt: body.completedAt,
            deadline,
            isMember: !!userMember,
            userAssignmentId: userMember?.id ?? null,
            userResponded: userMember?.responded ?? false,
          };
        })
      );
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to list sortition bodies" });
    }
  });
  // Public-ish ceremony view: community, purpose, selected members, and a
  app.get("/api/sortition/:bodyId/ceremony", requireAuth, async (req: any, res) => {
    try {
      const bodyId = parseInt(req.params.bodyId);
      const body = await sortitionRepo.getSortitionBody(bodyId);
      if (!body) return res.status(404).json({ message: "Sortition body not found" });
      const isMember = await communityRepo.isCommunityMember(body.communityId, req.user.id);
      if (!isMember) return res.status(403).json({ message: "Must be a community member" });
      const community = await communityRepo.getCommunity(body.communityId);
      const proposal = body.proposalId ? await proposalRepo.getProposal(body.proposalId) : null;
      const members = await sortitionRepo.getSortitionMembers(bodyId);
      const enrichedMembers = await Promise.all(
        members.map(async (m) => {
          const user = await userRepo.getUser(m.userId);
          return {
            assignmentId: m.id,
            userId: m.userId,
            name: user?.name ?? null,
            username: user?.username ?? null,
            profilePicture: user?.profilePicture ?? null,
          };
        })
      );
      // Deterministic verification hash from immutable identifiers.
      const { createHash } = await import('crypto');
      const sortedIds = [...members.map(m => m.userId)].sort((a, b) => a - b);
      const seedSource = `${body.id}|${body.selectedAt?.toISOString() ?? ''}|${sortedIds.join(',')}`;
      const verificationHash = createHash('sha256').update(seedSource).digest('hex');
      res.json({
        bodyId: body.id,
        community: community ? { id: community.id, name: community.name } : null,
        purpose: body.purpose,
        proposal: proposal ? { id: proposal.id, question: proposal.question } : null,
        selectedAt: body.selectedAt,
        size: body.size,
        members: enrichedMembers,
        verificationHash,
        currentUserAssignmentId:
          enrichedMembers.find(m => m.userId === req.user.id)?.assignmentId ?? null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ceremony view" });
    }
  });
  app.get("/api/sortition/:bodyId", requireAuth, async (req: any, res) => {
    try {
      const bodyId = parseInt(req.params.bodyId);
      const body = await sortitionRepo.getSortitionBody(bodyId);
      if (!body) {
        return res.status(404).json({ message: "Sortition body not found" });
      }
      const members = await sortitionRepo.getSortitionMembers(bodyId);
      // Get user details for each member
      const enrichedMembers = await Promise.all(
        members.map(async (m) => {
          const user = await userRepo.getUser(m.userId);
          return {
            ...m,
            user: user ? { id: user.id, name: user.name, username: user.username } : null,
          };
        })
      );
      res.json({
        ...body,
        members: enrichedMembers,
        memberCount: enrichedMembers.length,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get sortition body" });
    }
  });
  app.post("/api/sortition/:bodyId/complete", requireAuth, async (req: any, res) => {
    try {
      const bodyId = parseInt(req.params.bodyId);
      const body = await sortitionRepo.getSortitionBody(bodyId);
      if (!body) {
        return res.status(404).json({ message: "Sortition body not found" });
      }
      // Check if user is admin of the community
      const role = await communityRepo.getCommunityMemberRole(body.communityId, req.user.id);
      if (role !== 'admin' && role !== 'founder') {
        return res.status(403).json({ message: "Not authorized" });
      }
      if (body.status === 'completed') {
        return res.status(400).json({ message: "Sortition body already completed" });
      }
      const completed = await sortitionRepo.completeSortitionBody(bodyId);
      res.json(completed);
    } catch (error) {
      res.status(500).json({ message: "Failed to complete sortition body" });
    }
  });
  // ─── Demopolis: Sortition Assignment Routes ────────────────────────────────
  app.get("/api/sortition/assignments/:id", requireAuth, async (req: any, res) => {
    try {
      const memberId = parseInt(req.params.id);
      const member = await db
        .select()
        .from(sortitionMembers)
        .where(eq(sortitionMembers.id, memberId));
      if (!member.length) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      const sortMember = member[0];
      const body = await sortitionRepo.getSortitionBody(sortMember.bodyId);
      if (!body) {
        return res.status(404).json({ message: "Sortition body not found" });
      }
      // Get the proposal being reviewed
      let proposal = null;
      let similarProposals: any[] = [];
      if (body.proposalId) {
        proposal = await proposalRepo.getProposal(body.proposalId);
        if (proposal) {
          // Get similar proposals from same community
          const allProposals = await proposalRepo.getProposals(body.communityId);
          similarProposals = allProposals
            .filter(p => p.id !== proposal!.id && p.status === proposal!.status)
            .slice(0, 3)
            .map(p => ({
              id: p.id,
              question: p.question,
              state: p.status,
            }));
        }
      }
      res.json({
        id: sortMember.id,
        bodyId: sortMember.bodyId,
        proposalId: body.proposalId,
        proposalQuestion: proposal?.question || "",
        proposalSolution: proposal?.solution || "",
        responseDeadline: body.selectedAt
          ? new Date(new Date(body.selectedAt).getTime() + (body.responseHours || 72) * 60 * 60 * 1000).toISOString()
          : new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        similarProposals,
        responded: sortMember.responded,
        isYours: sortMember.userId === req.user.id,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch assignment" });
    }
  });
  app.post("/api/sortition/assignments/:id/score", requireAuth, async (req: any, res) => {
    try {
      const memberId = parseInt(req.params.id);
      const { score, feedback } = req.body ?? {};
      const numericScore = Number(score);
      if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
        return res.status(400).json({ message: "Score must be a number between 0 and 100" });
      }
      const [sortMember] = await db
        .select()
        .from(sortitionMembers)
        .where(eq(sortitionMembers.id, memberId));
      if (!sortMember) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      // Verify the user is the assigned member
      if (sortMember.userId !== req.user.id) {
        return res.status(403).json({ message: "Not your assignment" });
      }
      const updated = await sortitionRepo.updateSortitionMember(sortMember.bodyId, sortMember.userId, {
        score: String(numericScore),
        feedback: typeof feedback === 'string' && feedback.trim() ? feedback.trim() : null,
        responded: true,
        scoredAt: new Date(),
      });
      // Democracy Points: sortition jury service — the heaviest civic award.
      await awardPoints({
        userId: sortMember.userId,
        actionKey: 'sortition_score',
        refType: 'sortition_member',
        refId: sortMember.id,
      });
      res.json({ success: true, member: updated });
    } catch (error) {
      res.status(500).json({ message: "Failed to submit score" });
    }
  });
  app.post("/api/sortition/:bodyId/synthesize", requireAuth, async (req: any, res) => {
    try {
      const bodyId = parseInt(req.params.bodyId);
      const body = await sortitionRepo.getSortitionBody(bodyId);
      if (!body) {
        return res.status(404).json({ message: "Sortition body not found" });
      }
      // Check if user is admin of the community
      const role = await communityRepo.getCommunityMemberRole(body.communityId, req.user.id);
      if (role !== 'admin' && role !== 'founder') {
        return res.status(403).json({ message: "Not authorized" });
      }
      const { synthesizeSortitionScores } = await import('../utils/sortition');
      const result = await synthesizeSortitionScores(bodyId, storage);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to synthesize scores" });
    }
  });
  // ─── Demopolis: Democracy Score Routes ────────────────────────────────────
}