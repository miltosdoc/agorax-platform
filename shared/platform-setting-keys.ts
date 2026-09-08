/**
 * The platform settings an administrator may write over HTTP.
 *
 * The storage layer upserts whatever key it is handed, so without a list here
 * a typo silently creates a setting nothing reads, and a guess creates one
 * something does read. Both failures are quiet, which is the worst kind.
 *
 * Deliberately absent: `economy.phase` and `economy.pointsPerEur`. Those
 * decide whether Democracy Points can be redeemed for real value and at what
 * rate, and they are not a form field — moving them is a decision about the
 * platform's finances that should be made deliberately at the database, with
 * whatever approval that deserves, not clicked in a settings screen.
 */

export const WRITABLE_PLATFORM_SETTING_KEYS: readonly string[] = [
  // Identity
  'platform_name',
  'platform_description',
  'default_community_type',
  'default_language',
  // Proposal defaults
  'proposal_min_participation',
  'proposal_debate_period_days',
  'proposal_voting_period_days',
  'proposal_sortition_size',
  // Sortition
  'sortition_response_deadline_hours',
  'sortition_max_members',
  'sortition_min_score_pass',
  // Notifications
  'notifications_email_enabled',
  'notifications_inapp_enabled',
];

export function isWritablePlatformSettingKey(key: unknown): key is string {
  return typeof key === 'string' && WRITABLE_PLATFORM_SETTING_KEYS.includes(key);
}
