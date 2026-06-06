/**
 * Media Router — proposal podcasts + video teasers.
 *
 * Workflow:
 *   1. AgoraX generates Greek scripts (podcast + 45-second teaser) from the
 *      proposal text + top community arguments. The user copies the script
 *      and produces audio/video externally (NotebookLM, ElevenLabs, etc.).
 *   2. The user uploads the resulting MP3 / MP4 here.
 *   3. The proposal author curates the gallery: feature, hide, delete.
 *   4. Public share routes + the global /feed surface what's been featured.
 *
 * Files live under AGORAX_MEDIA_DIR (default ./uploads/media) on local disk,
 * one subdirectory per proposal. The Express static handler below serves
 * them with long cache headers — the filename includes a content hash so
 * cache-busting comes for free.
 */

import type { Express, Request, Response } from 'express';
import multer from 'multer';
import { randomBytes, createHash } from 'crypto';
import { mkdir, rename, unlink, writeFile, stat } from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import path from 'path';
import express from 'express';
import { mediaRepo, proposalRepo, communityRepo } from '../storage';
import { requireAuth } from '../auth';
import { probeMedia, extractVideoThumbnail } from '../utils/media-probe';
import { generatePodcastScript, generateTeaserScript } from '../utils/media-scripts';
import { logger } from '../utils/logger';

const MEDIA_ROOT = process.env.AGORAX_MEDIA_DIR
  || path.resolve(process.cwd(), 'uploads', 'media');

// Per-kind caps. Size is the only enforced limit (same 120MB ceiling for
// audio and video). Duration is still probed and stored so the UI can
// display it, but is no longer a rejection reason — the proposal author
// decides what length makes sense for their content.
const LIMITS = {
  podcast: {
    maxBytes: 120 * 1024 * 1024,
    mimes: new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a']),
    exts: new Set(['.mp3', '.m4a']),
  },
  video: {
    maxBytes: 120 * 1024 * 1024,
    mimes: new Set(['video/mp4', 'video/quicktime']),
    exts: new Set(['.mp4', '.mov']),
  },
} as const;

type Kind = keyof typeof LIMITS;

function isKind(v: unknown): v is Kind {
  return v === 'podcast' || v === 'video';
}

async function ensureProposalDir(proposalId: number): Promise<string> {
  const dir = path.join(MEDIA_ROOT, String(proposalId));
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  return dir;
}

function hashId(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

const upload = multer({
  storage: multer.memoryStorage(),
  // The largest of any limit — actual per-kind enforcement happens below.
  limits: { fileSize: LIMITS.video.maxBytes },
});

/** Resolve a media row and its on-disk file, or 404. */
async function loadMediaOr404(req: Request, res: Response) {
  const id = parseInt(req.params.mid, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: 'invalid media id' });
    return null;
  }
  const row = await mediaRepo.getById(id);
  if (!row) {
    res.status(404).json({ message: 'not found' });
    return null;
  }
  return row;
}

/**
 * Author/admin/uploader check for curate actions. Author has full control;
 * uploaders can delete or unfeature their own row.
 */
async function canCurate(
  userId: number,
  isAdmin: boolean,
  media: { proposalId: number; uploaderId: number },
): Promise<{ allowed: boolean; isAuthor: boolean }> {
  if (isAdmin) return { allowed: true, isAuthor: false };
  const proposal = await proposalRepo.getProposal(media.proposalId);
  const isAuthor = proposal?.authorId === userId;
  if (isAuthor) return { allowed: true, isAuthor: true };
  if (media.uploaderId === userId) return { allowed: true, isAuthor: false };
  return { allowed: false, isAuthor: false };
}

