/**
 * LiveKit Router — community conferences + sortition deliberation rooms.
 *
 * Endpoints:
 *   GET    /api/livekit/config                            — config probe (client uses this to know if video is on)
 *   GET    /api/communities/:id/rooms                     — open community rooms
 *   POST   /api/communities/:id/rooms                     — schedule a community room (admin/founder only)
 *   GET    /api/sortition/:bodyId/room                    — get-or-null the body's room
 *   POST   /api/sortition/:bodyId/room                    — get-or-create the body's room (sortition member only)
 *   POST   /api/livekit/rooms/:id/token                   — issue a join token (gated per kind)
 *   GET    /api/livekit/rooms/:id/presence                — who is in there right now (count only)
 *   PATCH  /api/livekit/rooms/:id                         — toggle recording / close (host-only)
 *
 * Access gates:
 *   • community room — must be a member of `communityId` to join; any member
 *     can schedule one.
 *   • sortition room — must be a member of `sortitionBodyId` to join.
 *
 * Managing a room (edit, close, moderate in the SFU) goes through the single
 * canManageRoom predicate: the organiser who called it, the community's
 * founder/admins, or a platform admin — and for sortition rooms, the author
 * of the proposal the body was drawn for.
 */

import type { Express } from 'express';
import { randomBytes } from 'crypto';
import { livekitRepo, communityRepo, sortitionRepo, proposalRepo } from '../storage';
import { db } from '../db';
import { communities, sortitionMembers, sortitionBodies, proposals } from '../../shared/schema';
import { and, eq } from 'drizzle-orm';
import { requireAuth } from '../auth';
import {
  isLivekitConfigured,
  issueJoinToken,
  deleteRoom,
  publicLivekitUrl,
  listParticipantIdentities,
  ensureRoom,
  roomCapacity,
  LivekitUnavailableError,
} from '../utils/livekit-client';
import {
  notifyConferenceScheduled,
  notifyRoomOpened,
  buildIcs,
} from '../utils/conference-notify';
import { canViewCommunityContentById } from '../utils/community-visibility';
import { logger } from '../utils/logger';

/**
 * How early a non-organiser's join promotes a scheduled meeting to live.
 * Matches the reminder window in job-handlers, so the meeting turns "live"
 * around the same time members are told it's about to start.
 */
const EARLY_START_WINDOW_MS = 15 * 60_000;

function unavailable(res: any): void {
  res.status(503).json({
    code: 'livekit_unavailable',
    message: 'Video conferencing is not configured on this instance.',
  });
}

/**
 * Quick "is this user the founder or an admin of this community?" check
 * that mirrors how the proposal router gates other admin actions.
 */
async function isCommunityHost(communityId: number, userId: number, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const [c] = await db.select({
    creatorId: communities.creatorId,
    adminIds: communities.adminIds,
  }).from(communities).where(eq(communities.id, communityId));
  if (!c) return false;
  if (c.creatorId === userId) return true;
  const adminIds = Array.isArray(c.adminIds) ? c.adminIds as number[] : [];
  return adminIds.includes(userId);
}

/**
 * Who may manage a room: end it for everyone, edit its details, and hold
 * moderator rights inside the SFU.
 *
 * Whoever called the meeting counts, alongside the community's founder/admins
 * and platform admins. Three call sites used to disagree — PATCH accepted the
 * organiser, while the room page's "end for all" button and the LiveKit
 * moderator grant recognised only founders. A member who called a meeting
 * could therefore not end their own call from anywhere in the UI.
 */
async function canManageRoom(
  room: { kind: string; communityId: number; sortitionBodyId: number | null; createdById: number },
  userId: number,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  if (room.createdById === userId) return true;
  if (room.kind === 'community') {
    return await isCommunityHost(room.communityId, userId, isAdmin);
  }
  // Sortition rooms answer to the proposal the body was drawn for.
  if (room.sortitionBodyId) {
    const [body] = await db
      .select({ proposalId: sortitionBodies.proposalId })
      .from(sortitionBodies)
      .where(eq(sortitionBodies.id, room.sortitionBodyId));
    if (body?.proposalId) {
      const proposal = await proposalRepo.getProposal(body.proposalId);
      return proposal?.authorId === userId;
    }
  }
  return false;
}

