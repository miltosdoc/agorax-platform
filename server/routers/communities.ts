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
  proposalSupport,
  users,
  castProposalVoteSchema,
} from '@shared/schema';
import { sanitizeCommunityCreateInput, sanitizeCommunityUpdateInput } from '@shared/community-settings';
import { buildCommunitySummary } from '@shared/community-summary';

export function registerCommunitiesRoutes(app: Express): void {
  app.get("/api/communities", async (req, res) => {
    try {
      const userId = req.user?.id;
      const list = await communityRepo.getCommunities(userId);
      if (list.length === 0) return res.json(list);

      const ids = list.map((c) => c.id);

      // Member counts per community
      const memberRows = await db
        .select({
          communityId: communityMembers.communityId,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(communityMembers)
        .where(inArray(communityMembers.communityId, ids))
        .groupBy(communityMembers.communityId);
      const memberCounts = new Map(memberRows.map((r) => [r.communityId, r.count]));

      // Latest proposal per community
      const latestRows = await db
        .select({
          id: proposals.id,
          communityId: proposals.communityId,
          question: proposals.question,
          status: proposals.status,
          createdAt: proposals.createdAt,
        })
        .from(proposals)
        .where(inArray(proposals.communityId, ids))
        .orderBy(desc(proposals.createdAt));
      const latestByCommunity = new Map<number, typeof latestRows[number]>();
      for (const row of latestRows) {
        if (!latestByCommunity.has(row.communityId)) {
          latestByCommunity.set(row.communityId, row);
        }
      }

      // Most popular proposal per community — by distinct supporters
      const supportRows = await db
        .select({
          proposalId: proposalSupport.proposalId,
          supporters: sql<number>`cast(count(distinct ${proposalSupport.userId}) as int)`,
        })
        .from(proposalSupport)
        .where(eq(proposalSupport.type, 'support'))
        .groupBy(proposalSupport.proposalId);
      const supportByProposal = new Map(supportRows.map((r) => [r.proposalId, r.supporters]));

      const popularByCommunity = new Map<number, { id: number; question: string; supporters: number }>();
      for (const row of latestRows) {
        const supporters = supportByProposal.get(row.id) ?? 0;
        const current = popularByCommunity.get(row.communityId);
        if (!current || supporters > current.supporters) {
          popularByCommunity.set(row.communityId, {
            id: row.id,
            question: row.question,
            supporters,
          });
        }
      }

      const enriched = list.map((c) => ({
        ...c,
        memberCount: memberCounts.get(c.id) ?? 0,
        latestProposal: latestByCommunity.get(c.id)
          ? {
              id: latestByCommunity.get(c.id)!.id,
              question: latestByCommunity.get(c.id)!.question,
              status: latestByCommunity.get(c.id)!.status,
              createdAt: latestByCommunity.get(c.id)!.createdAt,
            }
          : null,
        mostPopularProposal: popularByCommunity.get(c.id) ?? null,
      }));

      res.json(enriched);
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
      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: "Community not found" });

      const isMember = await communityRepo.isCommunityMember(communityId, userId);
      if (isMember) {
        return res.status(409).json({ message: "Already a member" });
      }

      const policy = community.joinPolicy ?? 'open';

      if (policy === 'invite_only') {
        return res.status(403).json({ message: "This community is invite-only" });
      }

      if (policy === 'approval') {
        const existing = await communityRepo.getPendingJoinRequest(communityId, userId);
        if (existing) {
          return res.status(202).json({ status: 'pending', request: existing });
        }
        const message = typeof req.body?.message === 'string' ? req.body.message.slice(0, 500) : undefined;
        const request = await communityRepo.createJoinRequest(communityId, userId, message);
        return res.status(202).json({ status: 'pending', request });
      }

      const member = await communityRepo.addCommunityMember(communityId, userId);
      res.status(201).json(member);
    } catch (error) {
      res.status(500).json({ message: "Failed to join community" });
    }
  });

  app.get("/api/communities/:id/join-requests", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const role = await communityRepo.getCommunityMemberRole(communityId, req.user.id);
      if (role !== 'admin' && role !== 'founder') {
        return res.status(403).json({ message: "Not authorized" });
      }
      const requests = await communityRepo.listPendingJoinRequests(communityId);
      if (requests.length === 0) return res.json([]);

      const userIds = Array.from(new Set(requests.map(r => r.userId)));
      const userRows = await db
        .select({ id: users.id, username: users.username, name: users.name, profilePicture: users.profilePicture })
        .from(users)
        .where(inArray(users.id, userIds));
      const userById = new Map(userRows.map(u => [u.id, u]));

      res.json(requests.map(r => ({ ...r, user: userById.get(r.userId) ?? null })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch join requests" });
    }
  });

  app.post("/api/communities/:id/join-requests/:requestId/:decision", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const requestId = parseInt(req.params.requestId);
      const decision = req.params.decision === 'approve' ? 'approved' : req.params.decision === 'reject' ? 'rejected' : null;
      if (!decision) return res.status(400).json({ message: "Decision must be 'approve' or 'reject'" });

      const role = await communityRepo.getCommunityMemberRole(communityId, req.user.id);
      if (role !== 'admin' && role !== 'founder') {
        return res.status(403).json({ message: "Not authorized" });
      }

      const decided = await communityRepo.decideJoinRequest(requestId, decision, req.user.id);
      if (!decided) return res.status(404).json({ message: "Pending request not found" });
      if (decided.communityId !== communityId) return res.status(400).json({ message: "Request does not belong to this community" });

      if (decision === 'approved') {
        const alreadyMember = await communityRepo.isCommunityMember(communityId, decided.userId);
        if (!alreadyMember) {
          await communityRepo.addCommunityMember(communityId, decided.userId);
        }
      }
      res.json(decided);
    } catch (error) {
      res.status(500).json({ message: "Failed to update join request" });
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
  // Promote or demote a member's role. Caller must be admin or founder
  // of the community. Founder role is immutable.
  app.patch("/api/communities/:id/members/:userId", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const targetUserId = parseInt(req.params.userId);
      if (!Number.isFinite(communityId) || !Number.isFinite(targetUserId)) {
        return res.status(400).json({ message: "Invalid community or user id" });
      }
      const { role } = req.body as { role?: string };
      if (role !== 'admin' && role !== 'member') {
        return res.status(400).json({ message: "Role must be 'admin' or 'member'" });
      }
      const callerRole = await communityRepo.getCommunityMemberRole(communityId, req.user.id);
      if (callerRole !== 'admin' && callerRole !== 'founder') {
        return res.status(403).json({ message: "Only admins or the founder can change roles" });
      }
      const targetRole = await communityRepo.getCommunityMemberRole(communityId, targetUserId);
      if (!targetRole) {
        return res.status(404).json({ message: "Target user is not a member" });
      }
      if (targetRole === 'founder') {
        return res.status(409).json({ message: "Founder role cannot be changed" });
      }
      if (targetUserId === req.user.id) {
        return res.status(409).json({ message: "Cannot change your own role" });
      }
      const updated = await communityRepo.updateMemberRole(communityId, targetUserId, role);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update member role" });
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
      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: "Community not found" });
      const { size } = req.body;
      const mode = (community.sortitionMode ?? 'absolute') as 'absolute' | 'percentage';
      const responseHours = community.sortitionResponseHours ?? 72;
      // Caller can override the community's configured size; otherwise use it.
      const panelSize = typeof size === 'number' && size > 0
        ? size
        : (community.sortitionSize ?? 7);
      const { createSortitionBody } = await import('../utils/sortition');
      const result = await createSortitionBody(
        communityId,
        panelSize,
        storage,
        undefined,
        undefined,
        undefined,
        { mode, responseHours },
      );
      // Notify selected members
      try {
        const { notifySortitionMembers } = await import('../utils/notifications');
        const notified = await notifySortitionMembers(
          result.bodyId,
          communityId,
          null,
          responseHours,
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
      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: "Community not found" });
      const { previewSortition } = await import('../utils/sortition');
      const { size } = req.query;
      const queryPanelSize = parseInt(size as string);
      const panelSize = Number.isFinite(queryPanelSize) && queryPanelSize > 0
        ? queryPanelSize
        : (community.sortitionSize ?? 7);
      const mode = (community.sortitionMode ?? 'absolute') as 'absolute' | 'percentage';
      const result = await previewSortition(communityId, panelSize, storage, mode);
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
      // Persist the score so the badge on the community dashboard reflects
      // the latest computation, not the seeded value.
      try {
        await communityRepo.updateCommunity(communityId, { democracyScore: String(result.score) });
      } catch {
        // Don't block the response if persistence fails.
      }
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