export function registerMediaRoutes(app: Express): void {

  // Static file serving. Long cache because filenames include a content
  // hash — overwriting the file is impossible since we always write a
  // fresh hashed name.
  app.use('/media', express.static(MEDIA_ROOT, {
    fallthrough: false,
    maxAge: '7d',
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    },
  }));

  // ── Script generation ────────────────────────────────────────────────

  app.get('/api/proposals/:id/scripts/:kind', requireAuth, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id, 10);
      const kind = req.params.kind;
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: 'invalid proposal id' });
      }
      if (kind !== 'podcast' && kind !== 'video') {
        return res.status(400).json({ message: 'kind must be podcast or video' });
      }
      // `include` is a comma-separated list of optional context sources.
      const include = String(req.query.include ?? '').split(',').map(s => s.trim()).filter(Boolean);
      const input = {
        proposalId,
        includeAmendments: include.includes('amendments'),
        includeThreads: include.includes('threads'),
      };
      const result = kind === 'podcast'
        ? await generatePodcastScript(input)
        : await generateTeaserScript(input);
      res.json(result);
    } catch (err: any) {
      if (/not found/i.test(err?.message ?? '')) {
        return res.status(404).json({ message: 'proposal not found' });
      }
      logger.error('script generation failed', { err: err?.message });
      res.status(500).json({ message: 'failed to generate script' });
    }
  });

  // ── Upload ───────────────────────────────────────────────────────────

  app.post('/api/proposals/:id/media',
    requireAuth,
    upload.single('file'),
    async (req: any, res) => {
      const proposalId = parseInt(req.params.id, 10);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: 'invalid proposal id' });
      }
      const kindRaw = req.body?.kind;
      if (!isKind(kindRaw)) {
        return res.status(400).json({ message: "kind must be 'podcast' or 'video'" });
      }
      const kind: Kind = kindRaw;
      const file = req.file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ message: 'file is required' });

      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: 'proposal not found' });

      // Membership gate — any member of the proposal's community can submit.
      const userId: number = req.user.id;
      const isMember = await communityRepo.isCommunityMember(proposal.communityId, userId);
      if (!isMember && !req.user.isAdmin) {
        return res.status(403).json({ message: 'must be a community member to upload media' });
      }

      const limits = LIMITS[kind];
      if (file.size > limits.maxBytes) {
        return res.status(413).json({
          message: `file too large; ${kind} max is ${Math.round(limits.maxBytes / 1024 / 1024)}MB`,
        });
      }
      const ext = path.extname(file.originalname).toLowerCase();
      if (!limits.exts.has(ext)) {
        return res.status(415).json({
          message: `unsupported extension ${ext || '(none)'}; expected one of ${[...limits.exts].join(', ')}`,
        });
      }
      if (file.mimetype && !limits.mimes.has(file.mimetype)) {
        // Browsers occasionally send 'application/octet-stream' — don't hard-fail
        // on a permissive mime, but reject obviously-wrong content types.
        if (!file.mimetype.startsWith('audio/') && !file.mimetype.startsWith('video/')
            && file.mimetype !== 'application/octet-stream') {
          return res.status(415).json({ message: `mime ${file.mimetype} not allowed` });
        }
      }

      const dir = await ensureProposalDir(proposalId);
      const id = hashId(file.buffer) + '-' + randomBytes(4).toString('hex');
      const filename = `${kind}-${id}${ext}`;
      const filePath = path.join(dir, filename);
      await writeFile(filePath, file.buffer);

      // Probe — if probe fails or the file is the wrong shape, clean up.
      let durationS = 0;
      let thumbRel: string | null = null;
      try {
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
          const thumbPath = path.join(dir, thumbName);
          try {
            await extractVideoThumbnail(filePath, thumbPath);
            thumbRel = path.posix.join(String(proposalId), thumbName);
          } catch (thumbErr: any) {
            logger.warn('thumbnail extraction failed', { proposalId, err: thumbErr?.message });
          }
        }
      } catch (probeErr: any) {
        logger.warn('media probe failed', { proposalId, err: probeErr?.message });
        // Probe failed — accept the file but leave duration null. We won't
        // delete just because ffprobe isn't installed; the static rules
        // above already gated extension + mime + size.
      }

      const relPath = path.posix.join(String(proposalId), filename);
      const row = await mediaRepo.create({
        proposalId,
        uploaderId: userId,
        kind,
        filePath: relPath,
        thumbPath: thumbRel,
        mimeType: file.mimetype || (kind === 'podcast' ? 'audio/mpeg' : 'video/mp4'),
        sizeBytes: file.size,
        durationS: durationS > 0 ? String(durationS) : null,
        status: 'published',
        isFeatured: false,
      } as any);

      try {
        const { notifyNewMedia } = await import('../utils/notifications');
        await notifyNewMedia(proposalId, proposal.communityId, kind, userId, proposal.question);
      } catch (notifyErr: any) {
        logger.warn('notifyNewMedia failed', { proposalId, err: notifyErr?.message });
      }

      res.status(201).json(row);
    },
  );

  // ── List ─────────────────────────────────────────────────────────────

  app.get('/api/proposals/:id/media', async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id, 10);
      if (!Number.isFinite(proposalId)) {
        return res.status(400).json({ message: 'invalid proposal id' });
      }
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: 'proposal not found' });
      // Author and admin see all entries (including hidden).
      // Uploaders see their own hidden entries so they can unhide them.
      const userId: number | undefined = req.user?.id;
      const isAuthor = !!userId && proposal.authorId === userId;
      const isAdmin = !!userId && req.user.isAdmin;
      const list = await mediaRepo.listForProposal(proposalId, {
        includeHidden: isAuthor || isAdmin,
        userId,
      });
      res.json(list);
    } catch (err: any) {
      logger.error('list media failed', { err: err?.message });
      res.status(500).json({ message: 'failed to list media' });
    }
  });

  // ── Curate (feature / hide / show) ───────────────────────────────────

  app.patch('/api/proposals/:id/media/:mid', requireAuth, async (req: any, res) => {
    try {
      const row = await loadMediaOr404(req, res);
      if (!row) return;
      const { allowed, isAuthor } = await canCurate(req.user.id, !!req.user.isAdmin, row);
      if (!allowed) return res.status(403).json({ message: 'not allowed' });

      const body = req.body ?? {};
      let updated = row;

      if ('isFeatured' in body) {
        // Only the author/admin can feature.
        if (body.isFeatured && !isAuthor && !req.user.isAdmin) {
          return res.status(403).json({ message: 'only the proposal author can feature media' });
        }
        updated = await mediaRepo.setFeatured(row.id, !!body.isFeatured);
      }
      if ('status' in body) {
        if (body.status !== 'published' && body.status !== 'hidden') {
          return res.status(400).json({ message: "status must be 'published' or 'hidden'" });
        }
        // Only the author/admin can hide other people's uploads. Uploaders
        // hiding their own row is allowed.
        if (body.status === 'hidden' && !isAuthor && !req.user.isAdmin && row.uploaderId !== req.user.id) {
          return res.status(403).json({ message: 'not allowed' });
        }
        updated = await mediaRepo.setStatus(row.id, body.status);
      }
      res.json(updated);
    } catch (err: any) {
      logger.error('media patch failed', { err: err?.message });
      res.status(500).json({ message: 'failed to update media' });
    }
  });

  // ── Delete ───────────────────────────────────────────────────────────

  app.delete('/api/proposals/:id/media/:mid', requireAuth, async (req: any, res) => {
    try {
      const row = await loadMediaOr404(req, res);
      if (!row) return;
      const { allowed } = await canCurate(req.user.id, !!req.user.isAdmin, row);
      if (!allowed) return res.status(403).json({ message: 'not allowed' });

      const removed = await mediaRepo.deleteById(row.id);
      if (removed) {
        try {
          await unlink(path.join(MEDIA_ROOT, removed.filePath));
        } catch { /* file may be missing — row removal is what matters */ }
        if (removed.thumbPath) {
          try {
            await unlink(path.join(MEDIA_ROOT, removed.thumbPath));
          } catch { /* same — best-effort */ }
        }
      }
      res.json({ ok: true });
    } catch (err: any) {
      logger.error('media delete failed', { err: err?.message });
      res.status(500).json({ message: 'failed to delete media' });
    }
  });

  // ── Global feed ──────────────────────────────────────────────────────

  app.get('/api/feed', async (req, res) => {
    try {
      const kindRaw = (req.query.type as string | undefined);
      const kind = kindRaw === 'podcast' || kindRaw === 'video' ? kindRaw : undefined;
      const cursorRaw = req.query.cursor as string | undefined;
      const cursor = cursorRaw ? parseInt(cursorRaw, 10) : undefined;
      const limit = req.query.limit ? Math.min(50, parseInt(req.query.limit as string, 10)) : 20;
      const rows = await mediaRepo.feed({ kind, cursor: Number.isFinite(cursor!) ? cursor : undefined, limit });
      res.json({
        items: rows,
        nextCursor: rows.length === limit ? rows[rows.length - 1].id : null,
      });
    } catch (err: any) {
      logger.error('feed failed', { err: err?.message });
      res.status(500).json({ message: 'failed to load feed' });
    }
  });

  // ── Public share routes — server-rendered OG tags for unfurls ───────

  app.get('/p/:pid/:kind/:mid', async (req, res, next) => {
    try {
      const pid = parseInt(req.params.pid, 10);
      const mid = parseInt(req.params.mid, 10);
      const kind = req.params.kind;
      if (!Number.isFinite(pid) || !Number.isFinite(mid) || (kind !== 'podcast' && kind !== 'video')) {
        return next();
      }
      const row = await mediaRepo.getById(mid);
      if (!row || row.proposalId !== pid || row.kind !== kind || row.status !== 'published') {
        return next();
      }
      const proposal = await proposalRepo.getProposal(pid);
      if (!proposal) return next();

      const proto = (req.headers['x-forwarded-proto'] as string | undefined) || req.protocol;
      const host = req.get('host');
      const base = `${proto}://${host}`;
      const fileUrl = `${base}/media/${row.filePath}`;
      const thumbUrl = row.thumbPath ? `${base}/media/${row.thumbPath}` : null;
      const platformUrl = `${base}/proposals/${pid}`;
      const title = escapeHtml(proposal.question.slice(0, 120));
      const description = escapeHtml(proposal.solution.slice(0, 200));
      const playerType = kind === 'podcast' ? 'audio' : 'video';

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderSharePage({
        title,
        description,
        fileUrl,
        thumbUrl,
        platformUrl,
        playerType,
        mimeType: row.mimeType,
        permalink: `${base}/p/${pid}/${kind}/${mid}`,
      }));
    } catch (err: any) {
      logger.error('share route failed', { err: err?.message });
      next();
    }
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface ShareCtx {
  title: string;
  description: string;
  fileUrl: string;
  thumbUrl: string | null;
  platformUrl: string;
  playerType: 'audio' | 'video';
  mimeType: string;
  permalink: string;
}

function renderSharePage(ctx: ShareCtx): string {
  const ogType = ctx.playerType === 'audio' ? 'music.song' : 'video.other';
  const twitterCard = ctx.playerType === 'audio' ? 'summary_large_image' : 'player';
  const player = ctx.playerType === 'audio'
    ? `<audio controls preload="metadata" src="${ctx.fileUrl}" style="width:100%"></audio>`
    : `<video controls preload="metadata" ${ctx.thumbUrl ? `poster="${ctx.thumbUrl}"` : ''} style="width:100%;max-height:80vh"><source src="${ctx.fileUrl}" type="${ctx.mimeType}"></video>`;

  return `<!doctype html>
<html lang="el">
<head>
<meta charset="utf-8">
<title>${ctx.title} — AgoraX</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="${ctx.title}">
<meta property="og:description" content="${ctx.description}">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${ctx.permalink}">
${ctx.thumbUrl ? `<meta property="og:image" content="${ctx.thumbUrl}">` : ''}
<meta property="og:${ctx.playerType}" content="${ctx.fileUrl}">
<meta property="og:${ctx.playerType}:type" content="${ctx.mimeType}">
<meta name="twitter:card" content="${twitterCard}">
<meta name="twitter:title" content="${ctx.title}">
<meta name="twitter:description" content="${ctx.description}">
${ctx.thumbUrl ? `<meta name="twitter:image" content="${ctx.thumbUrl}">` : ''}
<style>
body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color:#1a1a1a; }
h1 { font-size: 1.5rem; }
.muted { color: #666; font-size: 0.9rem; }
.cta { display:inline-block; margin-top:1rem; padding:0.6rem 1rem; background:#0e7c66; color:white; text-decoration:none; border-radius:6px; }
.cta:hover { background:#0a5d4d; }
</style>
</head>
<body>
<h1>${ctx.title}</h1>
<p>${ctx.description}</p>
${player}
<p class="muted">Από την κοινότητα της AgoraX.</p>
<a class="cta" href="${ctx.platformUrl}">Διαβάστε όλη την πρόταση & ψηφίστε →</a>
</body>
</html>`;
}
