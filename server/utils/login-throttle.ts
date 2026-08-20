/**
 * Per-account login throttling.
 *
 * The existing limiter in `rate-limiter.ts` keys on IP, which does nothing
 * against credential stuffing spread across many addresses: a botnet can try
 * one password per IP against the same account all day. This counts **failed
 * attempts per username** instead.
 *
 * ## Why not account lockout
 *
 * Classic lockout ("5 failures → account frozen for 15 minutes") hands an
 * attacker a denial-of-service primitive: fail logins deliberately and the real
 * member is locked out. On a deliberation platform, locking voters out ahead of
 * a ratification vote *is* the attack.
 *
 * The compromise here: only **failures** count, a success clears the counter
 * immediately, and the threshold is set high enough that a member mistyping a
 * password will never reach it, while bulk guessing against one account does.
 * The exposure is bounded — a throttled account recovers on its own after the
 * window, with no administrator involvement.
 *
 * In-memory, matching `rate-limiter.ts`. State is per-process: a restart clears
 * it, and a multi-process deployment throttles per process. Move both to Redis
 * together when the deployment justifies it.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 20;

type Entry = { failures: number; resetAt: number };

const failures = new Map<string, Entry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of failures.entries()) {
    if (now > entry.resetAt) failures.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

/** Case-insensitive, so `Maria` and `maria` share one bucket. */
function key(username: string): string {
  return username.trim().toLowerCase();
}

function current(username: string): Entry | undefined {
  const entry = failures.get(key(username));
  if (!entry) return undefined;
  if (Date.now() > entry.resetAt) {
    failures.delete(key(username));
    return undefined;
  }
  return entry;
}

/**
 * Is this account currently over its failed-attempt budget?
 * Returns the seconds until the window resets, or `null` when not throttled.
 */
export function throttledFor(username: string): number | null {
  const entry = current(username);
  if (!entry || entry.failures < MAX_FAILURES) return null;
  return Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
}

/** Record one failed login for this account. */
export function recordLoginFailure(username: string): void {
  if (!username) return;
  const entry = current(username) ?? { failures: 0, resetAt: Date.now() + WINDOW_MS };
  entry.failures += 1;
  failures.set(key(username), entry);
}

/** A correct password clears the account's history — no lingering penalty. */
export function clearLoginFailures(username: string): void {
  if (!username) return;
  failures.delete(key(username));
}

/** Ops escape hatch, mirroring `resetRateLimit`. */
export function resetLoginThrottle(): number {
  const n = failures.size;
  failures.clear();
  return n;
}
