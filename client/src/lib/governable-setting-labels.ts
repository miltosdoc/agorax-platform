/**
 * Dictionary keys for the governable community settings and their values.
 *
 * The liquid-settings view used to derive its key from the setting name at
 * runtime (`community.${snake_case(key)}`). scripts/check-i18n-keys.mjs only
 * sees literal `t('...')` calls, so it could not check derived keys — which is
 * how `governanceModel`, `joinPolicy`, `requireGovgrVerification` and
 * `maxAmendmentsPerProposal` shipped with no entry at all and showed Greek
 * members the raw string `community.governance_model`.
 *
 * The mapping is explicit here and covered by
 * tests/unit/governable-settings-i18n.test.ts, which fails if any setting or
 * any allowed enum value is missing from either locale.
 */

import {
  GOVERNABLE_SETTING_DESCRIPTORS,
  type GovernableSettingKey,
} from '@shared/governable-settings';

type Translate = (key: string) => string;

export const SETTING_LABEL_KEYS: Record<GovernableSettingKey, string> = {
  governanceModel: 'community.governance_model',
  joinPolicy: 'community.join_policy',
  memberListVisibility: 'community.member_list_visibility',
  contentVisibility: 'community.content_visibility',
  sortitionMode: 'community.sortition_mode',
  synthesisMode: 'community.synthesis_mode',
  requireGovgrVerification: 'community.require_govgr_verification',
  maxConcurrentVotes: 'community.max_concurrent_votes',
  minParticipationPct: 'community.min_participation_pct',
  sortitionSize: 'community.sortition_size',
  sortitionResponseHours: 'community.sortition_response_hours',
  amendmentThreshold: 'community.amendment_threshold',
  amendmentInclusionThreshold: 'community.amendment_inclusion_threshold',
  maxAmendmentsPerProposal: 'community.max_amendments_per_proposal',
  votingMinHours: 'community.rule_decision_min_hours',
  votingMaxHours: 'community.rule_decision_max_hours',
  decisionMajority: 'community.rule_decision_majority',
  statuteEnabled: 'community.rule_statute_enabled',
  statuteMinHours: 'community.rule_statute_min_hours',
  statuteMaxHours: 'community.rule_statute_max_hours',
  statuteMajority: 'community.rule_statute_majority',
  statuteMinParticipationPct: 'community.rule_statute_quorum',
  electionEnabled: 'community.rule_election_enabled',
  electionMinHours: 'community.rule_election_min_hours',
  electionMaxHours: 'community.rule_election_max_hours',
  electionMinParticipationPct: 'community.rule_election_quorum',
  pollEnabled: 'community.rule_poll_enabled',
  pollMinHours: 'community.rule_poll_min_hours',
  pollMaxHours: 'community.rule_poll_max_hours',
  electionNominationsEnabled: 'community.rule_election_nominations',
  pollSuggestionsEnabled: 'community.rule_poll_suggestions',
  constitutionScope: 'community.constitution_scope',
};

/**
 * One-line explanation shown under each setting. Members vote on these values
 * directly, so a bare `0.5` or `-1` is not something they can judge.
 */
export const SETTING_HELP_KEYS: Record<GovernableSettingKey, string> = Object.fromEntries(
  (Object.keys(SETTING_LABEL_KEYS) as GovernableSettingKey[]).map((key) => [
    key,
    `${SETTING_LABEL_KEYS[key]}_help`,
  ]),
) as Record<GovernableSettingKey, string>;

/**
 * Settings stored as a 0-1 ratio. Shown as a percentage, because "0,5" tells a
 * member nothing about what they are voting for.
 */
export const RATIO_SETTINGS: readonly GovernableSettingKey[] = [
  'amendmentThreshold',
  'amendmentInclusionThreshold',
];

/** Value labels for the enum settings live at `${prefix}${value}`. */
export const SETTING_VALUE_KEY_PREFIXES: Partial<Record<GovernableSettingKey, string>> = {
  governanceModel: 'community.governance_',
  joinPolicy: 'community.join_policy_',
  memberListVisibility: 'community.visibility_',
  contentVisibility: 'community.visibility_',
  sortitionMode: 'community.sortition_mode_',
  synthesisMode: 'community.synthesis_mode_',
  decisionMajority: 'community.majority_',
  statuteMajority: 'community.majority_',
  constitutionScope: 'community.constitution_scope_',
};

/**
 * t() returns the key itself when a string is missing, so a bare call can
 * never tell "translated" from "absent". Treat the echo as absent.
 */
function translated(t: Translate, key: string): string | null {
  const value = t(key);
  return value === key ? null : value;
}

export function settingLabel(t: Translate, key: GovernableSettingKey): string {
  return translated(t, SETTING_LABEL_KEYS[key]) ?? key;
}

/** Null when no explanation is written for this setting yet. */
export function settingHelp(t: Translate, key: GovernableSettingKey): string | null {
  return translated(t, SETTING_HELP_KEYS[key]);
}

/**
 * Human wording for a stored value. Falls back to the canonical string, which
 * is what members saw for every setting before this existed.
 */
export function settingValueLabel(t: Translate, key: GovernableSettingKey, value: string): string {
  if (!value) return '—';

  const prefix = SETTING_VALUE_KEY_PREFIXES[key];
  if (prefix) return translated(t, `${prefix}${value}`) ?? value;

  if (RATIO_SETTINGS.includes(key)) {
    const ratio = Number(value);
    if (Number.isFinite(ratio)) return `${Math.round(ratio * 100)}%`;
  }

  const { type, unit } = GOVERNABLE_SETTING_DESCRIPTORS[key];
  if (unit === 'percent') {
    const pct = Number(value);
    if (Number.isFinite(pct)) return `${pct}%`;
  }
  if (unit === 'hours') {
    const hours = Number(value);
    if (Number.isInteger(hours)) return hoursLabel(t, hours);
  }
  if (type === 'boolean') return translated(t, `community.value_${value}`) ?? value;
  // -1 is the sentinel the parser accepts for "no ceiling"; showing it raw
  // reads like a bug rather than a setting.
  if (type === 'unlimited_or_positive_integer' && value === '-1') {
    return translated(t, 'community.value_unlimited') ?? value;
  }
  return value;
}

/**
 * A duration in the words people use: "3 ημέρες", "1 εβδομάδα", "12 ώρες".
 * Shared by the rules ballot and the settings form so both say the same.
 */
export function hoursLabel(t: Translate, hours: number): string {
  if (hours > 0 && hours % 168 === 0) {
    const weeks = hours / 168;
    return weeks === 1 ? t('proposal.dur_week') : t('proposal.dur_weeks').replace('{n}', String(weeks));
  }
  if (hours > 0 && hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? t('proposal.dur_day') : t('proposal.dur_days').replace('{n}', String(days));
  }
  return hours === 1 ? t('proposal.dur_hour') : t('proposal.dur_hours').replace('{n}', String(hours));
}
