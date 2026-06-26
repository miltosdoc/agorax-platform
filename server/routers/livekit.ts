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
 *   PATCH  /api/livekit/rooms/:id                         — toggle recording / close (host-only)
 *
 * Access gates:
 *   • community room — must be a member of `communityId` to join; only
 *     admins/founders can schedule or close.
 *   • sortition room — must be a member of `sortitionBodyId` to join.
 *     Admin = the proposal author (so they can host/end the call).
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
  LivekitUnavailableError,
} from '../utils/livekit-client';
import {
  notifyConferenceScheduled,
  notifyRoomOpened,
  buildIcs,
} from '../utils/conference-notify';
import { logger } from '../utils/logger';

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

  app.get('/api/communities/:id/rooms', async (req, res) => {
    try {
      const communityId = parseInt(req.params.id, 10);
      if (!Number.isFinite(communityId)) return res.status(400).json({ message: 'invalid community id' });
      const rooms = await livekitRepo.listOpenForCommunity(communityId);
      res.json(rooms);
    } catch (err: any) {
      logger.error('list community rooms failed', { err: err?.message });
      res.status(500).json({ message: 'failed to list rooms' });
    }
  });

  // ── Past calls: closed community rooms with duration + participants ─
  app.get('/api/communities/:id/rooms/history', async (req, res) => {
    try {
      const communityId = parseInt(req.params.id, 10);
      if (!Number.isFinite(communityId)) return res.status(400).json({ message: 'invalid community id' });
      const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? '10', 10) || 10));
      const history = await livekitRepo.listHistoryForCommunity(communityId, limit);
      res.json(history);
    } catch (err: any) {
      logger.error('list community history failed', { err: err?.message });
      res.status(500).json({ message: 'failed to list call history' });
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
      if (!await isCommunityHost(communityId, userId, isAdmin)) {
        return res.status(403).json({ message: 'only community admins can schedule conferences' });
      }
      const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim() : null;
      if (!title) return res.status(400).json({ message: 'title is required' });
      const scheduledAtRaw = req.body?.scheduledAt;
      const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
      const recordingEnabled = !!req.body?.recordingEnabled;

      const room = await livekitRepo.create({
        roomName: newRoomName(`c${communityId}`),
        kind: 'community',
        title: title.slice(0, 200),
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
        actionUrl: `/communities/${communityId}?room=${room.id}`,
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
      let isHost = false;
      if (room.kind === 'community') {
        allowed = await communityRepo.isCommunityMember(room.communityId, userId) || isAdmin;
        isHost = await isCommunityHost(room.communityId, userId, isAdmin);
      } else {
        if (!room.sortitionBodyId) return res.status(500).json({ message: 'malformed sortition room' });
        allowed = await isSortitionMember(room.sortitionBodyId, userId) || isAdmin;
        // Host of a sortition room = the proposal author (if any) or admin.
        if (room.sortitionBodyId) {
          const [body] = await db
            .select({ proposalId: sortitionBodies.proposalId })
            .from(sortitionBodies)
            .where(eq(sortitionBodies.id, room.sortitionBodyId));
          if (body?.proposalId) {
            const proposal = await proposalRepo.getProposal(body.proposalId);
            isHost = proposal?.authorId === userId || isAdmin;
          }
        }
      }
      if (!allowed) return res.status(403).json({ message: 'not allowed in this room' });

      // First join flips a 'scheduled' room into 'active'.
      if (room.status === 'scheduled') {
        await livekitRepo.setStatus(room.id, 'active');
      }

      const displayName = (req.user.name || req.user.username || `user-${userId}`).toString();
      const token = await issueJoinToken({
        roomName: room.roomName,
        identity: `user-${userId}`,
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
      res.json({ token, url: publicLivekitUrl(host), roomName: room.roomName, isHost, participationId, turnUrl });
    } catch (err: any) {
      if (err instanceof LivekitUnavailableError) return unavailable(res);
      logger.error('issue livekit token failed', { err: err?.message });
      res.status(500).json({ message: 'failed to issue join token' });
    }
  });

  // ── iCalendar download — adds the conference to the user's calendar ─
  // No auth gate: the URL is short-lived (room dies on close) and contains
  // no secrets, just the room title + the public landing URL.
  app.get('/api/livekit/rooms/:id/ics', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).send('invalid room id');
      const room = await livekitRepo.getById(id);
      if (!room) return res.status(404).send('not found');
      const host = req.get('host') ?? 'agorax';
      const proto = (req.headers['x-forwarded-proto'] as string | undefined) || req.protocol;
      const landingUrl = room.kind === 'sortition' && room.sortitionBodyId
        ? `${proto}://${host}/sortition/body/${room.sortitionBodyId}`
        : `${proto}://${host}/communities/${room.communityId}?room=${room.id}`;
      const start = room.scheduledAt ?? room.createdAt;
      const ics = buildIcs({
        uid: `agorax-room-${room.id}@${host}`,
        title: room.title,
        description: room.kind === 'sortition'
          ? 'Σύσκεψη κληρωτού σώματος στο AgoraX'
          : 'Συνάντηση κοινότητας στο AgoraX',
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
      let isHost = isAdmin;
      if (!isHost) {
        if (room.kind === 'community') {
          isHost = await isCommunityHost(room.communityId, userId, isAdmin);
        } else if (room.sortitionBodyId) {
          const [body] = await db
            .select({ proposalId: sortitionBodies.proposalId })
            .from(sortitionBodies)
            .where(eq(sortitionBodies.id, room.sortitionBodyId));
          if (body?.proposalId) {
            const proposal = await proposalRepo.getProposal(body.proposalId);
            isHost = proposal?.authorId === userId;
          }
        }
      }
      if (!isHost) return res.status(403).json({ message: 'host only' });

      const body = req.body ?? {};
      let updated = room;
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
