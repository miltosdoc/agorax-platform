// Settings that autonomous communities decide by liquid majority vote.
//
// For every key in GOVERNABLE_SETTING_KEYS the autonomous-community flow:
//   1. accepts members' votes as a string via PUT /api/communities/:id/setting-votes/:key
//   2. validates the string through parseGovernableSetting
//   3. tallies all (community, key) votes — plurality wins, ties keep current
//   4. writes the canonical string back to the matching communities column
//
// Keys NOT in this list (name, description, type) are lifecycle/identity
// changes; only the founder can flip them, never the community at large.

import {
  COMMUNITY_GOVERNANCE_MODELS,
  COMMUNITY_SORTITION_MODES,
  COMMUNITY_SYNTHESIS_MODES,
  COMMUNITY_JOIN_POLICIES,
  COMMUNITY_VISIBILITY_LEVELS,
  type CommunityGovernanceModel,
  type CommunitySortitionMode,
  type CommunityJoinPolicy,
} from './community-settings';

export const GOVERNABLE_SETTING_KEYS = [
  'governanceModel',
  'joinPolicy',
  'memberListVisibility',
  'contentVisibility',
  'sortitionMode',
  'synthesisMode',
  'requireGovgrVerification',
  'maxConcurrentVotes',
  'minParticipationPct',
  'sortitionSize',
  'sortitionResponseHours',
  'amendmentThreshold',
  'amendmentInclusionThreshold',
  'maxAmendmentsPerProposal',
] as const;
export type GovernableSettingKey = typeof GOVERNABLE_SETTING_KEYS[number];

export type GovernableSettingType = 'enum' | 'boolean' | 'integer' | 'unlimited_or_positive_integer' | 'decimal';

export interface GovernableSettingDescriptor {
  key: GovernableSettingKey;
  type: GovernableSettingType;
  allowed?: readonly string[];
  min?: number;
  max?: number;
}

export const GOVERNABLE_SETTING_DESCRIPTORS: Record<GovernableSettingKey, GovernableSettingDescriptor> = {
  governanceModel:               { key: 'governanceModel',               type: 'enum',    allowed: COMMUNITY_GOVERNANCE_MODELS },
  joinPolicy:                    { key: 'joinPolicy',                    type: 'enum',    allowed: COMMUNITY_JOIN_POLICIES },
  // Two-choice toggles: with two options the plurality tally is a straight
  // majority — 50%+1 of cast votes flips the value, ties keep the current one.
  memberListVisibility:          { key: 'memberListVisibility',          type: 'enum',    allowed: COMMUNITY_VISIBILITY_LEVELS },
  contentVisibility:             { key: 'contentVisibility',             type: 'enum',    allowed: COMMUNITY_VISIBILITY_LEVELS },
  sortitionMode:                 { key: 'sortitionMode',                 type: 'enum',    allowed: COMMUNITY_SORTITION_MODES },
  synthesisMode:                 { key: 'synthesisMode',                 type: 'enum',    allowed: COMMUNITY_SYNTHESIS_MODES },
  requireGovgrVerification:      { key: 'requireGovgrVerification',      type: 'boolean' },
  maxConcurrentVotes:            { key: 'maxConcurrentVotes',            type: 'unlimited_or_positive_integer' },
  minParticipationPct:           { key: 'minParticipationPct',           type: 'decimal', min: 0,    max: 100 },
  sortitionSize:                 { key: 'sortitionSize',                 type: 'integer', min: 3,    max: 500 },
  sortitionResponseHours:        { key: 'sortitionResponseHours',        type: 'integer', min: 1,    max: 720 },
  amendmentThreshold:            { key: 'amendmentThreshold',            type: 'decimal', min: 0,    max: 1 },
  amendmentInclusionThreshold:   { key: 'amendmentInclusionThreshold',   type: 'decimal', min: 0,    max: 1 },
  maxAmendmentsPerProposal:      { key: 'maxAmendmentsPerProposal',      type: 'unlimited_or_positive_integer' },
};

