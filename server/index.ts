import express, { type Request, Response, NextFunction } from "express";
import { apiLimit, authLimit } from './utils/rate-limiter';
import { logger } from './utils/logger';
import { csrfBootstrap, csrfMiddleware } from './utils/csrf';
import { initSentry } from './utils/sentry';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { validateRuntimeConfig } from "./config";
import { startJobQueue } from "./utils/job-handlers";

validateRuntimeConfig();
initSentry();

const app = express();

// Inline CORS middleware (replaces the 'cors' package for dev)
const corsAllowlist = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin as string | undefined;
  let allowed = !origin;
  if (!allowed && origin) {
    if (corsAllowlist.includes(origin)) allowed = true;
    if (!allowed && process.env.APP_ENV !== 'production') {
      if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(origin)) allowed = true;
    }
  }
  if (allowed && origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-CSRF-Token');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

app.use(express.json({ limit: "100kb" }));

// Apply rate limiting to all API routes
app.use('/api/', apiLimit);

app.use(express.urlencoded({ extended: false, limit: "100kb" }));

// CSRF bootstrap (clients call this once at startup to get the cookie)
// and double-submit enforcement on state-changing /api/* requests.
app.get('/api/csrf', csrfBootstrap);
app.use(csrfMiddleware);

// GDPR: Exclude vote endpoints from application logging.
// Blind-sign and anonymous-vote paths must not be logged — logging them
// creates a timing correlation vector between authenticated token issuance
// and unauthenticated vote casting, defeating blind-signature unlinkability.
// See docs/compliance/AUDIT_IDENTITY_VOTE_ANONYMITY.md §G7
const VOTE_ENDPOINTS = new Set([
  "/blind-sign",
  "/anonymous-vote",
  "/verify-receipt",
  "/blind-key",
  // Anonymous panel paths — same unlinkability rationale (the enrollment
  // token and panel-token-authenticated requests must not be timestamped
  // next to authenticated /panel/enroll/sign calls in the same log).
  "/panel/register",
  "/panel/me",
  "/panel/profile",
  "/instrument",
  "/respond",
]);

function isVoteEndpoint(path: string): boolean {
  for (const suffix of VOTE_ENDPOINTS) {
    if (path.endsWith(suffix)) return true;
  }
  return false;
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (!path.startsWith("/api")) return;
    if (isVoteEndpoint(path)) return; // GDPR: no logging on vote path
    const duration = Date.now() - start;
    log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);


// ─── Health Check ───────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  
  res.json({
    status: 'healthy',
    uptime_seconds: Math.round(uptime),
    timestamp: new Date().toISOString(),
    memory: {
      rss_bytes: memUsage.rss,
      heap_used_bytes: memUsage.heapUsed,
      heap_total_bytes: memUsage.heapTotal,
    },
    version: process.version,
  });
});


  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error(`${req.method} ${req.path} ${status}: ${err.message || err}`, { method: req.method, path: req.path, status, stack: err.stack });

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve the app on port 3000 (port 5000 conflicts with macOS AirPlay Receiver)
  // this serves both the API and the client.
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  server.listen(port, "0.0.0.0", () => {
    logger.info(`Server started on port ${port}`, { port, env: process.env.NODE_ENV });
    
    // Start background job queue worker
    startJobQueue();
  });
})();