async function isSortitionMember(bodyId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: sortitionMembers.id })
    .from(sortitionMembers)
    .where(and(eq(sortitionMembers.bodyId, bodyId), eq(sortitionMembers.userId, userId)));
  return !!row;
}

function newRoomName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

export function registerLivekitRoutes(app: Express): void {

  // ── My-rooms — what the logged-in user can currently join ───────────
  app.get('/api/livekit/my-rooms', requireAuth, async (req: any, res) => {
    try {
      const rooms = await livekitRepo.listJoinableForUser(req.user.id);
      res.json(rooms);
    } catch (err: any) {
      logger.error('list my rooms failed', { err: err?.message });
      res.status(500).json({ message: 'failed to list rooms' });
    }
  });

  // ── Public config probe — client uses this to render the room UI ──────
  app.get('/api/livekit/config', (req, res) => {
    if (!isLivekitConfigured()) {
      return res.json({ available: false });
    }
    res.json({ available: true, url: publicLivekitUrl(req.get('host')) });
  });

  // ── Community rooms ──────────────────────────────────────────────────

  app.get('/api/communities/:id/rooms', async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id, 10);
      if (!Number.isFinite(communityId)) return res.status(400).json({ message: 'invalid community id' });
      // Rooms are community content — members-only communities keep them
      // (and their titles/schedules) off the public surface.
      if (!(await canViewCommunityContentById(communityId, req.user?.id))) {
        return res.status(403).json({ message: 'Members only', contentHidden: true });
      }
      const rooms = await livekitRepo.listOpenForCommunity(communityId);
      res.json(rooms);
    } catch (err: any) {
      logger.error('list community rooms failed', { err: err?.message });
      res.status(500).json({ message: 'failed to list rooms' });
    }
  });

  // ── Past calls: closed community rooms with duration + participants ─
  app.get('/api/communities/:id/rooms/history', async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id, 10);
      if (!Number.isFinite(communityId)) return res.status(400).json({ message: 'invalid community id' });
      // History carries participants' real names + join/leave times — gate
      // it like every other piece of community content.
      if (!(await canViewCommunityContentById(communityId, req.user?.id))) {
        return res.status(403).json({ message: 'Members only', contentHidden: true });
      }
      const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? '10', 10) || 10));
      const history = await livekitRepo.listHistoryForCommunity(communityId, limit);
      res.json(history);
    } catch (err: any) {
      logger.error('list community history failed', { err: err?.message });
      res.status(500).json({ message: 'failed to list call history' });
    }
  });

  // ── Single room — powers the dedicated /conference/:id page ──────────
  app.get('/api/livekit/rooms/:id', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: 'invalid room id' });
      const room = await livekitRepo.getById(id);
      if (!room) return res.status(404).json({ message: 'room not found' });

      const userId: number = req.user.id;
      const isAdmin = !!req.user.isAdmin;
      let allowed: boolean;
      if (room.kind === 'community') {
        allowed = isAdmin
          || (await canViewCommunityContentById(room.communityId, userId));
      } else {
        allowed = isAdmin
          || (!!room.sortitionBodyId && await isSortitionMember(room.sortitionBodyId, userId));
      }
      if (!allowed) return res.status(403).json({ message: 'not allowed', contentHidden: true });

      const isMember = room.kind === 'community'
        ? (isAdmin || await communityRepo.isCommunityMember(room.communityId, userId))
        : allowed;
      // Drives the "end for all" button. Same predicate as PATCH and the SFU
      // moderator grant, so what the button offers is what the server accepts.
      const isHost = await canManageRoom(room, userId, isAdmin);
      const [community] = await db
        .select({ name: communities.name })
        .from(communities)
        .where(eq(communities.id, room.communityId));
      res.json({
        ...room,
        communityName: community?.name ?? null,
        canJoin: isMember && room.status !== 'closed',
        isHost,
        capacity: roomCapacity(),
      });
    } catch (err: any) {
      logger.error('get livekit room failed', { err: err?.message });
      res.status(500).json({ message: 'failed to load room' });
    }
  });

  // ── Leave beacon — accepts a navigator.sendBeacon payload ────────────
  // sendBeacon ignores the response, so we keep the body small and the
  // logic forgiving; auth is best-effort, anonymous leaves are a no-op.
  app.post('/api/livekit/rooms/:id/leave', async (req: any, res) => {
    try {
      const roomId = parseInt(req.params.id, 10);
      if (!Number.isFinite(roomId)) return res.status(204).end();
      const userId: number | undefined = req.user?.id;
      if (!userId) return res.status(204).end();
      await livekitRepo.recordLeave(roomId, userId);
      res.status(204).end();
    } catch (err: any) {
      logger.warn('leave beacon failed', { err: err?.message });
      res.status(204).end();
    }
  });

  app.post('/api/communities/:id/rooms', requireAuth, async (req: any, res) => {
    try {
      if (!isLivekitConfigured()) return unavailable(res);
      const communityId = parseInt(req.params.id, 10);
      if (!Number.isFinite(communityId)) return res.status(400).json({ message: 'invalid community id' });
      const userId: number = req.user.id;
      const isAdmin = !!req.user.isAdmin;
      // Any member can start a conference — calling a meeting is a normal
      // act of community life, not an admin privilege. Admins retain the
      // power to end any call; creators can end their own.
      const isMember = await communityRepo.isCommunityMember(communityId, userId);
      if (!isMember && !(await isCommunityHost(communityId, userId, isAdmin))) {
        return res.status(403).json({ message: 'only community members can start conferences' });
      }
      const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim() : null;
      if (!title) return res.status(400).json({ message: 'title is required' });
      const scheduledAtRaw = req.body?.scheduledAt;
      const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
      // An unparseable date would reach the driver as Invalid Date and blow
      // up mid-insert; reject it up front instead.
      if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
        return res.status(400).json({ message: 'invalid scheduledAt' });
      }
      const recordingEnabled = !!req.body?.recordingEnabled;
      // Agenda / links. Plain text — never rendered as HTML (see the client's
      // LinkedText), so no markup stripping is needed here.
      const descriptionRaw = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
      const description = descriptionRaw ? descriptionRaw.slice(0, 2000) : null;

      const room = await livekitRepo.create({
        roomName: newRoomName(`c${communityId}`),
        kind: 'community',
        title: title.slice(0, 200),
        description,
        communityId,
        sortitionBodyId: null,
        createdById: userId,
        scheduledAt,
        status: scheduledAt && scheduledAt.getTime() > Date.now() ? 'scheduled' : 'active',
        recordingEnabled,
        recordingPath: null,
      } as any);

      // Fan out an in-app notification to every other member of the
      // community. Failure here doesn't block the response.
      void notifyConferenceScheduled({
        roomId: room.id,
        communityId,
        title: room.title,
        scheduledAt,
        actionUrl: `/conference/${room.id}`,
      }, userId, room.status === 'scheduled' ? 'conference_scheduled' : 'conference_starting');

      res.status(201).json(room);
    } catch (err: any) {
      logger.error('create community room failed', { err: err?.message });
      res.status(500).json({ message: 'failed to create room' });
    }
  });

  // ── Sortition rooms ──────────────────────────────────────────────────

  app.get('/api/sortition/:bodyId/room', requireAuth, async (req: any, res) => {
    try {
      const bodyId = parseInt(req.params.bodyId, 10);
      if (!Number.isFinite(bodyId)) return res.status(400).json({ message: 'invalid body id' });
      const userId: number = req.user.id;
      const isAdmin = !!req.user.isAdmin;
      const isMember = await isSortitionMember(bodyId, userId);
      if (!isMember && !isAdmin) return res.status(403).json({ message: 'not a member of this body' });
      const room = await livekitRepo.getForSortitionBody(bodyId);
      res.json(room ?? null);
    } catch (err: any) {
      logger.error('get sortition room failed', { err: err?.message });
      res.status(500).json({ message: 'failed to look up room' });
    }
  });

  app.post('/api/sortition/:bodyId/room', requireAuth, async (req: any, res) => {
    try {
      if (!isLivekitConfigured()) return unavailable(res);
      const bodyId = parseInt(req.params.bodyId, 10);
      if (!Number.isFinite(bodyId)) return res.status(400).json({ message: 'invalid body id' });
      const userId: number = req.user.id;
      const isAdmin = !!req.user.isAdmin;
      const isMember = await isSortitionMember(bodyId, userId);
      if (!isMember && !isAdmin) return res.status(403).json({ message: 'not a member of this body' });

      // Idempotent: same body always resolves to the same row.
      const existing = await livekitRepo.getForSortitionBody(bodyId);
      if (existing) return res.json(existing);

      const [body] = await db.select().from(sortitionBodies).where(eq(sortitionBodies.id, bodyId));
      if (!body) return res.status(404).json({ message: 'sortition body not found' });

      let title = 'Σύσκεψη κληρωτού σώματος';
      if (body.proposalId) {
        const proposal = await proposalRepo.getProposal(body.proposalId);
        if (proposal) title = `Σύσκεψη: ${proposal.question.slice(0, 160)}`;
      }

      const room = await livekitRepo.create({
        roomName: newRoomName(`s${bodyId}`),
        kind: 'sortition',
        title,
        communityId: body.communityId,
        sortitionBodyId: bodyId,
        createdById: userId,
        scheduledAt: null,
        status: 'active',
        recordingEnabled: false,
        recordingPath: null,
      } as any);

      // Fan out to every other body member.
      void notifyRoomOpened({
        roomId: room.id,
        communityId: body.communityId,
        sortitionBodyId: bodyId,
        title: room.title,
        actionUrl: `/sortition/body/${bodyId}`,
      }, userId);

      res.status(201).json(room);
    } catch (err: any) {
      logger.error('create sortition room failed', { err: err?.message });
      res.status(500).json({ message: 'failed to create room' });
    }
  });

  // ── Issue join token ─────────────────────────────────────────────────

  app.post('/api/livekit/rooms/:id/token', requireAuth, async (req: any, res) => {
    try {
      if (!isLivekitConfigured()) return unavailable(res);
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: 'invalid room id' });
      const room = await livekitRepo.getById(id);
      if (!room) return res.status(404).json({ message: 'room not found' });
      if (room.status === 'closed') return res.status(410).json({ message: 'room is closed' });

      const userId: number = req.user.id;
      const isAdmin = !!req.user.isAdmin;

      let allowed = false;
      if (room.kind === 'community') {
        allowed = await communityRepo.isCommunityMember(room.communityId, userId) || isAdmin;
      } else {
        if (!room.sortitionBodyId) return res.status(500).json({ message: 'malformed sortition room' });
        allowed = await isSortitionMember(room.sortitionBodyId, userId) || isAdmin;
      }
      if (!allowed) return res.status(403).json({ message: 'not allowed in this room' });

      // Moderator rights in the SFU (mute, remove) go to whoever can end the
      // call — the same predicate, so the two can't drift apart again.
      const isHost = await canManageRoom(room, userId, isAdmin);

      // First join flips a 'scheduled' room into 'active' — but only once the
      // meeting is actually near. A member who opened Thursday's link on
      // Monday and clicked join used to relabel it "live now" for the whole
      // community and drop it out of the scheduled list. They still get in
      // (checking your camera early is fair); the announcement just survives.
      // The organiser can always start early — that's a decision, not a slip.
      if (room.status === 'scheduled') {
        const startsAt = room.scheduledAt ? new Date(room.scheduledAt).getTime() : 0;
        if (isHost || Date.now() >= startsAt - EARLY_START_WINDOW_MS) {
          await livekitRepo.setStatus(room.id, 'active');
        }
      }

      // Capacity. Enforced here so a member who cannot get in is told why and
      // by how much, rather than meeting an opaque WebSocket error — and
      // re-checked by the SFU itself via ensureRoom(), for the race where two
      // people clear this check in the same instant.
      //
      // Fails open: if the SFU cannot be reached for a count, that is a reason
      // to let someone into their own meeting, not to keep them out.
      const identity = `user-${userId}`;
      const capacity = roomCapacity();
      try {
        await ensureRoom(room.roomName, capacity);
        const present = await listParticipantIdentities(room.roomName);
        // A refresh or a second tab must not lock someone out of a room they
        // are already counted in.
        if (present.length >= capacity && !present.includes(identity)) {
          return res.status(409).json({
            code: 'room_full',
            capacity,
            message: `room is full (${capacity})`,
          });
        }
      } catch (capErr: any) {
        logger.warn('livekit capacity check failed', { roomId: room.id, err: capErr?.message });
      }

      const displayName = (req.user.name || req.user.username || `user-${userId}`).toString();
      const token = await issueJoinToken({
        roomName: room.roomName,
        identity,
        name: displayName,
        isAdmin: isHost,
      });
      // Best-effort participation log. A failure here must not block the
      // join — the user is allowed into the room either way.
      let participationId: number | null = null;
      try {
        participationId = await livekitRepo.recordJoin(room.id, userId);
      } catch (logErr: any) {
        logger.warn('participation record failed', { roomId: room.id, err: logErr?.message });
      }
      const host = req.get('host') ?? '';
      const scheme = (host.startsWith('localhost') || host.startsWith('127.')) ? 'ws' : 'wss';
      const turnUrl = `${scheme}://${host}/turn`;
      res.json({ token, url: publicLivekitUrl(host), roomName: room.roomName, isHost, participationId, turnUrl, capacity });
    } catch (err: any) {
      if (err instanceof LivekitUnavailableError) return unavailable(res);
      logger.error('issue livekit token failed', { err: err?.message });
      res.status(500).json({ message: 'failed to issue join token' });
    }
  });

  // ── Who is in the room right now ─────────────────────────────────────
  // The lobby polls this so "is anyone there yet?" has an answer before you
  // switch your camera on. Count only — the names of the people already
  // talking are for the people already in the room.
  app.get('/api/livekit/rooms/:id/presence', requireAuth, async (req: any, res) => {
    try {
      if (!isLivekitConfigured()) return unavailable(res);
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: 'invalid room id' });
      const room = await livekitRepo.getById(id);
      if (!room) return res.status(404).json({ message: 'room not found' });

      const userId: number = req.user.id;
      const isAdmin = !!req.user.isAdmin;
      const allowed = room.kind === 'community'
        ? (isAdmin || await communityRepo.isCommunityMember(room.communityId, userId))
        : (isAdmin || (!!room.sortitionBodyId && await isSortitionMember(room.sortitionBodyId, userId)));
      if (!allowed) return res.status(403).json({ message: 'not allowed in this room' });

      const capacity = roomCapacity();
      try {
        const present = await listParticipantIdentities(room.roomName);
        res.json({ count: present.length, capacity });
      } catch (probeErr: any) {
        // Not knowing the count is not an error worth showing anyone.
        logger.warn('livekit presence probe failed', { roomId: room.id, err: probeErr?.message });
        res.json({ count: null, capacity });
      }
    } catch (err: any) {
      if (err instanceof LivekitUnavailableError) return unavailable(res);
      logger.error('livekit presence failed', { err: err?.message });
      res.status(500).json({ message: 'failed to read presence' });
    }
  });

  // ── iCalendar download — adds the conference to the user's calendar ─
  // No auth gate for PUBLIC communities: the URL is short-lived and calendar
  // apps fetch without cookies. Members-only communities keep even the room
  // title private, so those 403 for viewers who can't read the content.
  app.get('/api/livekit/rooms/:id/ics', async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).send('invalid room id');
      const room = await livekitRepo.getById(id);
      if (!room) return res.status(404).send('not found');
      // Mirror the room-view gate: content visibility, or the bypasses the
      // conference page itself grants (platform admin, sortition-body member).
      let icsAllowed = await canViewCommunityContentById(room.communityId, req.user?.id);
      if (!icsAllowed && req.user?.isAdmin) icsAllowed = true;
      if (!icsAllowed && room.kind === 'sortition' && room.sortitionBodyId && req.user?.id) {
        icsAllowed = await isSortitionMember(room.sortitionBodyId, req.user.id);
      }
      if (!icsAllowed) return res.status(403).send('members only');
      const host = req.get('host') ?? 'agorax';
      const proto = (req.headers['x-forwarded-proto'] as string | undefined) || req.protocol;
      const landingUrl = room.kind === 'sortition' && room.sortitionBodyId
        ? `${proto}://${host}/sortition/body/${room.sortitionBodyId}`
        : `${proto}://${host}/conference/${room.id}`;
      const start = room.scheduledAt ?? room.createdAt;
      const ics = buildIcs({
        uid: `agorax-room-${room.id}@${host}`,
        title: room.title,
        // The organiser's own agenda if they wrote one — that's what people
        // want in the calendar entry — otherwise the generic label.
        description: room.description?.trim()
          || (room.kind === 'sortition'
            ? 'Σύσκεψη κληρωτού σώματος στο AgoraX'
            : 'Συνάντηση κοινότητας στο AgoraX'),
        url: landingUrl,
        start: start ? new Date(start) : new Date(),
        durationMinutes: 60,
      });
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="agorax-room-${room.id}.ics"`);
      res.send(ics);
    } catch (err: any) {
      logger.error('ics generation failed', { err: err?.message });
      res.status(500).send('failed to build calendar entry');
    }
  });

  // ── Patch: host can toggle recording or close the room ───────────────

  app.patch('/api/livekit/rooms/:id', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: 'invalid room id' });
      const room = await livekitRepo.getById(id);
      if (!room) return res.status(404).json({ message: 'room not found' });

      const userId: number = req.user.id;
      const isAdmin = !!req.user.isAdmin;
      const isHost = await canManageRoom(room, userId, isAdmin);
      if (!isHost) return res.status(403).json({ message: 'host only' });

      const body = req.body ?? {};
      let updated = room;

      // ── Organiser edits: title / agenda / time ──────────────────────
      // Until now a typo or a moved meeting could only be fixed by closing
      // the room and creating another, which re-notified the whole community.
      const edits: { title?: string; description?: string | null; scheduledAt?: Date | null } = {};
      if (typeof body.title === 'string') {
        const trimmed = body.title.trim();
        if (!trimmed) return res.status(400).json({ message: 'title cannot be empty' });
        edits.title = trimmed.slice(0, 200);
      }
      if (typeof body.description === 'string') {
        const trimmed = body.description.trim();
        edits.description = trimmed ? trimmed.slice(0, 2000) : null;
      } else if (body.description === null) {
        edits.description = null;
      }
      let dateMoved = false;
      if (body.scheduledAt !== undefined) {
        // Rescheduling only makes sense while the meeting hasn't started.
        // Once it's live or closed the time is history, not a plan.
        if (room.status !== 'scheduled') {
          return res.status(409).json({ message: 'cannot reschedule a meeting that has already started' });
        }
        if (body.scheduledAt === null) {
          return res.status(400).json({ message: 'scheduledAt cannot be cleared' });
        }
        const when = new Date(body.scheduledAt);
        if (Number.isNaN(when.getTime())) {
          return res.status(400).json({ message: 'invalid scheduledAt' });
        }
        if (when.getTime() <= Date.now()) {
          return res.status(400).json({ message: 'scheduledAt must be in the future' });
        }
        dateMoved = when.getTime() !== (room.scheduledAt ? new Date(room.scheduledAt).getTime() : 0);
        edits.scheduledAt = when;
      }
      if (Object.keys(edits).length > 0) {
        if (room.status === 'closed') {
          return res.status(409).json({ message: 'cannot edit a closed meeting' });
        }
        updated = await livekitRepo.updateDetails(room.id, edits);
        // A moved meeting is news — everyone who planned around the old time
        // needs telling. Silent edits (typo fixes) stay silent.
        if (dateMoved && updated.scheduledAt) {
          void notifyConferenceScheduled({
            roomId: updated.id,
            communityId: updated.communityId,
            title: updated.title,
            scheduledAt: new Date(updated.scheduledAt),
            actionUrl: `/conference/${updated.id}`,
          }, userId, 'conference_scheduled');
        }
      }

      if (typeof body.recordingEnabled === 'boolean') {
        updated = await livekitRepo.setRecordingEnabled(room.id, body.recordingEnabled);
      }
      if (body.status === 'closed') {
        updated = await livekitRepo.setStatus(room.id, 'closed');
        try {
          if (isLivekitConfigured()) await deleteRoom(room.roomName);
        } catch (closeErr: any) {
          logger.warn('livekit deleteRoom failed', { roomName: room.roomName, err: closeErr?.message });
        }
      }
      res.json(updated);
    } catch (err: any) {
      logger.error('patch livekit room failed', { err: err?.message });
      res.status(500).json({ message: 'failed to update room' });
    }
  });
}
