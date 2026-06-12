/**
 * Misc Router
 *
 * Handles misc routes.
 */

import type { Express, Request, Response } from 'express';
import { votingRepo, proposalRepo } from '../storage';
import { requireAuth } from '../auth';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { surveyPolls, communities } from '@shared/schema';

const SOCIAL_BOT_RE = /facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|skypeuripreview|slackbot|discordbot|viber|pinterest|redditbot|mastodon/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Minimal OG/Twitter unfurl page for social crawlers. */
function renderOgPage(opts: { url: string; title: string; description: string; image: string }): string {
  const title = escapeHtml(opts.title);
  const description = escapeHtml(opts.description);
  return `<!DOCTYPE html>
<html lang="el">
<head>
    <meta charset="UTF-8">
    <title>${title} - AgoraX</title>
    <meta property="og:type" content="article">
    <meta property="og:url" content="${opts.url}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${opts.image}">
    <meta property="og:site_name" content="AgoraX">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${opts.image}">
    <meta name="description" content="${description}">
</head>
<body>
    <div style="font-family: Arial; max-width: 600px; margin: 2rem auto; padding: 2rem;">
        <h1>${title}</h1>
        <p>${description}</p>
        <a href="${opts.url}" style="background: #2563eb; color: white; padding: 0.5rem 1rem; text-decoration: none; border-radius: 6px; display: inline-block;">Άνοιγμα στο AgoraX</a>
    </div>
</body>
</html>`;
}

