/**
 * Misc Router
 *
 * Handles misc routes.
 */

import type { Express, Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { votingRepo, proposalRepo } from '../storage';
import { requireAuth, requireAdmin } from '../auth';
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

  app.get('/communities/:id', async (req, res, next) => {
    if (!SOCIAL_BOT_RE.test(req.get('User-Agent') || '')) return next();
    try {
      const id = parseInt(req.params.id, 10);
      const [community] = await db.select().from(communities).where(eq(communities.id, id)).limit(1);
      if (!community) return next();
      const base = `${req.protocol}://${req.get('host')}`;
      const description = `${(community.description ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)} — Κοινότητα στο AgoraX. Συμμετοχή στη διαβούλευση, τις προτάσεις και τις τηλεδιασκέψεις.`.trim();
      res.send(renderOgPage({
        url: `${base}/communities/${id}`,
        title: community.name,
        description,
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
  // ── Android APK download (authenticated users only) ──────────────────
  // Serves the newest downloads/agorax*.apk under its real (versioned)
  // filename, so users can verify which build they received.
  app.get("/api/android/download", requireAuth, async (req, res) => {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.resolve(process.cwd(), 'downloads');
    let newest: { file: string; mtime: number } | null = null;
    try {
      for (const file of fs.readdirSync(dir)) {
        if (!/^agorax.*\.apk$/i.test(file)) continue;
        const mtime = fs.statSync(path.join(dir, file)).mtimeMs;
        if (!newest || mtime > newest.mtime) newest = { file, mtime };
      }
    } catch { /* downloads dir missing → 404 below */ }
    if (!newest) {
      return res.status(404).json({ message: "APK not yet available" });
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${newest.file}"`);
    res.sendFile(path.join(dir, newest.file));
  });

  // ── Early-user feedback ────────────────────────────────────────────────
  // Stores each submission as a JSON file (+ optional screenshot) under
  // feedback/ on the server, for periodic developer review. Deliberately
  // filesystem-based: no admin UI needed, reviewed over SSH.
  const feedbackUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB screenshot cap
  });
  // ── Contact from the login page (no account required) ──────────────────
  // Someone who can't finish registering has no way to say so: the feedback
  // widget is logged-in only, and privacy.tsx / terms.tsx tell people to
  // "contact the administration through the platform" — a channel that did
  // not exist. Same filesystem drop as feedback, reviewed the same way.
  //
  // No auth means no CSRF pairing to lean on, so this is deliberately thin:
  // rate-limited, size-capped, plain text, no uploads.
  const contactLimiter = rateLimit({
    windowMs: 60 * 60_000,
    max: 5,                       // per IP per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Πολλά μηνύματα. Δοκιμάστε ξανά αργότερα." },
  });
  app.post("/api/contact", contactLimiter, async (req: any, res) => {
    try {
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      if (message.length < 10 || message.length > 3000) {
        return res.status(400).json({ message: "Το μήνυμα πρέπει να έχει 10–3000 χαρακτήρες." });
      }
      // Optional: how to reply. Not verified — it's a string someone typed.
      const replyTo = typeof req.body?.replyTo === 'string' ? req.body.replyTo.trim().slice(0, 200) : '';

      const fs = await import('fs');
      const path = await import('path');
      const dir = path.resolve(process.cwd(), 'feedback');
      fs.mkdirSync(dir, { recursive: true });

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(dir, `contact-${stamp}.json`), JSON.stringify({
        kind: 'contact',
        replyTo: replyTo || null,
        message,
        userId: req.user?.id ?? null,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        createdAt: new Date().toISOString(),
      }, null, 2));

      res.status(201).json({ ok: true });
    } catch {
      res.status(500).json({ message: "Το μήνυμα δεν στάλθηκε. Δοκιμάστε ξανά." });
    }
  });

  app.post("/api/feedback", requireAuth, feedbackUpload.single('screenshot'), async (req: any, res) => {
    try {
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      if (message.length < 3 || message.length > 5000) {
        return res.status(400).json({ message: "message must be 3–5000 characters" });
      }
      const page = typeof req.body?.page === 'string' ? req.body.page.slice(0, 300) : '';

      const fs = await import('fs');
      const path = await import('path');
      const dir = path.resolve(process.cwd(), 'feedback');
      fs.mkdirSync(dir, { recursive: true });

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const base = `feedback-${stamp}-u${req.user.id}`;

      let screenshotFile: string | null = null;
      if (req.file && /^image\//.test(req.file.mimetype)) {
        const ext = req.file.mimetype === 'image/png' ? 'png'
          : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
        screenshotFile = `${base}.${ext}`;
        fs.writeFileSync(path.join(dir, screenshotFile), req.file.buffer);
      }

      fs.writeFileSync(path.join(dir, `${base}.json`), JSON.stringify({
        userId: req.user.id,
        username: req.user.username,
        message,
        page,
        userAgent: req.get('user-agent') ?? null,
        screenshot: screenshotFile,
        createdAt: new Date().toISOString(),
      }, null, 2));

      res.status(201).json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to store feedback" });
    }
  });

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
  // ── Feedback triage report (admins only) ───────────────────────────────
  // The feedback/ folder is an append-only pile of JSON drops;
  // scripts/feedback-report.mjs turns it into a browsable page grouped by
  // topic. Serving it from inside the app means it inherits the session
  // cookie and admin check that already guard /admin/accounts — the report
  // quotes users by name, so it must never be world-readable.
  //
  // Registered here rather than as a static file because registerRoutes()
  // runs before serveStatic(), so this wins over the SPA catch-all.
  // Same rule as requireAdmin, but this is a page a person opens in a tab,
  // so a refused visit answers in HTML instead of a bare JSON blob.
  const requireAdminPage = (req: any, res: Response, next: () => void) => {
    if (req.isAuthenticated?.() && req.user?.isAdmin) return next();
    res.status(403).type('html').send(
      '<!doctype html><meta charset="utf-8">'
      + '<title>Χωρίς πρόσβαση</title>'
      + '<body style="font:16px/1.6 system-ui;max-width:34rem;margin:15vh auto;padding:0 1.5rem;color:#14212E">'
      + '<h1 style="font:400 1.6rem Georgia,serif">Χωρίς πρόσβαση</h1>'
      + '<p>Η αναφορά ανατροφοδότησης είναι διαθέσιμη μόνο σε διαχειριστές.</p>'
      + '<p><a href="/" style="color:#0B4C8C">Επιστροφή στο AgoraX</a></p>',
    );
  };

  app.get('/admin/feedback-review', requireAdminPage, async (_req, res) => {
    const fs = await import('fs');
    const path = await import('path');
    const file = path.resolve(process.cwd(), 'feedback', 'review.html');
    if (!fs.existsSync(file)) {
      return res.status(404).type('html').send(
        '<p>Η αναφορά δεν έχει παραχθεί ακόμη. Τρέξτε <code>node scripts/feedback-report.mjs</code>.</p>',
      );
    }
    // Regenerated on every run, and it quotes real people: never cache it.
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.type('html').sendFile(file);
  });

  // ── Διαλογή ανατροφοδότησης (admins only) ──────────────────────────────
  // Μέχρι τώρα η διαλογή γινόταν μόνο με το χέρι, μέσα στο
  // scripts/feedback-report.mjs: για να μπει ένα σχόλιο σε θέμα έπρεπε να
  // ανοίξει κανείς τον κώδικα. Εδώ ο διαχειριστής κάνει την ίδια δουλειά από
  // τη σελίδα — κατατάσσει κάθε σχόλιο σε θέματα και του δίνει προτεραιότητα.
  //
  // Ζει σε feedback/triage.json και όχι στη βάση, γιατί το script τρέχει από
  // το cron χωρίς σύνδεση στη βάση και πρέπει να διαβάζει τις ίδιες αποφάσεις.
  //
  // Οι περιοχές είναι αντίγραφο του THEMES του script. Είναι σκόπιμη
  // επανάληψη: προτιμότερο να χτυπήσει εδώ ένα 400 παρά να δεχτεί ο
  // διακομιστής θέμα που η αναφορά θα πετούσε σιωπηλά.
  const FEEDBACK_THEMES = ['STRUCT', 'PHASE', 'TALK', 'VOTE', 'NOTIF', 'COMM',
    'DISC', 'UI', 'ACCT', 'AI', 'DOC', 'NOISE'];
  const ENTRY_KEY_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
  const SLUG_RE = /^[a-z0-9-]{1,80}$/;

  const triagePath = async () => {
    const path = await import('path');
    return path.resolve(process.cwd(), 'feedback', 'triage.json');
  };

  type TriageStore = { entries: Record<string, any>; topics: Record<string, any> };

  const readTriage = async (): Promise<TriageStore> => {
    const fs = await import('fs');
    const file = await triagePath();
    if (!fs.existsSync(file)) return { entries: {}, topics: {} };
    try {
      const p = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        entries: (p && typeof p.entries === 'object' && p.entries) || {},
        topics: (p && typeof p.topics === 'object' && p.topics) || {},
      };
    } catch {
      // Χαλασμένο αρχείο δεν ρίχνει τη σελίδα: η διαλογή ξαναγίνεται, ένα 500
      // σε κάθε φόρτωση δεν επανορθώνεται.
      return { entries: {}, topics: {} };
    }
  };

  const writeTriage = async (store: TriageStore) => {
    const fs = await import('fs');
    const path = await import('path');
    const file = await triagePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Γράψε-και-μετονόμασε: το cron μπορεί να διαβάζει αυτή τη στιγμή και δεν
    // πρέπει ποτέ να πετύχει μισογραμμένο JSON.
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, ...store }, null, 2));
    fs.renameSync(tmp, file);
  };

  app.get('/api/admin/feedback-triage', requireAdmin, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await readTriage());
  });

  app.put('/api/admin/feedback-triage/:key', requireAdmin, async (req: any, res) => {
    // Το κλειδί είναι το createdAt της καταχώρησης μέχρι δευτερόλεπτο — η
    // διεύθυνσή της και στο script και εδώ.
    const key = String(req.params.key || '');
    if (!ENTRY_KEY_RE.test(key)) {
      return res.status(400).json({ message: 'invalid entry key' });
    }
    const topics = req.body?.topics;
    if (!Array.isArray(topics) || topics.length > 12
      || !topics.every((t: unknown) => typeof t === 'string' && SLUG_RE.test(t))) {
      return res.status(400).json({ message: 'topics must be an array of up to 12 slugs' });
    }
    const prio = Number(req.body?.prio ?? 0);
    if (!Number.isInteger(prio) || prio < 0 || prio > 3) {
      return res.status(400).json({ message: 'prio must be 0, 1, 2 or 3' });
    }

    const store = await readTriage();
    // Η εγγραφή κρατιέται ακόμη κι όταν αδειάζει: «ο διαχειριστής το έβγαλε
    // από κάθε θέμα» είναι απόφαση, και δεν πρέπει στην επόμενη παραγωγή να
    // ξαναγυρίσει σιωπηλά στη διαλογή που έχει καρφωμένη το script.
    store.entries[key] = {
      topics: [...new Set(topics)],
      prio,
      by: req.user?.username ?? '—',
      at: new Date().toISOString(),
    };
    await writeTriage(store);
    res.json({ ok: true, key, entry: store.entries[key] });
  });

  app.post('/api/admin/feedback-topics', requireAdmin, async (req: any, res) => {
    const label = String(req.body?.label ?? '').trim();
    const theme = String(req.body?.theme ?? '');
    if (label.length < 3 || label.length > 160) {
      return res.status(400).json({ message: 'label must be 3–160 characters' });
    }
    if (!FEEDBACK_THEMES.includes(theme)) {
      return res.status(400).json({ message: 'unknown theme' });
    }

    const store = await readTriage();
    // Ίδιος τίτλος δύο φορές δεν φτιάχνει δεύτερο θέμα: επιστρέφουμε το
    // υπάρχον, αλλιώς η διαλογή γεμίζει διπλοεγγραφές που μοιάζουν ίδιες.
    const existing = Object.entries(store.topics)
      .find(([, t]: [string, any]) => String(t?.label ?? '').toLowerCase() === label.toLowerCase());
    if (existing) {
      return res.json({ ok: true, slug: existing[0], topic: existing[1] });
    }

    const { randomBytes } = await import('crypto');
    let slug = '';
    do { slug = `t-${randomBytes(4).toString('hex')}`; } while (store.topics[slug]);

    const topic = { label, theme, status: 'open', by: req.user?.username ?? '—', at: new Date().toISOString() };
    store.topics[slug] = topic;
    await writeTriage(store);
    res.status(201).json({ ok: true, slug, topic });
  });

  // Legacy poll/survey HTTP routes have been retired — proposals are the
  // canonical civic surface. The poll storage methods remain because the
  // social-bot HTML preview route above still resolves poll metadata for
  // shared links that predate the migration.
}