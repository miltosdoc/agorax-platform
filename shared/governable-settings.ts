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

import { MAJORITY_RULES, type ProposalKind } from './proposal-kinds';
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
  // The terms for each kind of vote (migration 0055). An autonomous
  // community has no admins, so its members set these by vote like the rest.
  'votingMinHours',
  'votingMaxHours',
  'decisionMajority',
  'statuteEnabled',
  'statuteMinHours',
  'statuteMaxHours',
  'statuteMajority',
  'statuteMinParticipationPct',
  'electionEnabled',
  'electionMinHours',
  'electionMaxHours',
  'electionMinParticipationPct',
  'electionNominationsEnabled',
  'pollEnabled',
  'pollMinHours',
  'pollMaxHours',
  'pollSuggestionsEnabled',
] as const;
export type GovernableSettingKey = typeof GOVERNABLE_SETTING_KEYS[number];

export type GovernableSettingType = 'enum' | 'boolean' | 'integer' | 'unlimited_or_positive_integer' | 'decimal';

export interface GovernableSettingDescriptor {
  key: GovernableSettingKey;
  type: GovernableSettingType;
  allowed?: readonly string[];
  min?: number;
  max?: number;
  /** How an integer or decimal reads to a member: a duration or a share. */
  unit?: 'hours' | 'percent';
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
  minParticipationPct:           { key: 'minParticipationPct',           type: 'decimal', min: 0,    max: 100, unit: 'percent' },
  sortitionSize:                 { key: 'sortitionSize',                 type: 'integer', min: 3,    max: 500 },
  sortitionResponseHours:        { key: 'sortitionResponseHours',        type: 'integer', min: 1,    max: 720 },
  amendmentThreshold:            { key: 'amendmentThreshold',            type: 'decimal', min: 0,    max: 1 },
  amendmentInclusionThreshold:   { key: 'amendmentInclusionThreshold',   type: 'decimal', min: 0,    max: 1 },
  maxAmendmentsPerProposal:      { key: 'maxAmendmentsPerProposal',      type: 'unlimited_or_positive_integer' },
  votingMinHours:                { key: 'votingMinHours',                type: 'integer', min: 1, max: 8760, unit: 'hours' },
  votingMaxHours:                { key: 'votingMaxHours',                type: 'integer', min: 1, max: 8760, unit: 'hours' },
  decisionMajority:              { key: 'decisionMajority',              type: 'enum',    allowed: MAJORITY_RULES },
  statuteEnabled:                { key: 'statuteEnabled',                type: 'boolean' },
  statuteMinHours:               { key: 'statuteMinHours',               type: 'integer', min: 1, max: 8760, unit: 'hours' },
  statuteMaxHours:               { key: 'statuteMaxHours',               type: 'integer', min: 1, max: 8760, unit: 'hours' },
  statuteMajority:               { key: 'statuteMajority',               type: 'enum',    allowed: MAJORITY_RULES },
  statuteMinParticipationPct:    { key: 'statuteMinParticipationPct',    type: 'decimal', min: 0, max: 100, unit: 'percent' },
  electionEnabled:               { key: 'electionEnabled',               type: 'boolean' },
  electionMinHours:              { key: 'electionMinHours',              type: 'integer', min: 1, max: 8760, unit: 'hours' },
  electionMaxHours:              { key: 'electionMaxHours',              type: 'integer', min: 1, max: 8760, unit: 'hours' },
  electionMinParticipationPct:   { key: 'electionMinParticipationPct',   type: 'decimal', min: 0, max: 100, unit: 'percent' },
  pollEnabled:                   { key: 'pollEnabled',                   type: 'boolean' },
  pollMinHours:                  { key: 'pollMinHours',                  type: 'integer', min: 1, max: 8760, unit: 'hours' },
  pollMaxHours:                  { key: 'pollMaxHours',                  type: 'integer', min: 1, max: 8760, unit: 'hours' },
  electionNominationsEnabled:    { key: 'electionNominationsEnabled',    type: 'boolean' },
  pollSuggestionsEnabled:        { key: 'pollSuggestionsEnabled',        type: 'boolean' },
};

/**
 * Which kind of vote a setting belongs to, so the members' ballot on the
 * rules can be laid out the way the form offers the kinds, in this order.
 * General settings are absent.
 */
export const GOVERNABLE_SETTING_KIND: Partial<Record<GovernableSettingKey, ProposalKind>> = {
  votingMinHours: 'decision',
  votingMaxHours: 'decision',
  decisionMajority: 'decision',
  minParticipationPct: 'decision',
  statuteEnabled: 'statute',
  statuteMinHours: 'statute',
  statuteMaxHours: 'statute',
  statuteMajority: 'statute',
  statuteMinParticipationPct: 'statute',
  electionEnabled: 'election',
  electionMinHours: 'election',
  electionMaxHours: 'election',
  electionMinParticipationPct: 'election',
  electionNominationsEnabled: 'election',
  pollEnabled: 'poll',
  pollMinHours: 'poll',
  pollMaxHours: 'poll',
  pollSuggestionsEnabled: 'poll',
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
 *
 * governanceModel: same story, with a twist — it is now derived from the
 * community's `type` (see governanceModelForType), which is the field the
 * permission checks actually read. A vote on it could only have set a label
 * that contradicts the type it is derived from.
 */
export const RETIRED_GOVERNABLE_SETTING_KEYS = ['requireGovgrVerification', 'governanceModel'] as const;

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
