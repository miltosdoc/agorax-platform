/**
 * Communities Router
 *
 * Handles communities routes.
 */

import type { Express, Request, Response } from 'express';
import {  communityRepo, proposalRepo, sortitionRepo , storage, discoveryRepo } from '../storage';

import { db } from '../db';
import { requireAuth } from '../auth';
import { eq, ne, and, desc, sql, inArray, or } from 'drizzle-orm';
import {
  sortitionMembers,
  sortitionBodies,
  sortitionNotifications,
  communityMembers,
  communityJoinRequests,
  proposals,
  proposalSupport,
  users,
  castProposalVoteSchema,
} from '@shared/schema';
import { sanitizeCommunityCreateInput, sanitizeCommunityUpdateInput, assertCommunityRanges,
  canSubmitProposal,
  effectiveProposalPolicy,
} from '@shared/community-settings';
import { buildCommunitySummary } from '@shared/community-summary';
import {
  REMOVAL_REASON_MAX, REMOVAL_REASON_MIN, REMOVAL_RESPONSE_MAX,
  directRemovalBlocker, isRemovalChoice, removalModeFor,
} from '@shared/member-removal';
import {
  RemovalError, activeRemoval, cancelRemovalVote, castRemovalBallot, cooldownMessage, getRemovalVote,
  liftRemoval, openRemovalVote, removalOverview, removeMember, setRemovalResponse,
} from '../utils/member-removal';
import { logAdminAction } from '../utils/admin-action-logger';
import { registerDiscordRoutes } from './discord';
import { getCommunityJoinStatus } from '@shared/community-membership';
import { ACTIVE_PROPOSAL_STATES } from '@shared/activity-feed';
import {
  isActiveGovernableSettingKey,
  isGovernableSettingKey,
  parseGovernableSetting,
} from '@shared/governable-settings';
import {
  canViewCommunityContent,
  isMemberListPublic,
  visibleCommunityIdSet,
} from '../utils/community-visibility';

