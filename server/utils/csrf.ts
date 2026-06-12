/**
 * CSRF double-submit token middleware.
 *
 * Pattern: server sets a non-HttpOnly cookie containing a random token at
 * first request; clients echo the value as an X-CSRF-Token header on any
 * state-changing request. Same-origin policy prevents a malicious page
 * from reading the cookie, so it cannot construct the header.
 *
 * SameSite=Lax on the session cookie already mitigates most CSRF; this
 * is belt-and-suspenders for the cases where Lax does not cover (e.g.
 * top-level POST navigation from a malicious site, or browser quirks).
 *
 * The token is regenerated per-session (set on first request without
 * one). Skipped for safe methods, the OAuth callback, and the /api/csrf
 * bootstrap endpoint itself.
 */
import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

const CSRF_COOKIE = 'agorax_csrf';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Paths that legitimately cannot carry an X-CSRF-Token header — typically
// because they are loaded by the browser as top-level navigations (OAuth
// redirect callback) rather than by our own JS.
const EXEMPT_PATHS = new Set<string>([
  '/auth/google',
  '/auth/google/callback',
]);

// Pattern exemptions — used for path families where every member is exempt.
// /api/proposals/*/anonymous-vote and the anonymous panel routes are
// deliberately unauthenticated (the whole privacy property depends on no
// session cookie being carried), so there is no session for CSRF to
// protect. Panel routes authenticate via the X-Panel-Token bearer header,
// which a cross-site attacker can neither read nor forge.
const EXEMPT_PATH_PATTERNS: RegExp[] = [
  /^\/api\/proposals\/\d+\/anonymous-vote$/,
  /^\/api\/panel\/register$/,
  /^\/api\/panel\/profile$/,
  /^\/api\/surveys\/\d+\/respond$/,
];

function newToken(): string {
  return randomBytes(32).toString('hex');
}

function ensureToken(req: Request, res: Response): string {
  const existing = (req as any).cookies?.[CSRF_COOKIE] ?? readCookie(req, CSRF_COOKIE);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const token = newToken();
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // intentional — client JS must read it
    sameSite: 'lax',
    secure: process.env.APP_ENV === 'production',
    path: '/',
  });
  return token;
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Always make sure a token cookie exists so the client can mirror it
  // on subsequent state-changing calls.
  ensureToken(req, res);

  if (SAFE_METHODS.has(req.method)) return next();
  if (EXEMPT_PATHS.has(req.path)) return next();
  if (EXEMPT_PATH_PATTERNS.some(rx => rx.test(req.path))) return next();
  // Only enforce on API routes — static assets and SPA shell don't need it.
  if (!req.path.startsWith('/api/')) return next();

  const cookieToken = readCookie(req, CSRF_COOKIE);
  const headerToken = req.headers[CSRF_HEADER];
  const provided = Array.isArray(headerToken) ? headerToken[0] : headerToken;

  if (!cookieToken || !provided || cookieToken !== provided) {
    res.status(403).json({
      code: 'csrf_token_invalid',
      message: 'CSRF token missing or invalid. Reload the page and retry.',
    });
    return;
  }
  next();
}

/** Bootstrap endpoint: a no-op the client calls once on startup to get the cookie set. */
export function csrfBootstrap(req: Request, res: Response): void {
  const token = ensureToken(req, res);
  res.json({ token });
}
