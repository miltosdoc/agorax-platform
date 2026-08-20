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
import { sanitizeCommunityCreateInput, sanitizeCommunityUpdateInput, assertCommunityRanges } from '@shared/community-settings';
import { buildCommunitySummary } from '@shared/community-summary';
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

      // Members-only content stays out of the public directory: the row is
      // listed (name, description, member count), but proposal teasers are
      // only shown to viewers who may read the community's content.
      const visibleContent = await visibleCommunityIdSet(ids, userId);

      const enriched = list.map((c) => ({
        ...c,
        memberCount: memberCounts.get(c.id) ?? 0,
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
      res.json({
        ...buildCommunitySummary(community, visibleProposals, members.length, currentUserRole),
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