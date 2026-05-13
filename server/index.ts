import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { apiLimit, authLimit } from './utils/rate-limiter';
import { logger } from './utils/logger';

import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { validateRuntimeConfig } from "./config";
import { startJobQueue } from "./utils/job-handlers";

validateRuntimeConfig();

const app = express();
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
}));
app.use(express.json({ limit: "100kb" }));

// Apply rate limiting to all API routes
app.use('/api/', apiLimit);

app.use(express.urlencoded({ extended: false, limit: "100kb" }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (!path.startsWith("/api")) return;
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