export function registerMiscRoutes(app: Express): void {
  // ── Social-crawler OG pages for proposals & survey polls ─────────────
  // Same pattern as the legacy /polls/:id route below: humans fall through
  // to the SPA, preview bots get server-rendered Open Graph tags so links
  // unfurl properly on every social network / messenger.

  app.get('/proposals/:id', async (req, res, next) => {
    if (!SOCIAL_BOT_RE.test(req.get('User-Agent') || '')) return next();
    try {
      const id = parseInt(req.params.id, 10);
      const proposal = await proposalRepo.getProposal(id);
      if (!proposal) return next();
      const [community] = await db.select().from(communities).where(eq(communities.id, proposal.communityId)).limit(1);
      const base = `${req.protocol}://${req.get('host')}`;
      const description = `${(proposal.solution ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)} — Πρόταση στην κοινότητα ${community?.name ?? 'AgoraX'}. Συμμετοχή στη διαβούλευση στο AgoraX.`;
      res.send(renderOgPage({
        url: `${base}/proposals/${id}`,
        title: proposal.question,
        description,
        image: `${base}/logo-share.png`,
      }));
    } catch {
      next();
    }
  });

  app.get('/surveys/:id', async (req, res, next) => {
    if (!SOCIAL_BOT_RE.test(req.get('User-Agent') || '')) return next();
    try {
      const id = parseInt(req.params.id, 10);
      const [poll] = await db.select().from(surveyPolls).where(eq(surveyPolls.id, id)).limit(1);
      if (!poll || (poll.status !== 'live' && poll.status !== 'closed')) return next();
      const base = `${req.protocol}://${req.get('host')}`;
      const tierNote = poll.tier === 'certified'
        ? 'Πιστοποιημένη δημοσκόπηση AgoraX'
        : 'Κοινοτική (ανεπίσημη) δημοσκόπηση';
      const action = poll.status === 'live'
        ? '🗳️ Συμμετοχή τώρα — ανώνυμα, με πλήρη μεθοδολογική διαφάνεια.'
        : 'Δείτε τα αποτελέσματα και τη μεθοδολογία.';
      res.send(renderOgPage({
        url: `${base}/surveys/${id}`,
        title: poll.title,
        description: `${tierNote} · ${poll.topicTag}. ${action}`,
        image: `${base}/logo-share.png`,
      }));
    } catch {
      next();
    }
  });

  app.get("/polls/:id", async (req, res, next) => {
    const userAgent = req.get('User-Agent') || '';
    // Detect social media crawlers and preview bots
    const isSocialBot = /facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|skypeuripreview|slackbot|discordbot/i.test(userAgent);
    if (!isSocialBot) {
      // Regular users - let frontend handle this route
      return next();
    }
    // Social bots - serve SEO-optimized HTML with Open Graph tags
    try {
      const pollId = parseInt(req.params.id);
      const poll = await votingRepo.getPoll(pollId);
      if (!poll) {
        return next(); // Let frontend handle 404
      }
      const results = await votingRepo.getPollResults(pollId);
      const totalVotes = results.reduce((sum, result) => sum + result.voteCount, 0);
      const isActive = new Date(poll.endDate) > new Date();
      // Clean description without HTML tags
      const cleanDescription = poll.description
        ? poll.description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
        : '';
      // Optimized description for social sharing
      const shareDescription = cleanDescription
        ? `${cleanDescription.substring(0, 150)}... 🗳️ Ψηφίστε στο AgoraX!`
        : `🗳️ Συμμετέχετε στην ψηφοφορία και εκφράστε τη γνώμη σας!`;
      const pollUrl = `${req.protocol}://${req.get('host')}/polls/${pollId}`;
      const ogImage = `${req.protocol}://${req.get('host')}/api/og-image/${pollId}?v=3`;
      const html = `<!DOCTYPE html>
<html lang="el">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${poll.title} - AgoraX</title>
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="article">
    <meta property="og:url" content="${pollUrl}">
    <meta property="og:title" content="${poll.title}">
    <meta property="og:description" content="${shareDescription}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:type" content="image/png">
    <meta property="og:site_name" content="AgoraX">
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${poll.title}">
    <meta name="twitter:description" content="${shareDescription}">
    <meta name="twitter:image" content="${ogImage}">
    <meta name="description" content="${shareDescription}">
</head>
<body>
    <div style="font-family: Arial; max-width: 600px; margin: 2rem auto; padding: 2rem;">
        <h1>${poll.title}</h1>
        <p>${cleanDescription}</p>
        <p>Κατηγορία: ${poll.category} • Ψήφοι: ${totalVotes} • ${isActive ? 'Ενεργή' : 'Κλειστή'}</p>
        <a href="${pollUrl}" style="background: #2563eb; color: white; padding: 0.5rem 1rem; text-decoration: none; border-radius: 6px; display: inline-block;">Δείτε την ψηφοφορία</a>
    </div>
</body>
</html>`;
      res.send(html);
    } catch (error) {
      next();
    }
  });
  app.get("/api/og-image/:id", async (req, res) => {
    try {
      const pollId = parseInt(req.params.id);
      const poll = await votingRepo.getPoll(pollId);
      if (!poll) {
        return res.status(404).send("Poll not found");
      }
      const { createCanvas, loadImage } = await import('canvas');
      const path = await import('path');
      // Standard OpenGraph size: 1200x630
      const width = 1200;
      const height = 630;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      // Clean white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      // Load and draw logo (centered)
      try {
        const logoPath = path.resolve(process.cwd(), 'client/public/logo-share.png');
        const logo = await loadImage(logoPath);
        const logoSize = 200;
        const logoX = (width - logoSize) / 2;
        const logoY = (height - logoSize) / 2;
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
      } catch (err) {
        // If logo fails to load, show AgoraX text instead
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 64px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('AgoraX', width / 2, height / 2);
      }
      // Convert to PNG buffer
      const pngBuffer = canvas.toBuffer('image/png');
      // Serve PNG with caching headers
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Disposition', 'inline; filename="poll-preview.png"');
      res.send(pngBuffer);
    } catch (error) {
      res.status(500).send("Error generating image");
    }
  });
  // Protected route middleware
  const requireAuth = (req: any, res: any, next: any) => {
    // Demo mode: bypass auth, use user 3 (maria) as demo user — author of proposal 1
    if (process.env.DEMO_MODE === 'true') {
      if (!req.user) {
        req.user = {
          id: 3,
          username: 'demo',
          email: 'demo@agorax.gr',
          name: 'Demo User',
          profilePicture: null,
          isAdmin: true,
          govgrVerified: true,
          locationConfirmed: false,
          locationVerified: false,
        };
        req.isAuthenticated = () => true;
      }
      return next();
    }
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };
  app.get("/api/health", async (req, res) => {
    try {
      const { db } = await import('../db');
      await db.execute('SELECT 1');
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
        version: '0.1.0'
      });
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: String(error)
      });
    }
  });
  // Legacy poll/survey HTTP routes have been retired — proposals are the
  // canonical civic surface. The poll storage methods remain because the
  // social-bot HTML preview route above still resolves poll metadata for
  // shared links that predate the migration.
}