export function registerCommunitiesRoutes(app: Express): void {
  // Discord sign-in and each community's Discord channel (routers/discord.ts).
  registerDiscordRoutes(app);

  // Pin or unpin a community to the top of the viewer's own lists.
  app.put('/api/communities/:id/pin', requireAuth, async (req: any, res: Response) => {
    try {
      const communityId = parseInt(req.params.id);
      if (!Number.isInteger(communityId)) return res.status(400).json({ message: 'Invalid community' });
      const pinned = req.body?.pinned === true;
      const [row] = await db.update(communityMembers)
        .set({ pinnedAt: pinned ? new Date() : null })
        .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, req.user.id)))
        .returning({ pinnedAt: communityMembers.pinnedAt });
      if (!row) return res.status(404).json({ message: 'You are not a member of this community' });
      res.json({ pinnedAt: row.pinnedAt });
    } catch {
      res.status(500).json({ message: 'Failed to pin community' });
    }
  });
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
        .where(and(
          inArray(proposals.communityId, ids),
          userId ? or(ne(proposals.status, 'draft'), eq(proposals.authorId, userId)) : ne(proposals.status, 'draft'),
        ))
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

      // Proposal counts per community — the card of the new design states a
      // count next to the member count, and deriving it from latestRows would
      // undercount once that query grows a limit.
      const proposalCountRows = await db
        .select({
          communityId: proposals.communityId,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(proposals)
        .where(and(
          inArray(proposals.communityId, ids),
          userId ? or(ne(proposals.status, 'draft'), eq(proposals.authorId, userId)) : ne(proposals.status, 'draft'),
        ))
        .groupBy(proposals.communityId);
      const proposalCounts = new Map(proposalCountRows.map((r) => [r.communityId, r.count]));

      // Which of these the viewer has saved, in one query rather than one per
      // card.
      const savedIds = userId
        ? await discoveryRepo.bookmarkedIds(userId, 'community', ids)
        : new Set<number>();

      // Which of these the viewer belongs to. One query for the whole list —
      // the rails ask "my communities" of this same response rather than
      // calling isCommunityMember once per row.
      // The role comes back with the membership, not from a second pass:
      // the proposal policy needs it, and one query per row would turn the
      // directory into N queries.
      const viewerMemberRows = userId
        ? await db
            .select({ communityId: communityMembers.communityId, role: communityMembers.role, pinnedAt: communityMembers.pinnedAt })
            .from(communityMembers)
            .where(and(
              eq(communityMembers.userId, userId),
              inArray(communityMembers.communityId, ids),
            ))
        : [];
      const roleOf = new Map(viewerMemberRows.map((r) => [r.communityId, r.role ?? 'member']));
      const memberOf = new Set(viewerMemberRows.map((r) => r.communityId));
      const pinnedAt = new Map(viewerMemberRows.filter((r) => r.pinnedAt).map((r) => [r.communityId, r.pinnedAt]));
      // Only THIS viewer's pending state is exposed in the public directory.
      // Request messages and other applicants remain in the admin endpoint.
      const pendingRows = userId ? await db
        .select({ communityId: communityJoinRequests.communityId })
        .from(communityJoinRequests)
        .where(and(
          eq(communityJoinRequests.userId, userId),
          eq(communityJoinRequests.status, 'pending'),
          inArray(communityJoinRequests.communityId, ids),
        )) : [];
      const pendingIn = new Set(pendingRows.map((row) => row.communityId));
      const activeStatuses = new Set<string>(ACTIVE_PROPOSAL_STATES);
      const activeCounts = new Map<number, number>();
      for (const row of latestRows) {
        if (activeStatuses.has(row.status)) activeCounts.set(row.communityId, (activeCounts.get(row.communityId) ?? 0) + 1);
      }

      // Members-only content stays out of the public directory: the row is
      // listed (name, description, member count), but proposal teasers are
      // only shown to viewers who may read the community's content.
      const visibleContent = await visibleCommunityIdSet(ids, userId);

      const enriched = list.map((c) => ({
        ...c,
        memberCount: memberCounts.get(c.id) ?? 0,
        proposalCount: proposalCounts.get(c.id) ?? 0,
        savedByViewer: savedIds.has(c.id),
        viewerIsMember: memberOf.has(c.id),
        viewerRole: roleOf.get(c.id) ?? null,
        viewerPinnedAt: pinnedAt.get(c.id) ?? null,
        viewerJoinStatus: getCommunityJoinStatus({
          isMember: memberOf.has(c.id),
          hasPendingRequest: pendingIn.has(c.id),
          joinPolicy: c.joinPolicy,
        }),
        activeProposalCount: visibleContent.has(c.id) ? (activeCounts.get(c.id) ?? 0) : 0,
        // So the compose picker can leave out communities that would refuse
        // the proposal after it was written.
        viewerCanPropose: memberOf.has(c.id) && canSubmitProposal({
          policy: effectiveProposalPolicy(c as any),
          role: roleOf.get(c.id),
          isCreator: (c as any).creatorId === userId,
        }),
        contentHidden: !visibleContent.has(c.id),
        latestProposal: visibleContent.has(c.id) && latestByCommunity.get(c.id)
          ? {
              id: latestByCommunity.get(c.id)!.id,
              question: latestByCommunity.get(c.id)!.question,
              status: latestByCommunity.get(c.id)!.status,
              createdAt: latestByCommunity.get(c.id)!.createdAt,
            }
          : null,
        mostPopularProposal: visibleContent.has(c.id) ? (popularByCommunity.get(c.id) ?? null) : null,
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
      console.error('[create-community]', error);
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
      const canViewContent = await canViewCommunityContent(community, req.user?.id);
      const [members, proposals] = await Promise.all([
        communityRepo.getCommunityMembers(communityId),
        canViewContent ? proposalRepo.getProposals(communityId) : Promise.resolve([]),
      ]);
      const currentUserRole = req.user?.id
        ? await communityRepo.getCommunityMemberRole(communityId, req.user.id)
        : undefined;
      // Drafts are private to their author — keep them out of the shared view.
      const visibleProposals = proposals.filter(
        (p) => p.status !== 'draft' || p.authorId === req.user?.id,
      );
      const authorIds = Array.from(new Set(visibleProposals.map((proposal) => proposal.authorId)));
      const authorRows = authorIds.length ? await db.select({ id: users.id, name: users.name, username: users.username })
        .from(users).where(inArray(users.id, authorIds)) : [];
      const authorLabels = new Map(authorRows.map((author) => [author.id, author.name || `@${author.username}`]));
      const summary = buildCommunitySummary(community, visibleProposals, members.length, currentUserRole, req.user?.id);
      res.json({
        ...summary,
        proposals: summary.proposals.map((proposal) => ({ ...proposal, authorLabel: authorLabels.get(proposal.authorId) ?? proposal.authorLabel })),
        contentHidden: !canViewContent,
      });
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
      let communitySettings;
      try {
        communitySettings = sanitizeCommunityUpdateInput(req.body);
      } catch (validationError: any) {
        // A rejected setting is the caller's mistake, not a server fault.
        return res.status(400).json({ message: validationError?.message || "Invalid community settings" });
      }

      // Autonomous communities decide governable settings by liquid majority
      // vote. Direct admin edits to those keys are not allowed; only identity
      // and lifecycle fields (name, description, type) can be edited here.
      const existing = await communityRepo.getCommunity(communityId);
      if (!existing) return res.status(404).json({ message: "Community not found" });

      if (existing.type === 'autonomous') {
        const blocked = (Object.keys(communitySettings) as Array<keyof typeof communitySettings>)
          .filter((k) => isGovernableSettingKey(k));
        if (blocked.length > 0) {
          return res.status(409).json({
            message: "Autonomous communities decide these settings by member vote; use /setting-votes",
            blockedKeys: blocked,
          });
        }
        if (communitySettings.type && communitySettings.type !== existing.type && role !== 'founder') {
          return res.status(403).json({ message: "Only the founder can switch community type" });
        }
      }

      // A PATCH may carry only one half of a min/max pair, so the range has
      // to be judged against what the row will hold afterwards.
      try {
        assertCommunityRanges({ ...(existing as any), ...communitySettings });
      } catch (rangeError: any) {
        return res.status(400).json({ message: rangeError?.message || "Invalid setting range" });
      }

      const community = await communityRepo.updateCommunity(communityId, communitySettings);
      res.json(community);
    } catch (error) {
      res.status(500).json({ message: "Failed to update community" });
    }
  });

  // ─── Liquid setting votes (autonomous communities) ─────────────────────────

  app.get("/api/communities/:id/setting-votes", async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const userId = req.user?.id;
      const rows = await communityRepo.listAllSettingTallies(communityId, userId);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: "Failed to load setting votes" });
    }
  });

  app.put("/api/communities/:id/setting-votes/:settingKey", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const settingKey = req.params.settingKey;
      // Retired keys stay known (PATCH still blocks admin edits to them) but
      // are off the ballot, so no new vote may be cast on one.
      if (!isActiveGovernableSettingKey(settingKey)) {
        return res.status(400).json({ message: "Unknown setting key" });
      }
      const isMember = await communityRepo.isCommunityMember(communityId, req.user.id);
      if (!isMember) return res.status(403).json({ message: "Members only" });

      let canonical: string;
      try {
        canonical = parseGovernableSetting(settingKey, req.body?.value);
      } catch (err) {
        return res.status(400).json({ message: err instanceof Error ? err.message : 'Invalid value' });
      }

      await communityRepo.upsertSettingVote(communityId, settingKey, req.user.id, canonical);
      const winner = await communityRepo.recomputeAutonomousSetting(communityId, settingKey);
      const tally = await communityRepo.tallySettingVotes(communityId, settingKey);
      res.json({ yourVote: canonical, currentValue: winner, tally });
    } catch (error) {
      res.status(500).json({ message: "Failed to cast setting vote" });
    }
  });

  app.delete("/api/communities/:id/setting-votes/:settingKey", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const settingKey = req.params.settingKey;
      // Deliberately accepts retired keys too, so a vote cast before a setting
      // left the ballot can still be withdrawn.
      if (!isGovernableSettingKey(settingKey)) {
        return res.status(400).json({ message: "Unknown setting key" });
      }
      await communityRepo.removeSettingVote(communityId, settingKey, req.user.id);
      const winner = await communityRepo.recomputeAutonomousSetting(communityId, settingKey);
      const tally = await communityRepo.tallySettingVotes(communityId, settingKey);
      res.json({ yourVote: null, currentValue: winner, tally });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear setting vote" });
    }
  });
  app.get("/api/communities/:id/members", async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: "Community not found" });
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

      // Hidden member lists still expose officeholders: whoever holds power
      // in the community stays publicly accountable. Members see everyone.
      if (!isMemberListPublic(community)) {
        const viewerIsMember = !!req.user?.id && rows.some((r) => r.userId === req.user.id);
        if (!viewerIsMember) {
          return res.json({
            membersHidden: true,
            memberCount: rows.length,
            members: rows.filter((r) => r.role === 'founder' || r.role === 'admin'),
          });
        }
      }
      res.json({ membersHidden: false, memberCount: rows.length, members: rows });
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

      const removal = await activeRemoval(communityId, userId);
      if (removal) {
        return res.status(403).json({ message: cooldownMessage(removal), rejoinAfter: removal.rejoinAfter });
      }

      const policy = community.joinPolicy ?? 'open';

      if (policy === 'invite_only') {
        return res.status(403).json({ message: "This community is invite-only — ask an admin for an invitation" });
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

      // Verify ownership before changing state; an officer of one community
      // must not be able to decide another community's application by id.
      const [request] = await db.select({ id: communityJoinRequests.id })
        .from(communityJoinRequests)
        .where(and(eq(communityJoinRequests.id, requestId), eq(communityJoinRequests.communityId, communityId), eq(communityJoinRequests.status, 'pending')));
      if (!request) return res.status(404).json({ message: "Pending request not found" });
      if (decision === 'approved') {
        const [pending] = await db.select({ userId: communityJoinRequests.userId })
          .from(communityJoinRequests).where(eq(communityJoinRequests.id, requestId));
        const removal = pending ? await activeRemoval(communityId, pending.userId) : null;
        if (removal) {
          return res.status(409).json({ message: `This person was removed and can rejoin after ${removal.rejoinAfter.toISOString().slice(0, 10)}. Lift the removal in the members list first.` });
        }
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
  // ─── Invitations ───────────────────────────────────────────────────────────
  // The counterpart to joinPolicy 'invite_only', which by itself only turns
  // applicants away. Admins issue either a targeted invite (one named user, one
  // use, delivered as a notification) or a shareable link (redeemable up to
  // maxUses until it expires). Redemption works under any join policy — an
  // invitation is a decision the community already made.

  const INVITE_ROLES = ['member', 'admin'];
  const MAX_INVITE_DAYS = 365;

  /** Public view of an invite: never leaks the token to anyone but its holder. */
  const publicInvite = (invite: any, community: { id: number; name: string; description: string | null }) => ({
    token: invite.token,
    communityId: community.id,
    communityName: community.name,
    communityDescription: community.description,
    targeted: invite.invitedUserId != null,
    role: invite.role,
    message: invite.message,
    expiresAt: invite.expiresAt,
  });

  app.post("/api/communities/:id/invites", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      if (!Number.isFinite(communityId)) return res.status(400).json({ message: "Invalid community id" });

      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: "Community not found" });

      const callerRole = await communityRepo.getCommunityMemberRole(communityId, req.user.id);
      if (callerRole !== 'admin' && callerRole !== 'founder') {
        return res.status(403).json({ message: "Only admins or the founder can invite" });
      }

      const { username, role, maxUses, expiresInDays, message } = req.body as {
        username?: string; role?: string; maxUses?: number; expiresInDays?: number; message?: string;
      };

      const grantedRole = role ?? 'member';
      if (!INVITE_ROLES.includes(grantedRole)) {
        return res.status(400).json({ message: "Role must be 'member' or 'admin'" });
      }

      // A named recipient turns this into a targeted invite. Resolving by
      // username rather than exposing a user-search endpoint keeps the member
      // directory of other communities out of reach.
      let invitedUserId: number | null = null;
      if (typeof username === 'string' && username.trim()) {
        const handle = username.trim().replace(/^@/, '');
        const [target] = await db
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.username}) = lower(${handle})`);
        if (!target) return res.status(404).json({ message: "No user with that username" });

        if (await communityRepo.isCommunityMember(communityId, target.id)) {
          return res.status(409).json({ message: "That user is already a member" });
        }
        const removal = await activeRemoval(communityId, target.id);
        if (removal) {
          return res.status(409).json({ message: `This person was removed and can rejoin after ${removal.rejoinAfter.toISOString().slice(0, 10)}. Lift the removal in the members list first.` });
        }
        const outstanding = await communityRepo.getPendingInviteForUser(communityId, target.id);
        if (outstanding) {
          return res.status(409).json({ message: "That user already has a pending invitation" });
        }
        invitedUserId = target.id;
      }

      // Targeted invites are single-use by construction: they name one person.
      let uses = 1;
      if (invitedUserId === null) {
        const requested = Number(maxUses ?? 1);
        if (!Number.isInteger(requested) || (requested !== -1 && requested < 1)) {
          return res.status(400).json({ message: "maxUses must be -1 (unlimited) or a positive integer" });
        }
        uses = requested;
      }

      const days = expiresInDays === undefined || expiresInDays === null ? 14 : Number(expiresInDays);
      if (!Number.isInteger(days) || days < 1 || days > MAX_INVITE_DAYS) {
        return res.status(400).json({ message: `expiresInDays must be between 1 and ${MAX_INVITE_DAYS}` });
      }
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      const invite = await communityRepo.createInvite({
        communityId,
        createdByUserId: req.user.id,
        invitedUserId,
        role: grantedRole,
        maxUses: uses,
        message: typeof message === 'string' ? message.slice(0, 500) : null,
        expiresAt,
      });

      if (invitedUserId !== null) {
        const { createNotification } = await import('../utils/notifications');
        await createNotification({
          userId: invitedUserId,
          type: 'community_invite',
          title: `Πρόσκληση στην κοινότητα «${community.name}»`,
          message: invite.message || `Ο/Η ${req.user.name || req.user.username} σε προσκαλεί να γίνεις μέλος.`,
          communityId,
          actionUrl: `/invite/${invite.token}`,
        });
      }

      res.status(201).json(invite);
    } catch (error) {
      res.status(500).json({ message: "Failed to create invitation" });
    }
  });

  app.get("/api/communities/:id/invites", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const callerRole = await communityRepo.getCommunityMemberRole(communityId, req.user.id);
      if (callerRole !== 'admin' && callerRole !== 'founder') {
        return res.status(403).json({ message: "Not authorized" });
      }

      const invites = await communityRepo.listPendingInvites(communityId);
      if (invites.length === 0) return res.json([]);

      const targetIds = Array.from(new Set(invites.map(i => i.invitedUserId).filter((id): id is number => id != null)));
      const userById = new Map<number, { id: number; username: string; name: string | null; profilePicture: string | null }>();
      if (targetIds.length > 0) {
        const rows = await db
          .select({ id: users.id, username: users.username, name: users.name, profilePicture: users.profilePicture })
          .from(users)
          .where(inArray(users.id, targetIds));
        rows.forEach(u => userById.set(u.id, u));
      }

      res.json(invites.map(i => ({
        ...i,
        invitedUser: i.invitedUserId != null ? (userById.get(i.invitedUserId) ?? null) : null,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  app.delete("/api/communities/:id/invites/:inviteId", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const inviteId = parseInt(req.params.inviteId);
      if (!Number.isFinite(communityId) || !Number.isFinite(inviteId)) {
        return res.status(400).json({ message: "Invalid community or invitation id" });
      }
      const callerRole = await communityRepo.getCommunityMemberRole(communityId, req.user.id);
      if (callerRole !== 'admin' && callerRole !== 'founder') {
        return res.status(403).json({ message: "Not authorized" });
      }
      const revoked = await communityRepo.revokeInvite(inviteId, communityId);
      if (!revoked) return res.status(404).json({ message: "Pending invitation not found" });
      res.json(revoked);
    } catch (error) {
      res.status(500).json({ message: "Failed to revoke invitation" });
    }
  });

  // Lets the community page offer an "accept" button to someone who was invited
  // but never opened the link — the notification is easy to miss.
  app.get("/api/communities/:id/my-invite", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      if (!Number.isFinite(communityId)) return res.status(400).json({ message: "Invalid community id" });
      if (await communityRepo.isCommunityMember(communityId, req.user.id)) return res.json(null);
      const invite = await communityRepo.getPendingInviteForUser(communityId, req.user.id);
      res.json(invite ? { token: invite.token, role: invite.role, message: invite.message, expiresAt: invite.expiresAt } : null);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invitation" });
    }
  });

  // Unauthenticated on purpose: someone following a link needs to see what they
  // are being invited to before deciding to sign in.
  app.get("/api/invites/:token", async (req: any, res) => {
    try {
      const invite = await communityRepo.getInviteByToken(req.params.token);
      if (!invite) return res.status(404).json({ message: "Invitation not found" });

      const community = await communityRepo.getCommunity(invite.communityId);
      if (!community) return res.status(404).json({ message: "Community not found" });

      const expired = invite.expiresAt != null && invite.expiresAt.getTime() <= Date.now();
      const exhausted = invite.maxUses !== -1 && invite.useCount >= invite.maxUses;
      const reason = invite.status === 'revoked' ? 'revoked'
        : expired ? 'expired'
        : (invite.status !== 'pending' || exhausted) ? 'used'
        : null;

      // A targeted invite must not reveal that it is addressed to someone else
      // beyond the fact itself, so the mismatch is reported only to a signed-in
      // caller who is not the recipient.
      const mismatched = invite.invitedUserId != null && req.user != null && req.user.id !== invite.invitedUserId;

      res.json({
        ...publicInvite(invite, community),
        valid: reason === null && !mismatched,
        reason: mismatched ? 'not_for_you' : reason,
        alreadyMember: req.user != null && await communityRepo.isCommunityMember(community.id, req.user.id),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invitation" });
    }
  });

  app.post("/api/invites/:token/accept", requireAuth, async (req: any, res) => {
    try {
      const preview = await communityRepo.getInviteByToken(req.params.token);
      if (!preview) return res.status(404).json({ message: "Invitation not found" });

      if (await communityRepo.isCommunityMember(preview.communityId, req.user.id)) {
        return res.status(409).json({ message: "Already a member" });
      }

      // Checked before redeeming so a removed member does not spend the token.
      const removal = await activeRemoval(preview.communityId, req.user.id);
      if (removal) {
        return res.status(403).json({ message: cooldownMessage(removal), rejoinAfter: removal.rejoinAfter });
      }

      // Single atomic gate — see redeemInvite. Anything that makes the token
      // unusable (revoked, expired, exhausted, addressed to someone else) comes
      // back as undefined rather than a row we would have to re-check.
      const invite = await communityRepo.redeemInvite(req.params.token, req.user.id);
      if (!invite) {
        return res.status(410).json({ message: "This invitation is no longer valid" });
      }

      try {
        await communityRepo.addCommunityMember(invite.communityId, req.user.id, invite.role);
      } catch (err) {
        // Unique index on (community, user): another request added them between
        // our membership check and here. Membership is the goal, so treat it as
        // success rather than stranding a spent invite.
        if (!await communityRepo.isCommunityMember(invite.communityId, req.user.id)) throw err;
      }

      res.status(201).json({ communityId: invite.communityId, role: invite.role });
    } catch (error) {
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  app.delete("/api/communities/:id/members", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const userId = req.user!.id;
      // Founders can't leave — the community would be orphaned. They must
      // transfer or delete the community instead.
      const role = await communityRepo.getCommunityMemberRole(communityId, userId);
      if (role === 'founder') {
        return res.status(409).json({ message: "Founders cannot leave their community" });
      }
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
  // ─── Member removal (shared/member-removal.ts) ──────────────────────────
  // Managed: admins remove directly. Autonomous: members vote, ⅔ of votes
  // cast. A reason is always required and every member can read the log.

  const readReason = (body: any): string | null => {
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    return reason.length >= REMOVAL_REASON_MIN && reason.length <= REMOVAL_REASON_MAX ? reason : null;
  };
  const removalFailure = (res: Response, error: unknown, fallback: string) => {
    if (error instanceof RemovalError) return res.status(error.status).json({ message: error.message });
    console.error(`[removal] ${fallback}:`, error);
    return res.status(500).json({ message: fallback });
  };

  app.get("/api/communities/:id/removals", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      if (!await communityRepo.isCommunityMember(communityId, req.user.id)) {
        return res.status(403).json({ message: "Only members can see this" });
      }
      res.json(await removalOverview(communityId, req.user.id));
    } catch (error) {
      removalFailure(res, error, "Failed to fetch removals");
    }
  });

  app.post("/api/communities/:id/members/:userId/remove", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const targetUserId = parseInt(req.params.userId);
      if (!Number.isFinite(communityId) || !Number.isFinite(targetUserId)) {
        return res.status(400).json({ message: "Invalid community or user id" });
      }
      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: "Community not found" });
      if (removalModeFor(community.type) !== 'admin') {
        return res.status(409).json({ message: "In this community members are removed by a vote of the members" });
      }
      if (targetUserId === req.user.id) {
        return res.status(409).json({ message: "Use 'Leave community' to leave" });
      }
      const reason = readReason(req.body);
      if (!reason) {
        return res.status(400).json({ message: `Give a reason (${REMOVAL_REASON_MIN}–${REMOVAL_REASON_MAX} characters)` });
      }
      const [actorRole, targetRole] = await Promise.all([
        communityRepo.getCommunityMemberRole(communityId, req.user.id),
        communityRepo.getCommunityMemberRole(communityId, targetUserId),
      ]);
      const blocker = directRemovalBlocker(actorRole, targetRole);
      if (blocker) {
        const messages: Record<string, [number, string]> = {
          not_member: [404, "This person is not a member"],
          founder: [409, "The founder cannot be removed"],
          not_admin: [403, "Only admins or the founder can remove members"],
          admin_needs_founder: [403, "Only the founder can remove an admin"],
        };
        const [status, message] = messages[blocker];
        return res.status(status).json({ message });
      }
      const removal = await removeMember({ communityId, userId: targetUserId, reason, removedByUserId: req.user.id });
      await logAdminAction(req.user.id, communityId, 'manage_membership', targetUserId, {
        action: 'remove', reason, removalId: removal.id, rejoinAfter: removal.rejoinAfter,
      }).catch(() => {});
      res.json({ success: true, rejoinAfter: removal.rejoinAfter });
    } catch (error) {
      removalFailure(res, error, "Failed to remove member");
    }
  });

  app.post("/api/communities/:id/removals/:removalId/lift", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const removalId = parseInt(req.params.removalId);
      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: "Community not found" });
      if (removalModeFor(community.type) !== 'admin') {
        return res.status(409).json({ message: "In this community the waiting period simply runs out" });
      }
      const role = await communityRepo.getCommunityMemberRole(communityId, req.user.id);
      if (role !== 'admin' && role !== 'founder') {
        return res.status(403).json({ message: "Only admins or the founder can do this" });
      }
      if (!await liftRemoval(communityId, removalId, req.user.id)) {
        return res.status(404).json({ message: "Removal not found" });
      }
      await logAdminAction(req.user.id, communityId, 'manage_membership', null, { action: 'lift_removal', removalId }).catch(() => {});
      res.json({ success: true });
    } catch (error) {
      removalFailure(res, error, "Failed to lift removal");
    }
  });

  app.post("/api/communities/:id/removal-votes", requireAuth, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const targetUserId = Number(req.body?.userId);
      if (!Number.isFinite(communityId) || !Number.isInteger(targetUserId)) {
        return res.status(400).json({ message: "Invalid community or user id" });
      }
      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: "Community not found" });
      if (removalModeFor(community.type) !== 'vote') {
        return res.status(409).json({ message: "In this community the admins decide on removals" });
      }
      if (targetUserId === req.user.id) {
        return res.status(409).json({ message: "Use 'Leave community' to leave" });
      }
      const reason = readReason(req.body);
      if (!reason) {
        return res.status(400).json({ message: `Give a reason (${REMOVAL_REASON_MIN}–${REMOVAL_REASON_MAX} characters)` });
      }
      const [actorRole, targetRole] = await Promise.all([
        communityRepo.getCommunityMemberRole(communityId, req.user.id),
        communityRepo.getCommunityMemberRole(communityId, targetUserId),
      ]);
      if (!actorRole) return res.status(403).json({ message: "Only members can start a removal vote" });
      if (!targetRole) return res.status(404).json({ message: "This person is not a member" });
      if (targetRole === 'founder') return res.status(409).json({ message: "The founder cannot be removed" });
      const vote = await openRemovalVote({ communityId, targetUserId, openedByUserId: req.user.id, reason });
      res.status(201).json({ id: vote.id });
    } catch (error) {
      removalFailure(res, error, "Failed to start removal vote");
    }
  });

  /** The vote, checked to belong to the community in the URL. */
  const loadVote = async (req: any) => {
    const vote = await getRemovalVote(parseInt(req.params.voteId));
    if (!vote || vote.communityId !== parseInt(req.params.id)) throw new RemovalError(404, "Vote not found");
    return vote;
  };

  app.post("/api/communities/:id/removal-votes/:voteId/ballot", requireAuth, async (req: any, res) => {
    try {
      const choice = req.body?.choice;
      if (!isRemovalChoice(choice)) return res.status(400).json({ message: "Choice must be 'yes' or 'no'" });
      const vote = await loadVote(req);
      await castRemovalBallot(vote, req.user.id, choice);
      res.json({ success: true });
    } catch (error) {
      removalFailure(res, error, "Failed to record vote");
    }
  });

  app.put("/api/communities/:id/removal-votes/:voteId/response", requireAuth, async (req: any, res) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (text.length > REMOVAL_RESPONSE_MAX) {
        return res.status(400).json({ message: `Keep it under ${REMOVAL_RESPONSE_MAX} characters` });
      }
      const vote = await loadVote(req);
      await setRemovalResponse(vote, req.user.id, text);
      res.json({ success: true });
    } catch (error) {
      removalFailure(res, error, "Failed to save response");
    }
  });

  app.delete("/api/communities/:id/removal-votes/:voteId", requireAuth, async (req: any, res) => {
    try {
      const vote = await loadVote(req);
      await cancelRemovalVote(vote, req.user.id);
      res.json({ success: true });
    } catch (error) {
      removalFailure(res, error, "Failed to withdraw vote");
    }
  });

  // ─── Proposal Routes ────────────────────────────────────────────
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
