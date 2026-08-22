/**
 * Self-service password reset.
 *
 * The token rules are tested as behaviour — utils/password-reset.ts is pure,
 * so valid / expired / used / invalid are real assertions rather than a regex
 * over a route handler. The properties that only exist in the wiring (the
 * uniform response, cancellation of previous tokens, session invalidation,
 * where the token is and is not allowed to appear) are pinned against the
 * source, which is this repo's established way of covering routes without a
 * live database.
 *
 * Nothing here can send mail: no SMTP_* variable is set in the test
 * environment, and the transport reports itself unconfigured and refuses.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  ADMIN_RESET_TTL_MS,
  RESET_REQUESTS_PER_EMAIL_PER_HOUR,
  RESET_REQUESTS_PER_IP_PER_HOUR,
  RESET_TOKEN_BYTES,
  SELF_RESET_TTL_MINUTES,
  SELF_RESET_TTL_MS,
  generateResetToken,
  hashResetToken,
  isResetTokenLive,
} from '../../server/utils/password-reset';

const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const auth = read('server/auth.ts');
const migration = read('migrations/0042_self_service_password_reset.sql');
const mailer = read('server/utils/mailer.ts');
const service = read('server/utils/email-service.ts');
const forgotPage = read('client/src/pages/forgot-password.tsx');
const authPage = read('client/src/pages/auth-page.tsx');

// ─── Token generation ───────────────────────────────────────────────────────

describe('reset token generation', () => {
  it('draws at least 32 cryptographically random bytes, not a GUID', () => {
    expect(RESET_TOKEN_BYTES).toBeGreaterThanOrEqual(32);

    const { token } = generateResetToken();
    // base64url of 32 bytes is 43 chars; a v4 UUID is 36 with dashes.
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/i);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateResetToken().token));
    expect(seen.size).toBe(200);
  });

  it('hands back the SHA-256 that will be stored, never the token itself', () => {
    const { token, tokenHash } = generateResetToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashResetToken(token));
    expect(tokenHash).not.toContain(token);
  });
});

// ─── Token liveness: the four cases ─────────────────────────────────────────

describe('reset token liveness', () => {
  const future = new Date(Date.now() + 10 * 60_000);
  const past = new Date(Date.now() - 10 * 60_000);

  it('accepts a valid token', () => {
    expect(isResetTokenLive({ usedAt: null, expiresAt: future })).toBe(true);
  });

  it('rejects an expired token', () => {
    expect(isResetTokenLive({ usedAt: null, expiresAt: past })).toBe(false);
  });

  it('rejects an already-used token — single use', () => {
    expect(isResetTokenLive({ usedAt: new Date(), expiresAt: future })).toBe(false);
  });

  it('rejects an invalid token — nothing was found for the hash', () => {
    expect(isResetTokenLive(null)).toBe(false);
    expect(isResetTokenLive(undefined)).toBe(false);
  });

  it('rejects a token that expires exactly now, rather than rounding in its favour', () => {
    const now = new Date();
    expect(isResetTokenLive({ usedAt: null, expiresAt: now }, now)).toBe(false);
  });

  it('rejects a used token even when it has not expired yet', () => {
    expect(isResetTokenLive({ usedAt: past, expiresAt: future })).toBe(false);
  });
});

// ─── Expiry windows ─────────────────────────────────────────────────────────

describe('expiry windows', () => {
  it('expires a self-service link within the 20–30 minute band', () => {
    expect(SELF_RESET_TTL_MINUTES).toBeGreaterThanOrEqual(20);
    expect(SELF_RESET_TTL_MINUTES).toBeLessThanOrEqual(30);
    expect(SELF_RESET_TTL_MS).toBe(SELF_RESET_TTL_MINUTES * 60_000);
  });

  it('keeps the out-of-band admin link longer, since it travels by hand', () => {
    expect(ADMIN_RESET_TTL_MS).toBeGreaterThan(SELF_RESET_TTL_MS);
  });
});

// ─── Requesting a link ──────────────────────────────────────────────────────

describe('POST /api/password-reset/request', () => {
  it('answers with one fixed acknowledgement, defined once', () => {
    expect(auth).toMatch(/const RESET_REQUEST_ACK = \{/);
    expect(auth).toMatch(
      /Αν υπάρχει λογαριασμός με αυτή τη διεύθυνση, θα λάβετε σύντομα email επαναφοράς κωδικού/,
    );
    // Exactly one place constructs the body, so an existing and a
    // non-existent address cannot drift apart.
    expect(auth.match(/RESET_REQUEST_ACK/g)?.length).toBe(2);
  });

  it('sends that answer before it looks anything up, so the reply is not timeable', () => {
    const handler = auth.slice(auth.indexOf('app.post("/api/password-reset/request"'));
    const replyAt = handler.indexOf('res.json(RESET_REQUEST_ACK)');
    const lookupAt = handler.indexOf('storage.getUserByEmail');
    expect(replyAt).toBeGreaterThan(-1);
    expect(lookupAt).toBeGreaterThan(replyAt);
  });

  it('never sends a second response on any branch', () => {
    const handler = auth.slice(
      auth.indexOf('app.post("/api/password-reset/request"'),
      auth.indexOf('app.post("/api/password-reset/check"'),
    );
    // Every early exit is a bare `return`, never a res.status(...) that
    // would tell the caller which branch it took.
    expect(handler).not.toMatch(/res\.status\(/);
    expect(handler.match(/res\.json\(/g)?.length).toBe(1);
  });

  it('cancels every outstanding link before minting a new one', () => {
    expect(auth).toMatch(/const retireLiveTokens = async \(userId: number\)/);
    expect(auth).toMatch(/isNull\(passwordResetTokens\.usedAt\)/);
    const handler = auth.slice(auth.indexOf('app.post("/api/password-reset/request"'));
    const retireAt = handler.indexOf('await retireLiveTokens(user.id)');
    const mintAt = handler.indexOf('generateResetToken()');
    expect(retireAt).toBeGreaterThan(-1);
    expect(mintAt).toBeGreaterThan(retireAt);
  });

  it('rate limits per IP and, separately, per address', () => {
    expect(RESET_REQUESTS_PER_IP_PER_HOUR).toBeGreaterThan(0);
    expect(RESET_REQUESTS_PER_EMAIL_PER_HOUR).toBeGreaterThan(0);
    // The per-address ceiling is the tighter of the two: one IP may
    // legitimately serve several members, one address is one person.
    expect(RESET_REQUESTS_PER_EMAIL_PER_HOUR).toBeLessThanOrEqual(
      RESET_REQUESTS_PER_IP_PER_HOUR,
    );
    expect(auth).toMatch(/const resetRequestLimiter = rateLimit\(\{/);
    expect(auth).toMatch(/RESET_REQUESTS_PER_EMAIL_PER_HOUR/);
  });

  it('counts the address before deciding whether it exists', () => {
    const handler = auth.slice(auth.indexOf('app.post("/api/password-reset/request"'));
    expect(handler.indexOf('passwordResetRequests')).toBeLessThan(
      handler.indexOf('storage.getUserByEmail'),
    );
  });

  it('stores the counted address as an HMAC, never in the clear', () => {
    expect(auth).toMatch(/const emailHmac = hmacIdentifier\('reset-email', email\)/);
    expect(auth).not.toMatch(/values\(\{\s*email[,:]/);
    expect(migration).toMatch(/email_hmac TEXT NOT NULL/);
    expect(migration).not.toMatch(/\bemail TEXT\b/);
  });

  it('mints no link for an account that has no password to reset', () => {
    const handler = auth.slice(auth.indexOf('app.post("/api/password-reset/request"'));
    const guard = handler.slice(handler.indexOf('if (!user.password) {'));
    expect(handler).toMatch(/if \(!user\.password\) \{/);
    // Exits before anything is minted…
    expect(guard.indexOf('return;')).toBeLessThan(guard.indexOf('generateResetToken()'));
    // …but tells the mailbox owner why, instead of leaving them waiting.
    expect(guard).toMatch(/template: 'google_account'/);
  });
});

// ─── Completing a reset ─────────────────────────────────────────────────────

describe('POST /api/password-reset', () => {
  const handler = auth.slice(
    auth.indexOf('app.post("/api/password-reset", authLimiter'),
    auth.indexOf('app.post("/api/login"'),
  );

  it('checks the token on page load and again on submit', () => {
    expect(auth).toMatch(/app\.post\("\/api\/password-reset\/check"/);
    expect(handler).toMatch(/await findLiveResetToken\(req\.body\?\.token\)/);
  });

  it('applies the same password policy as registration', () => {
    expect(handler).toMatch(/passwordPolicySchema\.safeParse/);
    const schema = read('shared/schema.ts');
    expect(schema).toMatch(/export const passwordPolicySchema/);
    expect(schema).toMatch(/password: passwordPolicySchema,/);
  });

  it('hashes with the platform scrypt, not something local to this route', () => {
    expect(handler).toMatch(/password: await hashPassword\(password\)/);
    expect(auth).toMatch(/scryptAsync\(password, salt, 64\)/);
  });

  it('burns the token before answering', () => {
    const burnAt = handler.indexOf('.set({ usedAt: new Date() })');
    const respondAt = handler.indexOf('res.json({ ok: true })');
    expect(burnAt).toBeGreaterThan(-1);
    expect(respondAt).toBeGreaterThan(burnAt);
  });

  it('drops every session for the account', () => {
    expect(handler).toMatch(/DELETE FROM user_sessions/);
    expect(handler).toMatch(/sess->'passport'->>'user'/);
  });

  it('does not sign the visitor in', () => {
    expect(handler).not.toMatch(/req\.login\(/);
    expect(handler).not.toMatch(/passport\.authenticate/);
  });

  it('confirms the change by email', () => {
    expect(handler).toMatch(/template: 'password_changed'/);
  });
});

// ─── The token must not leak ────────────────────────────────────────────────

describe('token containment', () => {
  it('never writes the token to a log', () => {
    expect(auth).not.toMatch(/console\.(log|info|warn|error)\([^)]*token/i);
    expect(auth).not.toMatch(/logger\.\w+\([^)]*\btoken\b/i);
  });

  it('keeps the reset link out of the jobs table', () => {
    // Security mail is sent in-process precisely so a live token is never
    // serialised into a queue row.
    expect(service).toMatch(/sendSecurityEmailInBackground/);
    const securityPath = service.slice(
      service.indexOf('export async function sendSecurityEmail'),
      service.indexOf('// ─── Optional mail'),
    );
    expect(securityPath).not.toMatch(/enqueueJob/);
    expect(securityPath).not.toMatch(/enqueueOptionalEmail/);
  });

  it('puts no email address or user id in the reset URL', () => {
    const url = auth.match(/\/reset-password\?token=[^`]*/)?.[0] ?? '';
    expect(url).toContain('token=');
    expect(url).not.toMatch(/email=|user=|uid=|id=/);
  });

  it('builds mail links from configuration, not from a request header', () => {
    const handler = auth.slice(auth.indexOf('app.post("/api/password-reset/request"'));
    expect(handler).toMatch(/\$\{publicUrl\(\)\}\/reset-password/);
    expect(handler).not.toMatch(/req\.get\('host'\)/);
    expect(mailer).toMatch(/APP_PUBLIC_URL/);
  });

  it('logs no recipient, subject or body when a send fails', () => {
    const catchBlock = mailer.slice(mailer.indexOf('} catch (err: any) {'));
    expect(catchBlock).toMatch(/logger\.error\('\[mail\] send failed', \{ error \}\)/);
    expect(catchBlock).not.toMatch(/mail\.to|mail\.subject|mail\.html|mail\.text/);
  });
});

