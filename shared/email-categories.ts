/**
 * The optional-email catalogue.
 *
 * One entry per category a member can switch on or off. Adding a category is
 * an entry here plus two locale strings — the preferences table stores a jsonb
 * map, so nothing needs a migration.
 *
 * A notification type that is not mapped in NOTIFICATION_EMAIL_CATEGORY gets
 * no email at all. That is the default on purpose: in-app notifications are
 * cheap and a member's inbox is not. A type earns an email by being listed.
 *
 * Security mail is not in this file. Password reset, password-changed and
 * email-changed notices are sent through a separate path that never consults
 * preferences, so there is no category key that could switch them off.
 */

export type EmailCategoryKey =
  /** New proposals worth reading in a community the member belongs to. */
  | 'community_proposals'
  /** A ratification vote or a poll the member is eligible to take part in. */
  | 'votes_and_polls'
  /** Movement on a proposal the member authored, amended, or voted on. */
  | 'followed_proposals';

export interface EmailCategoryDef {
  key: EmailCategoryKey;
  /** i18n key for the switch label. */
  labelKey: string;
  /** i18n key for the one-line explanation under the switch. */
  descriptionKey: string;
  /**
   * What happens when a member has never touched this switch. All three
   * ship enabled — they are the reason someone would want email at all —
   * but the field exists so a noisier future category can ship off.
   */
  defaultEnabled: boolean;
}

export const EMAIL_CATEGORIES: readonly EmailCategoryDef[] = [
  {
    key: 'community_proposals',
    labelKey: 'emailPrefs.category.communityProposals',
    descriptionKey: 'emailPrefs.category.communityProposalsHint',
    defaultEnabled: true,
  },
  {
    key: 'votes_and_polls',
    labelKey: 'emailPrefs.category.votesAndPolls',
    descriptionKey: 'emailPrefs.category.votesAndPollsHint',
    defaultEnabled: true,
  },
  {
    key: 'followed_proposals',
    labelKey: 'emailPrefs.category.followedProposals',
    descriptionKey: 'emailPrefs.category.followedProposalsHint',
    defaultEnabled: true,
  },
] as const;

export const EMAIL_CATEGORY_KEYS: readonly EmailCategoryKey[] =
  EMAIL_CATEGORIES.map((c) => c.key);

export function isEmailCategoryKey(value: unknown): value is EmailCategoryKey {
  return typeof value === 'string'
    && (EMAIL_CATEGORY_KEYS as readonly string[]).includes(value);
}

export function categoryDefault(key: EmailCategoryKey): boolean {
  return EMAIL_CATEGORIES.find((c) => c.key === key)?.defaultEnabled ?? false;
}

/**
 * Which in-app notification types also justify an email, and under which
 * category. Anything absent stays in-app only.
 *
 * `sortition_assigned` is deliberately absent even though it is the most
 * consequential notification on the platform: being drawn for a jury has its
 * own deadline-driven reminder path, and folding it into an opt-out category
 * would let a member switch off the one message they cannot afford to miss.
 * If it ever gets email, it belongs with the security mail that ignores
 * preferences, not here.
 */
export const NOTIFICATION_EMAIL_CATEGORY: Readonly<Record<string, EmailCategoryKey>> = {
  new_proposal: 'community_proposals',
  vote_started: 'votes_and_polls',
  proposal_advanced: 'followed_proposals',
  amendment_ready: 'followed_proposals',
  deliberation_reminder: 'followed_proposals',
};

export function emailCategoryForNotification(type: string): EmailCategoryKey | null {
  return NOTIFICATION_EMAIL_CATEGORY[type] ?? null;
}

/** The stored shape of the jsonb column. Absent key → categoryDefault(). */
export type EmailCategoryMap = Partial<Record<EmailCategoryKey, boolean>>;

/**
 * Resolve one category against a stored preference row.
 * The master switch wins over everything — that is the whole point of it.
 */
export function isCategoryEnabled(
  prefs: { masterEnabled: boolean; categories: EmailCategoryMap },
  key: EmailCategoryKey,
): boolean {
  if (!prefs.masterEnabled) return false;
  const stored = prefs.categories?.[key];
  // Anything that is not a stored boolean — absent, null, a string left by
  // an older write — counts as "never answered" and takes the declared
  // default. Reading a malformed value as a decision either way would be
  // inventing an answer the member never gave.
  return typeof stored === 'boolean' ? stored : categoryDefault(key);
}
