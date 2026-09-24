/**
 * Community Library Router — media posted inside a community.
 *
 * Deliberately decoupled from proposals and from the global /feed: items
 * live on the community page only. Any member can upload; the community's
 * contentVisibility gates who can read; founder/admins pin items to the
 * top of the library ("start here" material) and curate.
 *
 * Files share AGORAX_MEDIA_DIR with proposal media but live in a
 * `c<communityId>` subdirectory so the two id namespaces can never
 * collide. They are served by the same /media static handler (hashed,
 * unguessable filenames — same privacy model as proposal media).
 */

import type { Express } from 'express';
import { randomBytes } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import express from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { communityMedia, type CommunityMedia } from '@shared/schema';
import { communityRepo } from '../storage';
import { requireAuth } from '../auth';
import { probeMedia, extractVideoThumbnail } from '../utils/media-probe';
import { canViewCommunityContentById } from '../utils/community-visibility';
import { MEDIA_ROOT, LIBRARY_EXTRA_DOCUMENT_EXTS, isKind, isZip, hashId, safeDecodeHeader, validateUpload, type Kind } from '../utils/media-rules';
import { logger } from '../utils/logger';

async function ensureCommunityDir(communityId: number): Promise<string> {
  const dir = path.join(MEDIA_ROOT, `c${communityId}`);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  return dir;
}

/** founder/admin of the community, or platform admin. */
async function canCurateLibrary(communityId: number, user: { id: number; isAdmin?: boolean }): Promise<boolean> {
  if (user.isAdmin) return true;
  const role = await communityRepo.getCommunityMemberRole(communityId, user.id);
  return role === 'founder' || role === 'admin';
}