// ─── Automated tests must not reach a mail server ───────────────────────────

describe('mail is inert under test', () => {
  beforeAll(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  it('reports itself unconfigured with no SMTP credentials present', async () => {
    const { isMailConfigured, sendMail, resetTransportForTests } =
      await import('../../server/utils/mailer');
    resetTransportForTests();

    expect(isMailConfigured()).toBe(false);

    const result = await sendMail({
      to: 'nobody@example.invalid',
      subject: 'should never be sent',
      html: '<p>x</p>',
      text: 'x',
    });
    expect(result).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('reads credentials only from the environment — none are in the source', () => {
    expect(mailer).toMatch(/process\.env\.SMTP_USER/);
    expect(mailer).toMatch(/process\.env\.SMTP_PASS/);
    // No literal secret, and no default that would silently work.
    expect(mailer).not.toMatch(/SMTP_PASS\s*\|\|\s*['"]/);
    expect(mailer).not.toMatch(/SMTP_USER\s*\|\|\s*['"]/);
  });
});

// ─── The way in ─────────────────────────────────────────────────────────────

describe('the login form offers a way back in', () => {
  it('links to /forgot-password', () => {
    expect(authPage).toMatch(/href="\/forgot-password"/);
    expect(authPage).toMatch(/t\('auth\.forgotPassword'\)/);
  });

  it('shows the same acknowledgement whatever the server did', () => {
    expect(forgotPage).toMatch(/t\('forgot\.ack'\)/);
    // The catch block deliberately falls through to the same acknowledgement.
    const submit = forgotPage.slice(forgotPage.indexOf('const submit ='));
    expect(submit).toMatch(/setSent\(true\)/);
    expect(submit).not.toMatch(/errorToast|setError/);
  });
});

// ─── The loop actually closes ───────────────────────────────────────────────

describe('a member who resets can then sign in', () => {
  it('accepts the address at login, not only the username', () => {
    const strategy = auth.slice(
      auth.indexOf('new LocalStrategy('),
      auth.indexOf('// Google OAuth Strategy'),
    );
    expect(strategy).toMatch(/storage\.getUserByUsername\(identifier\)/);
    expect(strategy).toMatch(/identifier\.includes\('@'\) \? await storage\.getUserByEmail\(identifier\)/);
  });

  it('tries the username first, so an address cannot shadow a username', () => {
    const strategy = auth.slice(auth.indexOf('new LocalStrategy('));
    expect(strategy.indexOf('getUserByUsername')).toBeLessThan(strategy.indexOf('getUserByEmail'));
  });

  it('still refuses an account with no password, however it was found', () => {
    const strategy = auth.slice(auth.indexOf('new LocalStrategy('));
    expect(strategy).toMatch(/if \(!user\.password \|\| !\(await comparePasswords/);
  });

  it('says so on the form, in both languages', () => {
    expect(authPage).toMatch(/t\('auth\.usernameOrEmail'\)/);
    for (const key of ['auth.usernameOrEmail', 'auth.usernameOrEmailPlaceholder']) {
      expect(read('client/src/locales/el.ts')).toContain(`'${key}'`);
      expect(read('client/src/locales/en.ts')).toContain(`'${key}'`);
    }
  });
});

// ─── Migration ──────────────────────────────────────────────────────────────

describe('0042 migration', () => {
  it('lets a member issue their own link', () => {
    expect(migration).toMatch(/ALTER COLUMN issued_by_id DROP NOT NULL/);
  });

  it('adds the rate-limit table with the indexes the queries need', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS password_reset_requests/);
    expect(migration).toMatch(/password_reset_requests_email_idx/);
    expect(migration).toMatch(/password_reset_requests_ip_idx/);
  });

  it('is additive — it drops nothing and rewrites no existing row', () => {
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/i);
  });
});

// ─── Cleanup ────────────────────────────────────────────────────────────────

describe('cleanup', () => {
  const handlers = read('server/utils/job-handlers.ts');

  it('sweeps spent tokens and stale counters on the existing cleanup job', () => {
    expect(handlers).toMatch(/DELETE FROM password_reset_tokens/);
    expect(handlers).toMatch(/used_at IS NOT NULL OR expires_at </);
    expect(handlers).toMatch(/DELETE FROM password_reset_requests/);
  });
});