/**
 * Governable settings withdrawn from the ballot.
 *
 * The key stays in the union above on purpose: existing vote rows and the
 * stored community column keep their meaning, admins still cannot edit it
 * behind the community's back through PATCH, and restoring it is a one-line
 * change. It is simply not offered, not shown and not votable.
 *
 * requireGovgrVerification: nothing in the codebase reads it — no route, no
 * guard, no screen. gov.gr verification is not part of the product today, so
 * putting an inert flag on the ballot asks members to decide something that
 * has no effect. Take it off this list the day something enforces it.
 */
export const RETIRED_GOVERNABLE_SETTING_KEYS = ['requireGovgrVerification'] as const;

/** The settings members actually vote on. */
export const ACTIVE_GOVERNABLE_SETTING_KEYS: readonly GovernableSettingKey[] =
  GOVERNABLE_SETTING_KEYS.filter(
    (key) => !(RETIRED_GOVERNABLE_SETTING_KEYS as readonly string[]).includes(key),
  );

export function isGovernableSettingKey(value: unknown): value is GovernableSettingKey {
  return typeof value === 'string' && (GOVERNABLE_SETTING_KEYS as readonly string[]).includes(value);
}

/** A retired key is still a known key, but no new vote may be cast on it. */
export function isActiveGovernableSettingKey(value: unknown): value is GovernableSettingKey {
  return isGovernableSettingKey(value)
    && !(RETIRED_GOVERNABLE_SETTING_KEYS as readonly string[]).includes(value);
}

/**
 * Validate a raw client-supplied value for a governable setting and return
 * its canonical string form (the form stored in community_setting_votes and
 * written back to the communities column). Throws on invalid input.
 */
export function parseGovernableSetting(key: GovernableSettingKey, raw: unknown): string {
  const desc = GOVERNABLE_SETTING_DESCRIPTORS[key];
  switch (desc.type) {
    case 'enum': {
      const str = String(raw);
      if (!(desc.allowed as readonly string[]).includes(str)) {
        throw new Error(`Invalid value for ${key}`);
      }
      return str;
    }
    case 'boolean': {
      if (raw === true || raw === 'true') return 'true';
      if (raw === false || raw === 'false') return 'false';
      throw new Error(`Boolean value required for ${key}`);
    }
    case 'integer': {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < (desc.min ?? -Infinity) || n > (desc.max ?? Infinity)) {
        throw new Error(`Integer out of range for ${key}`);
      }
      return String(n);
    }
    case 'unlimited_or_positive_integer': {
      const n = Number(raw);
      if (!Number.isInteger(n) || n === 0 || n < -1) throw new Error(`Value out of range for ${key}`);
      return String(n);
    }
    case 'decimal': {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < (desc.min ?? -Infinity) || n > (desc.max ?? Infinity)) {
        throw new Error(`Decimal out of range for ${key}`);
      }
      return String(raw).trim();
    }
  }
}

/**
 * Convert a canonical string back to the value shape used for the community
 * row update. Booleans become real booleans, integers become numbers; enum
 * and decimal stay as strings (the columns store text/numeric and the ORM
 * accepts strings for numeric).
 */
export function unparseGovernableSetting(key: GovernableSettingKey, canonical: string): boolean | number | string {
  const desc = GOVERNABLE_SETTING_DESCRIPTORS[key];
  switch (desc.type) {
    case 'boolean': return canonical === 'true';
    case 'integer': return parseInt(canonical, 10);
    case 'unlimited_or_positive_integer': return parseInt(canonical, 10);
    case 'decimal': return canonical;
    case 'enum': return canonical;
  }
}

/**
 * Read the canonical string form of a setting from a community row, so the
 * "current value" tally for autonomous members lines up with what's stored.
 */
export function readCurrentSetting(community: Record<string, unknown>, key: GovernableSettingKey): string {
  const raw = community[key];
  if (raw === null || raw === undefined) return '';
  return typeof raw === 'string' ? raw : String(raw);
}
