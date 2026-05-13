/**
 * Communities Router
 *
 * Handles communities routes.
 */

import type { Express, Request, Response } from 'express';
import {  communityRepo, proposalRepo, sortitionRepo , storage } from '../storage';

import { db } from '../db';
import { requireAuth } from '../auth';
import { eq, and, desc, sql, inArray, or } from 'drizzle-orm';
import {
  sortitionMembers,
  sortitionBodies,
  sortitionNotifications,
  communityMembers,
  proposals,
  users,
  castProposalVoteSchema,
} from '@shared/schema';
import { sanitizeCommunityCreateInput, sanitizeCommunityUpdateInput } from '@shared/community-settings';
import { buildCommunitySummary } from '@shared/community-summary';

export function registerCommunitiesRoutes(app: Express): void {
  app.get("/api/communities", async (req, res) => {
    try {
      const userId = req.user?.id;
      const communities = await communityRepo.getCommunities(userId);
      res.json(communities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch communities" });
    }
  });
  app.post("/api/communities", requireAuth, async (req: any, res) => {
    try {
      const communitySettings = sanitizeCommunityCreateInput(req.body);
      const community = await communityRepo.createCommunity({
        ...communitySettings,
        creatorId: req.user.id,
      });
      // Auto-add creator as founder
      await communityRepo.addCommunityMember(community.id, req.user.id, 'founder');
      res.status(201).json(community);
    } catch (error) {
      res.status(500).json({ message: "Failed to create community" });
    }
  });
  app.get("/api/communities/:id", async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: "Community not found" });
      res.json(community);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch community" });
    }
  });
  app.get("/api/communities/:id/summary", async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: "Community not found" });
      const [members, proposals] = await Promise.all([
        communityRepo.getCommunityMembers(communityId),
        proposalRepo.getProposals(communityId),
      ]);
      const currentUserRole = req.user?.id
        ? await communityRepo.getCommunityMemberRole(communityId, req.user.id)
        : undefined;
      res.json(buildCommunitySummary(community, proposals, members.length, currentUserRole));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch community summary" });
    }
  });
  app.patch("/api/communities/:id", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const role = await communityRepo.getCommunityMemberRole(communityId, req.user.id);
      if (!role || (role !== 'admin' && role !== 'founder')) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const communitySettings = sanitizeCommunityUpdateInput(req.body);
      const community = await communityRepo.updateCommunity(communityId, communitySettings);
      res.json(community);
    } catch (error) {
      res.status(500).json({ message: "Failed to update community" });
    }
  });
  app.get("/api/communities/:id/members", async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const rows = await db
        .select({
          userId: communityMembers.userId,
          role: communityMembers.role,
          joinedAt: communityMembers.joinedAt,
          username: users.username,
          name: users.name,
          profilePicture: users.profilePicture,
        })
        .from(communityMembers)
        .innerJoin(users, eq(users.id, communityMembers.userId))
        .where(eq(communityMembers.communityId, communityId))
        .orderBy(desc(communityMembers.joinedAt));
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch members" });
    }
  });
  app.post("/api/communities/:id/members", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const userId = req.user!.id;
      // Check if already a member
      const isMember = await communityRepo.isCommunityMember(communityId, userId);
      if (isMember) {
        return res.status(409).json({ message: "Already a member" });
      }
      const member = await communityRepo.addCommunityMember(communityId, userId);
      res.status(201).json(member);
    } catch (error) {
      res.status(500).json({ message: "Failed to join community" });
    }
  });
  app.delete("/api/communities/:id/members", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const userId = req.user!.id;
      await communityRepo.removeCommunityMember(communityId, userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to leave community" });
    }
  });
  // ─── Demopolis: Proposal Routes ────────────────────────────────────────────
  app.post("/api/communities/:id/merge", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const userId = req.user.id;
      // Check if user is admin or founder of the source community
      const role = await communityRepo.getCommunityMemberRole(communityId, userId);
      if (role !== 'admin' && role !== 'founder') {
        return res.status(403).json({ message: "Only admin or founder can merge communities" });
      }
      const { targetCommunityId } = req.body;
      if (!targetCommunityId || typeof targetCommunityId !== 'number') {
        return res.status(400).json({ message: "targetCommunityId is required and must be a number" });
      }
      // Validate target community exists
      const target = await communityRepo.getCommunity(targetCommunityId);
      if (!target) {
        return res.status(404).json({ message: "Target community not found" });
      }
      // Perform merge
      const result = await communityRepo.mergeCommunities(communityId, targetCommunityId);
      if (!result.success) {
        return res.status(400).json({
          message: "Merge failed",
          errors: result.errors,
        });
      }
      res.json({
        message: "Communities merged successfully",
        result: {
          sourceId: result.sourceId,
          targetId: result.targetId,
          membersTransferred: result.membersTransferred,
          proposalsTransferred: result.proposalsTransferred,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to merge communities" });
    }
  });
  app.get("/api/communities/:id/merged", async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const merged = await communityRepo.getMergedCommunities(communityId);
      res.json(merged);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch merged communities" });
    }
  });
  app.post("/api/communities/:id/sortition", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const role = await communityRepo.getCommunityMemberRole(communityId, req.user.id);
      if (role !== 'admin' && role !== 'founder') {
        return res.status(403).json({ message: "Not authorized" });
      }
      const { size } = req.body;
      const panelSize = size || 7;
      const { createSortitionBody } = await import('../utils/sortition');
      const result = await createSortitionBody(communityId, panelSize, storage);
      // Notify selected members
      try {
        const { notifySortitionMembers } = await import('../utils/notifications');
        const notified = await notifySortitionMembers(
          result.bodyId,
          communityId,
          null,
          72
        );
      } catch (notifError) {
        // Don't fail the sortition creation if notifications fail
      }
      res.status(201).json({
        ...result,
        redirectUrl: `/sortition/${result.bodyId}/ceremony`,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to create sortition body" });
    }
  });
  app.get("/api/communities/:id/sortition/preview", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const isMember = await communityRepo.isCommunityMember(communityId, req.user.id);
      if (!isMember) {
        return res.status(403).json({ message: "Must be a community member" });
      }
      const { previewSortition } = await import('../utils/sortition');
      const { size } = req.query;
      const panelSize = parseInt(size as string) || 7;
      const result = await previewSortition(communityId, panelSize, storage);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to preview sortition" });
    }
  });
  app.get("/api/communities/:id/sortition", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const role = await communityRepo.getCommunityMemberRole(communityId, req.user.id);
      if (role !== 'admin' && role !== 'founder') {
        return res.status(403).json({ message: "Not authorized" });
      }
      // Get all sortition bodies for this community
      const bodies = await db
        .select()
        .from(sortitionBodies)
        .where(eq(sortitionBodies.communityId, communityId))
        .orderBy(desc(sortitionBodies.createdAt));
      // Enrich with member counts
      const enriched = await Promise.all(
        bodies.map(async (body) => {
          const members = await sortitionRepo.getSortitionMembers(body.id);
          return {
            ...body,
            memberCount: members.length,
            members: members.map(m => ({ userId: m.userId, scoredAt: m.scoredAt })),
          };
        })
      );
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to list sortition bodies" });
    }
  });
  // List sortition bodies across all communities the user is a member of.
  app.get("/api/communities/:id/democracy-score", async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const community = await communityRepo.getCommunity(communityId);
      if (!community) {
        return res.status(404).json({ message: "Community not found" });
      }
      const { calculateDemocracyScore, getDemocracyGrade } = await import('../utils/democracy-score');
      const result = await calculateDemocracyScore(communityId, storage as any);
      res.json({
        ...result,
        grade: getDemocracyGrade(result.score),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate democracy score" });
    }
  });
  // ─── Sortition Notification Routes ──────────────────────────────────────
}