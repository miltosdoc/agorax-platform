/**
 * Rate Limiting Middleware
 *
 * Simple in-memory rate limiter for API endpoints.
 * For production, replace with Redis-backed limiter (express-rate-limit).
 */

import type { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store — replace with Redis in production
const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function rateLimit({
  windowMs = 15 * 60 * 1000, // 15 minutes
  maxRequests = 100,
  keyGenerator = (req: Request) => req.ip || 'unknown',
}: {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (req: Request) => string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const current = store.get(key) || { count: 0, resetAt: now + windowMs };

    // Reset if window has expired
    if (now > current.resetAt) {
      current.count = 0;
      current.resetAt = now + windowMs;
    }

    current.count += 1;
    store.set(key, current);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - current.count)));
    res.setHeader('X-RateLimit-Reset', String(current.resetAt));

    if (current.count > maxRequests) {
      res.status(429).json({
        message: 'Too many requests, please try again later.',
        retryAfter: Math.ceil((current.resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}

// Pre-configured limiters for common use cases.
// Dev gets generous limits so HMR polling + iteration doesn't lock you out.
// "Dev" here means NODE_ENV !== 'production'. APP_ENV='production' is the
// real production deploy switch — see server/config.ts. Limits are tuned
// for normal browser use: a single SPA load can fire 10–20 /api/* calls.
const isDev = process.env.NODE_ENV !== 'production';

export const apiLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: isDev ? 10000 : 600,
});
export const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: isDev ? 1000 : 30,
});
export const votingLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: isDev ? 1000 : 15,
});

/**
 * Drop any rate-limit state for the given key prefix. Used at startup
 * and for ops "unblock me" actions — restarting the process already
 * clears the in-memory store, but this lets callers do it without
 * cycling Node.
 */
export function resetRateLimit(prefix?: string): number {
  let cleared = 0;
  for (const key of Array.from(store.keys())) {
    if (!prefix || key.startsWith(prefix)) {
      store.delete(key);
      cleared++;
    }
  }
  return cleared;
}
