/**
 * Discovery Router — bookmarks, tags, meetings, newsletter, achievements.
 *
 * The endpoints behind the rails and cards of the AGORA 2026 design. Nothing
 * here touches deliberation: no route in this file can change a vote, advance
 * a phase, or alter who belongs to a community. That boundary is the reason
 * these live apart from the community and proposal routers.
 *
 * Two things carry real risk despite the modest subject matter, and both are
 * handled explicitly below:
 *
 *   • the newsletter endpoint makes this server send mail to an address the
 *     caller chose, so it is rate-limited, always answers the same way, and
 *     never re-mints a token for an address that is already confirmed;
 *   • bookmarks name arbitrary row ids, so the kind is validated against a
 *     fixed list rather than trusted from the body.
 */

import type { Express, Response } from 'express';
import { discoveryRepo, communityRepo } from '../storage';
import { isBookmarkKind, communityActivity } from '../storage/discovery';
import { isThumbnailKey } from '../../shared/thumbnails';
import { db } from '../db';
import { communities } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { requireAuth, requireConsent } from '../auth';
import { canViewCommunityContentById } from '../utils/community-visibility';
import { logger } from '../utils/logger';
import { sendNewsletterConfirmation } from '../utils/newsletter';
import { rateLimit } from '../utils/rate-limiter';
import express from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { randomBytes } from 'crypto';
import { MEDIA_ROOT, hashId, safeDecodeHeader } from '../utils/media-rules';

/** Longest a meeting title may be. */
const TITLE_MAX = 140;
const DESCRIPTION_MAX = 4000;

/**
 * Newsletter attempts per IP per window. Low on purpose: a subscription is a
 * once-in-a-lifetime action for a real person, and every accepted call makes
 * this server send mail to an address the caller chose.
 */
const newsletterLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  keyGenerator: (req) => `newsletter:${req.ip || 'unknown'}`,
});

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function registerDiscoveryRoutes(app: Express) {
  // ── Bookmarks ────────────────────────────────────────────────────────────

  app.get('/api/bookmarks', requireAuth, async (req: any, res) => {
    try {
      res.json({ bookmarks: await discoveryRepo.listBookmarks(req.user.id) });
    } catch (error) {
      logger.error('[discovery] list bookmarks failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to load bookmarks' });
    }
  });

  app.post('/api/bookmarks/toggle', requireAuth, async (req: any, res) => {
    try {
      const entityType = req.body?.entityType;
      const entityId = Number(req.body?.entityId);
      if (!isBookmarkKind(entityType)) {
        return res.status(400).json({ message: 'Unknown bookmark kind' });
      }
      if (!Number.isInteger(entityId) || entityId <= 0) {
        return res.status(400).json({ message: 'Invalid id' });
      }
      const saved = await discoveryRepo.toggleBookmark(req.user.id, entityType, entityId);
      res.json({ saved });
    } catch (error) {
      logger.error('[discovery] toggle bookmark failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to save' });
    }
  });

  // ── Achievements ─────────────────────────────────────────────────────────

  app.get('/api/achievements', async (req, res) => {
    try {
      const limit = Number.parseInt(String(req.query.limit ?? '6'), 10);
      res.json({
        achievements: await discoveryRepo.listAchievements(Number.isFinite(limit) ? Math.min(limit, 24) : 6),
      });
    } catch (error) {
      logger.error('[discovery] list achievements failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to load achievements' });
    }
  });

  // ── Meetings ─────────────────────────────────────────────────────────────

  /** A meeting is community content: the community's own visibility rule decides. */
  async function requireReadable(communityId: number, userId: number | undefined, res: Response) {
    if (!Number.isInteger(communityId)) {
      res.status(400).json({ message: 'Invalid community id' });
      return false;
    }
    if (!(await canViewCommunityContentById(communityId, userId))) {
      res.status(403).json({ message: 'This community keeps its content to members' });
      return false;
    }
    return true;
  }

  app.get('/api/communities/:id/meetings', async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id, 10);
      if (!(await requireReadable(communityId, req.user?.id, res))) return;
      res.json({ meetings: await discoveryRepo.upcomingMeetings(communityId, req.user?.id) });
    } catch (error) {
      logger.error('[discovery] list meetings failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to load meetings' });
    }
  });

  app.get('/api/me/meetings', requireAuth, async (req: any, res) => {
    try {
      res.json({ meetings: await discoveryRepo.myUpcomingMeetings(req.user.id) });
    } catch (error) {
      logger.error('[discovery] my meetings failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to load meetings' });
    }
  });

  app.post('/api/communities/:id/meetings', requireAuth, requireConsent, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id, 10);
      if (!(await requireReadable(communityId, req.user.id, res))) return;

      // Announcing a meeting speaks for the community, so it is an officer's
      // act — the same bar as pinning or editing the community itself.
      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: 'Community not found' });
      const admins: number[] = Array.isArray(community.adminIds) ? community.adminIds as number[] : [];
      const isOfficer = community.creatorId === req.user.id || admins.includes(req.user.id);
      if (!isOfficer) return res.status(403).json({ message: 'Only community officers may schedule meetings' });

      const title = trimmed(req.body?.title);
      const description = trimmed(req.body?.description) || null;
      const startsAtRaw = req.body?.startsAt;
      const startsAt = startsAtRaw ? new Date(startsAtRaw) : null;

      if (!title) return res.status(400).json({ message: 'Title is required' });
      if (title.length > TITLE_MAX) return res.status(400).json({ message: `Title must be at most ${TITLE_MAX} characters` });
      if (description && description.length > DESCRIPTION_MAX) {
        return res.status(400).json({ message: `Description must be at most ${DESCRIPTION_MAX} characters` });
      }
      if (!startsAt || Number.isNaN(startsAt.getTime())) {
        return res.status(400).json({ message: 'A valid start time is required' });
      }

      const isOnline = req.body?.isOnline !== false;
      const meeting = await discoveryRepo.createMeeting({
        communityId,
        createdBy: req.user.id,
        title,
        description,
        startsAt,
        endsAt: req.body?.endsAt ? new Date(req.body.endsAt) : null,
        location: isOnline ? null : (trimmed(req.body?.location) || null),
        isOnline,
        isUrgent: req.body?.isUrgent === true,
      });
      res.status(201).json({ meeting });
    } catch (error) {
      logger.error('[discovery] create meeting failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to create the meeting' });
    }
  });

  app.post('/api/meetings/:id/rsvp', requireAuth, requireConsent, async (req: any, res) => {
    try {
      const meetingId = parseInt(req.params.id, 10);
      const meeting = await discoveryRepo.getMeeting(meetingId);
      if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
      if (!(await requireReadable(meeting.communityId, req.user.id, res))) return;

      const attending = await discoveryRepo.toggleRsvp(meetingId, req.user.id);
      res.json({ attending });
    } catch (error) {
      logger.error('[discovery] rsvp failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to record your answer' });
    }
  });

  /**
   * Who may change how a community looks.
   *
   * Founder, community admin and platform admin everywhere — matching
   * canCurateLibrary in the community-media router.
   *
   * Plus **any member of an autonomous community**. Those have no
   * administrators by their own definition, so a founder-only rule would leave
   * the community's face permanently in the hands of one person who may long
   * since have left, while the members who actually run it could never touch
   * it. This is not a governance lever — nothing here can affect a vote, a
   * phase or a membership — and any other member can change it straight back,
   * which is why it does not go to the ballot the way joinPolicy does.
   */
  async function canEditAppearance(
    community: { id: number; creatorId: number; adminIds: unknown; type: string },
    user: { id: number; isAdmin?: boolean | null },
  ): Promise<boolean> {
    if (user.isAdmin) return true;
    if (community.creatorId === user.id) return true;
    const admins: number[] = Array.isArray(community.adminIds) ? community.adminIds as number[] : [];
    if (admins.includes(user.id)) return true;
    if (community.type === 'autonomous') {
      return communityRepo.isCommunityMember(community.id, user.id);
    }
    return false;
  }

  // ── Community appearance ─────────────────────────────────────────────────
  //
  // Presentation, not governance. The vote-governed keys live in
  // shared/governable-settings.ts and are decided by the members; a picture
  // and a handle are identity, which the same file says only officers change.
  // Routing them through the settings vote would mean a community had to hold
  // a ballot to fix a typo in its own tagline.

  /** Fields an officer may set. Everything else in the body is ignored. */
  const CATEGORIES = [
    'koinonia', 'perivallon', 'politiki', 'politismos',
    'oikonomia', 'allilengyi', 'ygeia',
  ];
  const TAGLINE_MAX = 200;
  const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

  app.patch('/api/communities/:id/appearance', requireAuth, requireConsent, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id, 10);
      if (!Number.isInteger(communityId)) return res.status(400).json({ message: 'Invalid community id' });

      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: 'Community not found' });
      if (!(await canEditAppearance(community as any, req.user))) {
        return res.status(403).json({ message: 'You may not change this community\'s appearance' });
      }

      const updates: Record<string, unknown> = {};

      if ('thumbnailKey' in req.body) {
        const key = req.body.thumbnailKey;
        // null clears the choice and hands the slot back to the derived
        // default, which is a legitimate thing to want.
        if (key === null) updates.thumbnailKey = null;
        else if (isThumbnailKey(key)) updates.thumbnailKey = key;
        else return res.status(400).json({ message: 'Unknown thumbnail' });
      }

      if ('tagline' in req.body) {
        const tagline = trimmed(req.body.tagline);
        if (tagline.length > TAGLINE_MAX) {
          return res.status(400).json({ message: `Tagline must be at most ${TAGLINE_MAX} characters` });
        }
        updates.tagline = tagline || null;
      }

      if ('category' in req.body) {
        const category = trimmed(req.body.category);
        if (category && !CATEGORIES.includes(category)) {
          return res.status(400).json({ message: 'Unknown category' });
        }
        updates.category = category || null;
      }

      if ('region' in req.body) updates.region = trimmed(req.body.region).slice(0, 120) || null;

      if ('website' in req.body) {
        const website = trimmed(req.body.website);
        if (website) {
          // Only http(s). A javascript: or data: URL here would be rendered as
          // a link on a public page.
          let parsed: URL;
          try { parsed = new URL(website); } catch { return res.status(400).json({ message: 'Invalid website URL' }); }
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return res.status(400).json({ message: 'Website must be http or https' });
          }
          updates.website = parsed.toString();
        } else {
          updates.website = null;
        }
      }

      if ('username' in req.body) {
        const username = trimmed(req.body.username).toLowerCase();
        if (username) {
          if (!USERNAME_RE.test(username)) {
            return res.status(400).json({ message: 'Handle must be 3-30 characters: a-z, 0-9, underscore' });
          }
          const [taken] = await db
            .select({ id: communities.id })
            .from(communities)
            .where(sql`lower(${communities.username}) = ${username} and ${communities.id} <> ${communityId}`);
          if (taken) return res.status(409).json({ message: 'That handle is taken' });
          updates.username = username;
        } else {
          updates.username = null;
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: 'Nothing to update' });
      }

      const [updated] = await db
        .update(communities)
        .set(updates)
        .where(eq(communities.id, communityId))
        .returning();
      res.json({ community: updated });
    } catch (error) {
      logger.error('[discovery] appearance update failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to update appearance' });
    }
  });

  // ── Community logo & cover upload ────────────────────────────────────────
  //
  // The generated catalogue is the *fallback*; a community that has a real
  // logo should be able to use it. Files land beside the community's library
  // in AGORAX_MEDIA_DIR and are served by the same /media route, so no second
  // storage path is invented for two images.

  /** Bitmap formats a browser will render everywhere. SVG is excluded on purpose. */
  const IMAGE_TYPES: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
  };
  const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

  app.post('/api/communities/:id/image',
    requireAuth,
    requireConsent,
    express.raw({ type: '*/*', limit: '5mb' }),
    async (req: any, res) => {
      try {
        const communityId = parseInt(req.params.id, 10);
        if (!Number.isFinite(communityId)) {
          return res.status(400).json({ message: 'Invalid community id' });
        }

        const slot = req.query?.slot;
        if (slot !== 'avatar' && slot !== 'cover') {
          return res.status(400).json({ message: "slot must be 'avatar' or 'cover'" });
        }

        const community = await communityRepo.getCommunity(communityId);
        if (!community) return res.status(404).json({ message: 'Community not found' });
        if (!(await canEditAppearance(community as any, req.user))) {
          return res.status(403).json({ message: 'You may not change this community\'s images' });
        }

        const buffer = req.body as Buffer;
        if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
          return res.status(400).json({ message: 'File is required' });
        }
        if (buffer.length > IMAGE_MAX_BYTES) {
          return res.status(413).json({ message: 'Image must be 4MB or smaller' });
        }

        // The declared type is not trusted on its own — the magic bytes decide.
        // An SVG renamed .png would otherwise be served from our own origin
        // with whatever script it carries.
        const declared = (req.headers['content-type'] || '').split(';')[0].trim();
        const ext = IMAGE_TYPES[declared];
        if (!ext) return res.status(415).json({ message: 'Image must be PNG, JPEG or WebP' });

        const isPng = buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        const isWebp = buffer.length > 12
          && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
          && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
        const actual = isPng ? '.png' : isJpeg ? '.jpg' : isWebp ? '.webp' : null;
        if (!actual || actual !== ext) {
          return res.status(415).json({ message: 'File contents do not match the declared image type' });
        }

        const dir = path.join(MEDIA_ROOT, `c${communityId}`);
        if (!existsSync(dir)) await mkdir(dir, { recursive: true });

        const filename = `${slot}-${hashId(buffer)}-${randomBytes(4).toString('hex')}${ext}`;
        await writeFile(path.join(dir, filename), buffer);
        const relative = path.posix.join(`c${communityId}`, filename);

        const previous = slot === 'avatar' ? community.avatarPath : community.coverPath;
        const [updated] = await db
          .update(communities)
          .set(slot === 'avatar' ? { avatarPath: relative } : { coverPath: relative })
          .where(eq(communities.id, communityId))
          .returning();

        // Best effort: a leftover file costs disk, a failed delete must not
        // fail the upload the officer just made.
        if (previous && previous !== relative) {
          unlink(path.join(MEDIA_ROOT, previous)).catch(() => {});
        }

        res.json({ community: updated, path: relative });
      } catch (error) {
        logger.error('[discovery] community image upload failed', { err: (error as any)?.message });
        res.status(500).json({ message: 'Upload failed' });
      }
    });

  /** Remove an uploaded image and fall back to the generated catalogue. */
  app.delete('/api/communities/:id/image', requireAuth, requireConsent, async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id, 10);
      const slot = req.query?.slot;
      if (slot !== 'avatar' && slot !== 'cover') {
        return res.status(400).json({ message: "slot must be 'avatar' or 'cover'" });
      }
      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: 'Community not found' });
      if (!(await canEditAppearance(community as any, req.user))) {
        return res.status(403).json({ message: 'You may not change this community\'s images' });
      }

      const previous = slot === 'avatar' ? community.avatarPath : community.coverPath;
      const [updated] = await db
        .update(communities)
        .set(slot === 'avatar' ? { avatarPath: null } : { coverPath: null })
        .where(eq(communities.id, communityId))
        .returning();
      if (previous) unlink(path.join(MEDIA_ROOT, previous)).catch(() => {});
      res.json({ community: updated });
    } catch (error) {
      logger.error('[discovery] community image delete failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Delete failed' });
    }
  });

  // ── Community activity + tags ────────────────────────────────────────────

  app.get('/api/communities/:id/activity', async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id, 10);
      if (!(await requireReadable(communityId, req.user?.id, res))) return;
      res.json({ events: await communityActivity(communityId) });
    } catch (error) {
      logger.error('[discovery] activity failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to load activity' });
    }
  });

  app.get('/api/communities/:id/tags', async (req: any, res) => {
    try {
      const communityId = parseInt(req.params.id, 10);
      if (!Number.isInteger(communityId)) return res.status(400).json({ message: 'Invalid community id' });
      res.json({ tags: await discoveryRepo.tagsFor('community', communityId) });
    } catch (error) {
      logger.error('[discovery] tags failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Failed to load tags' });
    }
  });

  // ── Newsletter ───────────────────────────────────────────────────────────

  app.post('/api/newsletter/subscribe', newsletterLimit, async (req: any, res) => {
    try {
      const email = trimmed(req.body?.email);
      const locale = trimmed(req.body?.locale) === 'en' ? 'en' : 'el';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return res.status(400).json({ message: 'A valid email address is required' });
      }

      const token = await discoveryRepo.subscribeNewsletter(email, locale, req.user?.id);
      // A null token means the address is already confirmed. The response is
      // identical either way: telling an anonymous caller which addresses are
      // already on the list would turn this into a membership oracle.
      if (token) {
        await sendNewsletterConfirmation(email, token, locale);
      }
      res.json({ ok: true });
    } catch (error) {
      logger.error('[discovery] newsletter subscribe failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Subscription failed' });
    }
  });

  app.get('/api/newsletter/confirm', async (req, res) => {
    try {
      const token = trimmed(req.query.token);
      if (!token) return res.status(400).json({ message: 'Missing token' });
      const ok = await discoveryRepo.confirmNewsletter(token);
      res.json({ ok });
    } catch (error) {
      logger.error('[discovery] newsletter confirm failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Confirmation failed' });
    }
  });

  app.post('/api/newsletter/unsubscribe', async (req, res) => {
    try {
      const token = trimmed(req.body?.token);
      if (!token) return res.status(400).json({ message: 'Missing token' });
      const ok = await discoveryRepo.unsubscribeNewsletter(token);
      res.json({ ok });
    } catch (error) {
      logger.error('[discovery] newsletter unsubscribe failed', { err: (error as any)?.message });
      res.status(500).json({ message: 'Unsubscribe failed' });
    }
  });
}
