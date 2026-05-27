/**
 * Sentry error monitoring with PII redaction.
 *
 * Active only when SENTRY_DSN is set in the environment. The beforeSend
 * hook strips request bodies and query params on any Art. 9 route so a
 * captured exception never leaks political-opinion content to Sentry.
 * Headers known to carry credentials are also stripped.
 *
 * Per docs/compliance/ROPA.md, Sentry (if used) becomes a processor and
 * must be listed there with a signed DPA before production use.
 */
import * as Sentry from '@sentry/node';

const PII_SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /\/api\/proposals\/\d+\/vote/,
  /\/api\/proposals\/\d+\/support/,
  /\/api\/proposals\/\d+\/arguments/,
  /\/api\/proposals\/\d+\/debate/,
  /\/api\/proposals\/\d+\/amendments/,
  /\/api\/communities\/\d+\/proposals/,
  /\/api\/amendments\/\d+\/(rejection-)?vote/,
  /\/api\/user\/consent(\/.*)?/,
  /\/api\/user\/data-export/,
  /\/api\/user\/erasure-request/,
  /\/api\/user\/verify-govgr/,
  /\/api\/register/,
  /\/api\/login/,
];

function isSensitiveUrl(url: string | undefined): boolean {
  if (!url) return false;
  return PII_SENSITIVE_PATH_PATTERNS.some(rx => rx.test(url));
}

export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.GIT_SHA,
    // Default sample rates conservative — adjust per deployment volume.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      try {
        const req = event.request;
        if (!req) return event;

        const url = req.url ?? '';
        if (isSensitiveUrl(url)) {
          // Total scrub: body, query, cookies on Art. 9 routes.
          if (req.data) req.data = '[redacted: Art. 9 route]';
          if (req.query_string) req.query_string = '[redacted]';
          if (req.cookies) req.cookies = { _: '[redacted]' };
          if (req.headers) {
            for (const k of Object.keys(req.headers)) {
              const lk = k.toLowerCase();
              if (
                lk === 'cookie' ||
                lk === 'authorization' ||
                lk === 'x-csrf-token'
              ) {
                req.headers[k] = '[redacted]';
              }
            }
          }
        } else {
          // Non-sensitive route: still strip auth-shaped headers.
          if (req.headers) {
            for (const k of Object.keys(req.headers)) {
              const lk = k.toLowerCase();
              if (lk === 'cookie' || lk === 'authorization') {
                req.headers[k] = '[redacted]';
              }
            }
          }
        }
      } catch {
        // Never let redaction failure prevent reporting.
      }
      return event;
    },
  });

  return true;
}

export { Sentry };
