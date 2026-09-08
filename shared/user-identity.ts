/**
 * The member's public label.
 *
 * One field is shown wherever a member appears — the username — and it is the
 * only one. `users.name` is account data: it addresses their email and it is
 * theirs to read, but it is never published. The platform used to do both at
 * once, showing the real name in the forum and in conference calls while
 * proposals and deliberation showed "User #6", so the same person appeared
 * three different ways depending on which page you were on.
 *
 * Username, not name, because the label sits beside a political position and
 * a ballot: it has to be unique, it is already what people type at each other
 * (`@handle` in community invitations), and a handle keeps an argument
 * contestable without making a member's politics permanently searchable under
 * their legal name.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/**
 * Latin lowercase only, deliberately.
 *
 * The platform is Greek-first and it is tempting to allow Greek handles. It
 * cannot: Greek ο, ν, α and Latin o, v, a are different characters that draw
 * the same shape, so `@νικος` and `@vikos` are indistinguishable in a list of
 * members while resolving to two different people. On a platform where a
 * handle attributes a political argument, that is an impersonation tool. The
 * display name keeps full Unicode; the addressable handle does not.
 */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/;

/** How long a member must wait between renames, in days. */
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

/**
 * Handles nobody may claim.
 *
 * Two kinds: names that would let a member pass as the platform itself, and
 * names that read as a role. Someone posting a proposal as `@moderator` is
 * borrowing an authority the platform never gave them.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  'admin', 'admins', 'administrator', 'agorax', 'agora', 'api', 'anonymous',
  'everyone', 'help', 'me', 'moderator', 'moderators', 'null', 'official',
  'root', 'staff', 'support', 'system', 'undefined', 'user', 'users',
  // Greek transliterations of the same roles, which read as official here.
  'diaxeiristis', 'diachiristis', 'ypostirixi', 'systima',
];

export type UsernameRejection =
  | 'too_short' | 'too_long' | 'charset' | 'reserved' | 'taken';

/** Lowercase and trim; a leading @ is what people type, not part of the handle. */
export function normalizeUsername(raw: unknown): string {
  return String(raw ?? '').trim().replace(/^@+/, '').toLowerCase();
}

/**
 * Shape-checks a handle. Uniqueness is the caller's job — it needs the
 * database — and 'taken' exists in the rejection type for that caller to use.
 */
export function validateUsername(raw: unknown): { ok: true; username: string } | { ok: false; reason: UsernameRejection } {
  const username = normalizeUsername(raw);
  if (username.length < USERNAME_MIN_LENGTH) return { ok: false, reason: 'too_short' };
  if (username.length > USERNAME_MAX_LENGTH) return { ok: false, reason: 'too_long' };
  if (!USERNAME_PATTERN.test(username)) return { ok: false, reason: 'charset' };
  if (RESERVED_USERNAMES.includes(username)) return { ok: false, reason: 'reserved' };
  return { ok: true, username };
}

/**
 * When this member may rename again, or null if they may now.
 *
 * A handle is an identity anchor other people cite, so it changes seldom
 * rather than freely. Never having renamed means never having waited.
 */
export function usernameChangeAvailableAt(lastChangedAt: Date | string | null | undefined): Date | null {
  if (!lastChangedAt) return null;
  const last = lastChangedAt instanceof Date ? lastChangedAt : new Date(lastChangedAt);
  if (Number.isNaN(last.getTime())) return null;
  const next = new Date(last.getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  return next > new Date() ? next : null;
}

/**
 * The label to show for a member, anywhere they appear.
 *
 * Everything that renders a member goes through here, so no surface can drift
 * back to showing a real name. The numeric fallback is for a member whose row
 * is gone — a deleted account still has authored arguments on the record.
 */
export function publicLabel(user: { username?: string | null; id?: number | null } | null | undefined): string {
  const username = user?.username?.trim();
  if (username) return username;
  return user?.id ? `#${user.id}` : '—';
}
