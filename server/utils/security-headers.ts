/**
 * Security response headers (helmet) + Content-Security-Policy.
 *
 * The CSP ships in **Report-Only** mode by default. A wrong `connect-src`
 * silently kills the LiveKit conference rooms, and a policy that breaks a
 * live deliberation is worse than no policy at all — so the browser reports
 * violations without blocking anything until an operator has watched the
 * reports and flipped `CSP_ENFORCE=true`.
 *
 * The app is unusually well placed for a strict policy: `client/index.html`
 * carries **no inline <script>** and loads nothing from a CDN, so `script-src`
 * needs no `'unsafe-inline'` / `'unsafe-eval'` escape hatch.
 *
 * `'unsafe-inline'` on `style-src` is deliberate and not removable in practice:
 * React `style={{…}}` props become inline style attributes. Nonces cannot cover
 * them.
 */

import helmet from "helmet";
import type { RequestHandler } from "express";

/** Comma-separated env list → trimmed, non-empty entries. */
function envList(name: string): string[] {
  return (process.env[name] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Where the browser is allowed to open connections: the app itself, the
 * LiveKit signalling socket, and anything an operator adds (e.g. Sentry).
 *
 * `LIVEKIT_URL` is a `wss://` origin. In dev we also allow the Vite HMR socket.
 */
function connectSrc(): string[] {
  const out = new Set<string>(["'self'"]);

  const livekit = (process.env.LIVEKIT_URL ?? "").trim();
  if (livekit) {
    try {
      out.add(new URL(livekit).origin);
    } catch {
      // Malformed LIVEKIT_URL: skip rather than emit a broken directive.
    }
  }

  for (const extra of envList("CSP_CONNECT_SRC_EXTRA")) out.add(extra);

  if (process.env.APP_ENV !== "production") {
    out.add("ws:");
    out.add("wss:");
  }

  return [...out];
}

export function securityHeaders(): RequestHandler[] {
  const enforce = process.env.CSP_ENFORCE === "true";

  const directives: Record<string, string[]> = {
    defaultSrc: ["'self'"],
    // No inline scripts anywhere in the app — keep it that way.
    scriptSrc: ["'self'"],
    // Required by React inline style attributes; see module comment.
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    imgSrc: ["'self'", "data:", "blob:"],
    // blob: covers recorded/uploaded proposal media played back in the browser.
    mediaSrc: ["'self'", "blob:"],
    connectSrc: connectSrc(),
    workerSrc: ["'self'", "blob:"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  };

  if (process.env.CSP_REPORT_URI) {
    directives.reportUri = [process.env.CSP_REPORT_URI];
  }

  return [
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives, reportOnly: !enforce },
      // HSTS is only meaningful over TLS and is the reverse proxy's call in
      // most deployments; enable it when the app itself terminates HTTPS.
      hsts: process.env.APP_ENV === "production",
      // The app is same-origin; COEP breaks third-party media embeds and buys
      // nothing here.
      crossOriginEmbedderPolicy: false,
      // Referrers leak proposal ids into third-party logs.
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  ];
}