export function registerCommunityMediaRoutes(app: Express): void {

  // ── Upload (members only) ────────────────────────────────────────────
  app.post('/api/communities/:id/media',
    requireAuth,
    express.raw({ type: '*/*', limit: '120mb' }),
    async (req: any, res) => {
      try {
      const communityId = parseInt(req.params.id, 10);
      if (!Number.isFinite(communityId)) {
        return res.status(400).json({ message: 'invalid community id' });
      }
      const kindRaw = req.query?.kind;
      if (!isKind(kindRaw)) {
        return res.status(400).json({ message: "kind must be 'podcast', 'video' or 'document'" });
      }
      const kind: Kind = kindRaw;

      const buffer = req.body as Buffer;
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        return res.status(400).json({ message: 'file is required' });
      }

      const community = await communityRepo.getCommunity(communityId);
      if (!community) return res.status(404).json({ message: 'community not found' });

      const userId: number = req.user.id;
      const isMember = await communityRepo.isCommunityMember(communityId, userId);
      if (!isMember && !req.user.isAdmin) {
        return res.status(403).json({ message: 'must be a community member to post to the library' });
      }

      const defaultMime = kind === 'podcast' ? 'audio/mpeg' : kind === 'video' ? 'video/mp4' : 'application/pdf';
      const defaultExt = kind === 'podcast' ? '.mp3' : kind === 'video' ? '.mp4' : '.pdf';
      const mimeType = (req.headers['content-type'] || '').split(';')[0].trim() || defaultMime;
      const rawName = safeDecodeHeader(req.headers['x-file-name'], `upload${defaultExt}`)
        || `upload${defaultExt}`;
      const title = safeDecodeHeader(req.headers['x-media-title']).trim().slice(0, 200);
      if (!title) {
        return res.status(400).json({ message: 'title is required (X-Media-Title header)' });
      }

      const ext = path.extname(rawName).toLowerCase();
      const invalid = validateUpload(kind, buffer.length, ext, mimeType, LIBRARY_EXTRA_DOCUMENT_EXTS);
      if (invalid) return res.status(invalid.status).json({ message: invalid.message });
      if (ext === '.apkg' && !isZip(buffer)) {
        return res.status(415).json({ message: 'not a valid Anki deck (.apkg must be a zip archive)' });
      }

      const dir = await ensureCommunityDir(communityId);
      const id = hashId(buffer) + '-' + randomBytes(4).toString('hex');
      const filename = `${kind}-${id}${ext}`;
      const filePath = path.join(dir, filename);
      await writeFile(filePath, buffer);

      // Probe streams / extract poster. Same policy as proposal media:
      // a failed probe (e.g. no ffprobe) is tolerated; a wrong-shape file
      // (no audio/video stream) is rejected and cleaned up.
      let durationS = 0;
      let thumbRel: string | null = null;
      if (kind !== 'document') try {
        const probed = await probeMedia(filePath);
        durationS = probed.durationS;
        if (kind === 'podcast' && !probed.hasAudio) {
          await unlink(filePath);
          return res.status(415).json({ message: 'file has no audio stream' });
        }
        if (kind === 'video' && !probed.hasVideo) {
          await unlink(filePath);
          return res.status(415).json({ message: 'file has no video stream' });
        }
        if (kind === 'video') {
          const thumbName = `${kind}-${id}.jpg`;
          try {
            await extractVideoThumbnail(filePath, path.join(dir, thumbName));
            thumbRel = path.posix.join(`c${communityId}`, thumbName);
          } catch (thumbErr: any) {
            logger.warn('library thumbnail extraction failed', { communityId, err: thumbErr?.message });
          }
        }
      } catch (probeErr: any) {
        logger.warn('library media probe failed', { communityId, err: probeErr?.message });
      }

      const [row] = await db.insert(communityMedia).values({
        communityId,
        uploaderId: userId,
        kind,
        title,
        filePath: path.posix.join(`c${communityId}`, filename),
        thumbPath: thumbRel,
        mimeType: mimeType || defaultMime,
        sizeBytes: buffer.length,
        durationS: durationS > 0 ? String(durationS) : null,
        status: 'published',
      }).returning();

      res.status(201).json(row);
      } catch (err: any) {
        logger.error('library upload failed', { err: err?.message });
        res.status(500).json({ message: 'upload failed' });
      }
    },
  );

  // ── List (visibility-gated; pinned first, then newest) ──────────────
  app.get('/api/communities/:id/media', async (req: any, res) => {
    try {
    const communityId = parseInt(req.params.id, 10);
    if (!Number.isFinite(communityId)) {
      return res.status(400).json({ message: 'invalid community id' });
    }
    const viewerId: number | undefined = req.user?.id;
    const visible = await canViewCommunityContentById(communityId, viewerId);
    if (!visible) {
      return res.status(403).json({ message: 'library is members-only', contentHidden: true });
    }

    const rows: CommunityMedia[] = await db.select().from(communityMedia)
      .where(eq(communityMedia.communityId, communityId))
      .orderBy(desc(communityMedia.pinned), desc(communityMedia.createdAt));

    // Hidden rows only for their uploader, curators, or platform admin.
    const curator = viewerId != null
      && await canCurateLibrary(communityId, { id: viewerId, isAdmin: !!req.user?.isAdmin });
    const items = rows.filter(r =>
      r.status === 'published' || curator || r.uploaderId === viewerId);

    res.json({ items });
    } catch (err: any) {
      logger.error('library list failed', { err: err?.message });
      res.status(500).json({ message: 'failed to load library' });
    }
  });

  // ── Curate: pin/unpin (founder/admin), hide/unhide, delete ──────────
  app.patch('/api/communities/:id/media/:mid', requireAuth, async (req: any, res) => {
    try {
    const communityId = parseInt(req.params.id, 10);
    const mediaId = parseInt(req.params.mid, 10);
    if (!Number.isFinite(communityId) || !Number.isFinite(mediaId)) {
      return res.status(400).json({ message: 'invalid id' });
    }
    const [row] = await db.select().from(communityMedia)
      .where(and(eq(communityMedia.id, mediaId), eq(communityMedia.communityId, communityId)));
    if (!row) return res.status(404).json({ message: 'not found' });

    const curator = await canCurateLibrary(communityId, req.user);
    const updates: Partial<typeof communityMedia.$inferInsert> = {};

    if (typeof req.body?.pinned === 'boolean') {
      // Pinning is a curator act: it decides what the community sees first.
      if (!curator) return res.status(403).json({ message: 'only community admins can pin' });
      updates.pinned = req.body.pinned;
      updates.pinnedAt = req.body.pinned ? new Date() : null;
      updates.pinnedBy = req.body.pinned ? req.user.id : null;
    }
    if (req.body?.status === 'published' || req.body?.status === 'hidden') {
      // Uploaders may HIDE their own item; only curators may (re)publish —
      // otherwise an uploader could undo a curator's moderation decision.
      const allowed = req.body.status === 'hidden'
        ? (curator || row.uploaderId === req.user.id)
        : curator;
      if (!allowed) {
        return res.status(403).json({ message: 'not allowed' });
      }
      updates.status = req.body.status;
      if (req.body.status === 'hidden') {
        updates.pinned = false;
        updates.pinnedAt = null;
        updates.pinnedBy = null;
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'nothing to update' });
    }

    const [updated] = await db.update(communityMedia).set(updates)
      .where(eq(communityMedia.id, mediaId)).returning();
    res.json(updated);
    } catch (err: any) {
      logger.error('library update failed', { err: err?.message });
      res.status(500).json({ message: 'update failed' });
    }
  });

  app.delete('/api/communities/:id/media/:mid', requireAuth, async (req: any, res) => {
    try {
    const communityId = parseInt(req.params.id, 10);
    const mediaId = parseInt(req.params.mid, 10);
    if (!Number.isFinite(communityId) || !Number.isFinite(mediaId)) {
      return res.status(400).json({ message: 'invalid id' });
    }
    const [row] = await db.select().from(communityMedia)
      .where(and(eq(communityMedia.id, mediaId), eq(communityMedia.communityId, communityId)));
    if (!row) return res.status(404).json({ message: 'not found' });

    const curator = await canCurateLibrary(communityId, req.user);
    if (!curator && row.uploaderId !== req.user.id) {
      return res.status(403).json({ message: 'not allowed' });
    }

    await db.delete(communityMedia).where(eq(communityMedia.id, mediaId));
    for (const rel of [row.filePath, row.thumbPath]) {
      if (!rel) continue;
      try { await unlink(path.join(MEDIA_ROOT, rel)); } catch { /* best-effort */ }
    }
    res.json({ success: true });
    } catch (err: any) {
      logger.error('library delete failed', { err: err?.message });
      res.status(500).json({ message: 'delete failed' });
    }
  });
}
