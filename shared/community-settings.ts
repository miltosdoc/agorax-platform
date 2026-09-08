export const COMMUNITY_TYPES = ['autonomous', 'managed'] as const;
export type CommunityType = typeof COMMUNITY_TYPES[number];

/**
 * How a community is governed. Not a choice of its own: it is derived from
 * `type`, which is the field the platform actually enforces — the PATCH
 * refusal, the founder/admin role and the liquid-settings ballot all read
 * `type` and never this.
 *
 * It used to be an independent dropdown with a third option, 'hybrid'. No
 * route, guard or screen ever read it, so picking a value changed nothing
 * while the dashboard label happily contradicted reality: a managed community
 * whose founder left the dropdown alone announced itself as having no
 * administrators. Rows written before this still hold 'hybrid'; nothing reads
 * them, and the label now comes from `type`.
 */
export const COMMUNITY_GOVERNANCE_MODELS = ['no_admin', 'admin_team'] as const;
export type CommunityGovernanceModel = typeof COMMUNITY_GOVERNANCE_MODELS[number];

export function governanceModelForType(type: CommunityType): CommunityGovernanceModel {
  return type === 'managed' ? 'admin_team' : 'no_admin';
}

export const COMMUNITY_SORTITION_MODES = ['absolute', 'percentage'] as const;
export type CommunitySortitionMode = typeof COMMUNITY_SORTITION_MODES[number];

// Who synthesizes the final text after deliberation. 'ai' is the default;
// 'sortition' draws a jury but always falls back to AI when the jury cannot
// form or does not respond in time.
export const COMMUNITY_SYNTHESIS_MODES = ['ai', 'sortition'] as const;
export type CommunitySynthesisMode = typeof COMMUNITY_SYNTHESIS_MODES[number];

/**
 * Who may submit a proposal.
 *
 * Only the submission is gated. The forum, the deliberation, amendments and
 * the ballot stay open to every member under all three values — a community
 * where members cannot speak or vote would not be a community.
 *
 * An autonomous community has no admin team, so the value is meaningless
 * there and `effectiveProposalPolicy` reports 'all_members' whatever the
 * column holds. Read the effective value, never the raw column.
 */
export const COMMUNITY_PROPOSAL_POLICIES = ['all_members', 'admins', 'founder'] as const;
export type CommunityProposalPolicy = typeof COMMUNITY_PROPOSAL_POLICIES[number];

export function effectiveProposalPolicy(community: {
  type?: string | null;
  proposalPolicy?: string | null;
}): CommunityProposalPolicy {
  if (community.type !== 'managed') return 'all_members';
  const raw = community.proposalPolicy;
  return (COMMUNITY_PROPOSAL_POLICIES as readonly string[]).includes(String(raw))
    ? (raw as CommunityProposalPolicy)
    : 'all_members';
}

/**
 * May this member submit a proposal?
 *
 * `isCreator` is not a convenience: a managed community built through
 * `createCommunity` in server/utils/community-manager.ts records its creator
 * with role 'admin' and no 'founder' row exists at all. Trusting the role
 * alone would lock the founder out of their own community under the
 * 'founder' policy.
 */
export function canSubmitProposal(opts: {
  policy: CommunityProposalPolicy;
  role?: string | null;
  isCreator?: boolean;
}): boolean {
  const { policy, role, isCreator = false } = opts;
  if (policy === 'all_members') return true;
  const isFounder = isCreator || role === 'founder';
  if (policy === 'founder') return isFounder;
  return isFounder || role === 'admin';
}

export const COMMUNITY_JOIN_POLICIES = ['open', 'approval', 'invite_only'] as const;
export type CommunityJoinPolicy = typeof COMMUNITY_JOIN_POLICIES[number];

export const COMMUNITY_VISIBILITY_LEVELS = ['public', 'members'] as const;
export type CommunityVisibilityLevel = typeof COMMUNITY_VISIBILITY_LEVELS[number];

export interface CommunitySettingsInput {
  name?: unknown;
  description?: unknown;
  type?: unknown;
  governanceModel?: unknown;
  maxConcurrentVotes?: unknown;
  minParticipationPct?: unknown;
  sortitionSize?: unknown;
  sortitionMode?: unknown;
  sortitionResponseHours?: unknown;
  synthesisMode?: unknown;
  amendmentThreshold?: unknown;
  amendmentInclusionThreshold?: unknown;
  maxAmendmentsPerProposal?: unknown;
  requireGovgrVerification?: unknown;
  proposalPolicy?: unknown;
  joinPolicy?: unknown;
  memberListVisibility?: unknown;
  contentVisibility?: unknown;
  authorReviewHours?: unknown;
  communitySignalHours?: unknown;
  votingHours?: unknown;
  finalReviewHours?: unknown;
  deliberationMinHours?: unknown;
  deliberationMaxHours?: unknown;
  votingMinHours?: unknown;
  votingMaxHours?: unknown;
}

// Sanitized community settings — narrow literal types instead of the wide
// nullable column types from `Community`. These are what create/update routes
// can safely accept from the client.
export interface CommunityCreateSettings {
  name: string;
  description?: string | null;
  type: CommunityType;
  governanceModel: CommunityGovernanceModel;
  maxConcurrentVotes: number;
  minParticipationPct: string;
  sortitionSize: number;
  sortitionMode: CommunitySortitionMode;
  sortitionResponseHours: number;
  synthesisMode: CommunitySynthesisMode;
  amendmentThreshold: string;
  amendmentInclusionThreshold: string;
  maxAmendmentsPerProposal: number;
  requireGovgrVerification: boolean;
  proposalPolicy: CommunityProposalPolicy;
  joinPolicy: CommunityJoinPolicy;
  memberListVisibility: CommunityVisibilityLevel;
  contentVisibility: CommunityVisibilityLevel;
  authorReviewHours: number;
  communitySignalHours: number;
  votingHours: number;
  finalReviewHours: number;
  deliberationMinHours: number;
  deliberationMaxHours: number;
  votingMinHours: number;
  votingMaxHours: number;
}

export type CommunityUpdateSettings = Partial<CommunityCreateSettings>;

const DEFAULT_COMMUNITY_SETTINGS = {
  type: 'autonomous',
  governanceModel: 'no_admin',
  maxConcurrentVotes: -1,
  minParticipationPct: '0',
  sortitionSize: 12,
  sortitionMode: 'absolute',
  sortitionResponseHours: 72,
  synthesisMode: 'ai',
  amendmentThreshold: '0.5',
  amendmentInclusionThreshold: '0.6',
  maxAmendmentsPerProposal: -1,
  requireGovgrVerification: false,
  proposalPolicy: 'all_members',
  joinPolicy: 'open',
  memberListVisibility: 'public',
  contentVisibility: 'public',
  authorReviewHours: 72,
  communitySignalHours: 48,
  votingHours: 168,
  finalReviewHours: 24,
  deliberationMinHours: 24,
  deliberationMaxHours: 336,
  votingMinHours: 24,
  votingMaxHours: 720,
} as const;

/**
 * Fallback for a community row that predates the column or stores NULL.
 * Kept in step with the column default in `communities`.
 */
export const DEFAULT_AMENDMENT_INCLUSION_THRESHOLD = Number(DEFAULT_COMMUNITY_SETTINGS.amendmentInclusionThreshold);

/**
 * Resolve the duration of a phase the author is allowed to configure.
 *
 * The community owns the range and the fallback; the author's choice only
 * counts when it lands inside that range. Bounds can be edited after a
 * proposal is created, so this is applied at transition time as well as on
 * write — a stored value that has since fallen out of range is clamped, not
 * honoured. A community that has switched the phase off (0 = unlimited) keeps
 * that: no deadline is derived from an author's preference.
 */
export function resolveAuthoredPhaseHours(opts: {
  requested?: number | null;
  min?: number | null;
  max?: number | null;
  communityDefault?: number | null;
}): number {
  const communityDefault = Number(opts.communityDefault ?? 0);
  const requested = Number(opts.requested ?? 0);
  if (!(requested > 0)) return communityDefault;
  if (!(communityDefault > 0)) return communityDefault;

  const min = Number(opts.min ?? 0) > 0 ? Number(opts.min) : 1;
  const max = Number(opts.max ?? 0) > 0 ? Number(opts.max) : 8760;
  if (min > max) return communityDefault;
  return Math.min(Math.max(requested, min), max);
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requiredString(value: unknown, message: string): string {
  const result = optionalString(value);
  if (!result) throw new Error(message);
  return result;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number], message: string): T[number] {
  if (value === undefined || value === null || value === '') return fallback;
  if ((allowed as readonly string[]).includes(String(value))) return String(value) as T[number];
  throw new Error(message);
}

function optionalEnumValue<T extends readonly string[]>(value: unknown, allowed: T, message: string): T[number] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if ((allowed as readonly string[]).includes(String(value))) return String(value) as T[number];
  throw new Error(message);
}

function integerValue(value: unknown, fallback: number, min: number, max: number, message: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(message);
  return parsed;
}

function optionalIntegerValue(value: unknown, min: number, max: number, message: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(message);
  return parsed;
}

function unlimitedOrPositiveInteger(value: unknown, fallback: number, message: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed === 0 || parsed < -1) throw new Error(message);
  return parsed;
}

function optionalUnlimitedOrPositiveInteger(value: unknown, message: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed === 0 || parsed < -1) throw new Error(message);
  return parsed;
}

function decimalString(value: unknown, fallback: string, min: number, max: number, message: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(message);
  return String(value).trim();
}

function optionalDecimalString(value: unknown, min: number, max: number, message: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(message);
  return String(value).trim();
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Boolean setting must be true or false');
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return optionalBoolean(value) ?? fallback;
}

export function sanitizeCommunityCreateInput(input: CommunitySettingsInput): CommunityCreateSettings {
  const name = requiredString(input.name, 'Community name is required');
  const description = optionalString(input.description);
  const type = enumValue(input.type, COMMUNITY_TYPES, DEFAULT_COMMUNITY_SETTINGS.type, 'Invalid community type');

  return {
    name,
    ...(description ? { description } : {}),
    type,
    // Derived, never taken from the caller: the two must agree, and `type` is
    // the one with consequences.
    governanceModel: governanceModelForType(type),
    maxConcurrentVotes: unlimitedOrPositiveInteger(input.maxConcurrentVotes, DEFAULT_COMMUNITY_SETTINGS.maxConcurrentVotes, 'maxConcurrentVotes must be -1 or greater than 0'),
    minParticipationPct: decimalString(input.minParticipationPct, DEFAULT_COMMUNITY_SETTINGS.minParticipationPct ?? '0', 0, 100, 'minParticipationPct must be between 0 and 100'),
    sortitionSize: integerValue(input.sortitionSize, DEFAULT_COMMUNITY_SETTINGS.sortitionSize ?? 12, 3, 500, 'sortitionSize must be between 3 and 500'),
    sortitionMode: enumValue(input.sortitionMode, COMMUNITY_SORTITION_MODES, DEFAULT_COMMUNITY_SETTINGS.sortitionMode ?? 'absolute', 'Invalid sortition mode'),
    sortitionResponseHours: integerValue(input.sortitionResponseHours, DEFAULT_COMMUNITY_SETTINGS.sortitionResponseHours ?? 72, 1, 720, 'sortitionResponseHours must be between 1 and 720'),
    synthesisMode: enumValue(input.synthesisMode, COMMUNITY_SYNTHESIS_MODES, DEFAULT_COMMUNITY_SETTINGS.synthesisMode, 'Invalid synthesis mode'),
    amendmentThreshold: decimalString(input.amendmentThreshold, DEFAULT_COMMUNITY_SETTINGS.amendmentThreshold ?? '0.5', 0, 1, 'amendmentThreshold must be between 0 and 1'),
    amendmentInclusionThreshold: decimalString(input.amendmentInclusionThreshold, DEFAULT_COMMUNITY_SETTINGS.amendmentInclusionThreshold, 0, 1, 'amendmentInclusionThreshold must be between 0 and 1'),
    maxAmendmentsPerProposal: unlimitedOrPositiveInteger(input.maxAmendmentsPerProposal, DEFAULT_COMMUNITY_SETTINGS.maxAmendmentsPerProposal ?? -1, 'maxAmendmentsPerProposal must be -1 or greater than 0'),
    requireGovgrVerification: booleanValue(input.requireGovgrVerification, DEFAULT_COMMUNITY_SETTINGS.requireGovgrVerification ?? false),
    // Forced for autonomous the way governanceModel is: the stored value must
    // never describe a restriction the community's type cannot have.
    proposalPolicy: type === 'managed'
      ? enumValue(input.proposalPolicy, COMMUNITY_PROPOSAL_POLICIES, DEFAULT_COMMUNITY_SETTINGS.proposalPolicy, 'Invalid proposal policy')
      : 'all_members',
    joinPolicy: enumValue(input.joinPolicy, COMMUNITY_JOIN_POLICIES, DEFAULT_COMMUNITY_SETTINGS.joinPolicy, 'Invalid join policy'),
    memberListVisibility: enumValue(input.memberListVisibility, COMMUNITY_VISIBILITY_LEVELS, DEFAULT_COMMUNITY_SETTINGS.memberListVisibility, 'Invalid member list visibility'),
    contentVisibility: enumValue(input.contentVisibility, COMMUNITY_VISIBILITY_LEVELS, DEFAULT_COMMUNITY_SETTINGS.contentVisibility, 'Invalid content visibility'),
    authorReviewHours: integerValue(input.authorReviewHours, DEFAULT_COMMUNITY_SETTINGS.authorReviewHours, 0, 8760, 'authorReviewHours must be 0–8760'),
    communitySignalHours: integerValue(input.communitySignalHours, DEFAULT_COMMUNITY_SETTINGS.communitySignalHours, 0, 8760, 'communitySignalHours must be 0–8760'),
    votingHours: integerValue(input.votingHours, DEFAULT_COMMUNITY_SETTINGS.votingHours, 0, 8760, 'votingHours must be 0–8760'),
    finalReviewHours: integerValue(input.finalReviewHours, DEFAULT_COMMUNITY_SETTINGS.finalReviewHours, 0, 8760, 'finalReviewHours must be 0–8760'),
    ...assertAuthoredRanges({
      deliberationMinHours: integerValue(input.deliberationMinHours, DEFAULT_COMMUNITY_SETTINGS.deliberationMinHours, 1, 8760, 'deliberationMinHours must be 1–8760'),
      deliberationMaxHours: integerValue(input.deliberationMaxHours, DEFAULT_COMMUNITY_SETTINGS.deliberationMaxHours, 1, 8760, 'deliberationMaxHours must be 1–8760'),
      votingMinHours: integerValue(input.votingMinHours, DEFAULT_COMMUNITY_SETTINGS.votingMinHours, 1, 8760, 'votingMinHours must be 1–8760'),
      votingMaxHours: integerValue(input.votingMaxHours, DEFAULT_COMMUNITY_SETTINGS.votingMaxHours, 1, 8760, 'votingMaxHours must be 1–8760'),
    }),
  };
}

/**
 * A range whose minimum exceeds its maximum admits no valid author choice, so
 * it is rejected at the edge rather than silently ignored later.
 */
function assertAuthoredRanges<T extends Partial<Record<
  'deliberationMinHours' | 'deliberationMaxHours' | 'votingMinHours' | 'votingMaxHours', number
>>>(values: T): T {
  if (values.deliberationMinHours !== undefined && values.deliberationMaxHours !== undefined
    && values.deliberationMinHours > values.deliberationMaxHours) {
    throw new Error('deliberationMinHours cannot exceed deliberationMaxHours');
  }
  if (values.votingMinHours !== undefined && values.votingMaxHours !== undefined
    && values.votingMinHours > values.votingMaxHours) {
    throw new Error('votingMinHours cannot exceed votingMaxHours');
  }
  return values;
}

export function sanitizeCommunityUpdateInput(input: CommunitySettingsInput): CommunityUpdateSettings {
  const updates: CommunityUpdateSettings = {};

  const name = optionalString(input.name);
  if (name !== undefined) updates.name = name;

  if ('description' in input) updates.description = optionalString(input.description) ?? null;

  const type = optionalEnumValue(input.type, COMMUNITY_TYPES, 'Invalid community type');
  if (type !== undefined) updates.type = type;

  // Follows the type rather than being set on its own, so switching a
  // community's type cannot leave the stored model describing the old one.
  if (type !== undefined) updates.governanceModel = governanceModelForType(type);

  const maxConcurrentVotes = optionalUnlimitedOrPositiveInteger(input.maxConcurrentVotes, 'maxConcurrentVotes must be -1 or greater than 0');
  if (maxConcurrentVotes !== undefined) updates.maxConcurrentVotes = maxConcurrentVotes;

  const minParticipationPct = optionalDecimalString(input.minParticipationPct, 0, 100, 'minParticipationPct must be between 0 and 100');
  if (minParticipationPct !== undefined) updates.minParticipationPct = minParticipationPct;

  const sortitionSize = optionalIntegerValue(input.sortitionSize, 3, 500, 'sortitionSize must be between 3 and 500');
  if (sortitionSize !== undefined) updates.sortitionSize = sortitionSize;

  const sortitionMode = optionalEnumValue(input.sortitionMode, COMMUNITY_SORTITION_MODES, 'Invalid sortition mode');
  if (sortitionMode !== undefined) updates.sortitionMode = sortitionMode;

  const sortitionResponseHours = optionalIntegerValue(input.sortitionResponseHours, 1, 720, 'sortitionResponseHours must be between 1 and 720');
  if (sortitionResponseHours !== undefined) updates.sortitionResponseHours = sortitionResponseHours;

  const synthesisMode = optionalEnumValue(input.synthesisMode, COMMUNITY_SYNTHESIS_MODES, 'Invalid synthesis mode');
  if (synthesisMode !== undefined) updates.synthesisMode = synthesisMode;

  const amendmentThreshold = optionalDecimalString(input.amendmentThreshold, 0, 1, 'amendmentThreshold must be between 0 and 1');
  if (amendmentThreshold !== undefined) updates.amendmentThreshold = amendmentThreshold;
  const amendmentInclusionThreshold = optionalDecimalString(input.amendmentInclusionThreshold, 0, 1, 'amendmentInclusionThreshold must be between 0 and 1');
  if (amendmentInclusionThreshold !== undefined) updates.amendmentInclusionThreshold = amendmentInclusionThreshold;

  const maxAmendmentsPerProposal = optionalUnlimitedOrPositiveInteger(input.maxAmendmentsPerProposal, 'maxAmendmentsPerProposal must be -1 or greater than 0');
  if (maxAmendmentsPerProposal !== undefined) updates.maxAmendmentsPerProposal = maxAmendmentsPerProposal;

  const requireGovgrVerification = optionalBoolean(input.requireGovgrVerification);
  if (requireGovgrVerification !== undefined) updates.requireGovgrVerification = requireGovgrVerification;

  const proposalPolicy = optionalEnumValue(input.proposalPolicy, COMMUNITY_PROPOSAL_POLICIES, 'Invalid proposal policy');
  if (proposalPolicy !== undefined) updates.proposalPolicy = proposalPolicy;
  // Switching to autonomous dissolves the admin team, so any restriction that
  // named it has to go with it rather than linger as a value nothing honours.
  if (type === 'autonomous') updates.proposalPolicy = 'all_members';

  const joinPolicy = optionalEnumValue(input.joinPolicy, COMMUNITY_JOIN_POLICIES, 'Invalid join policy');
  if (joinPolicy !== undefined) updates.joinPolicy = joinPolicy;

  const memberListVisibility = optionalEnumValue(input.memberListVisibility, COMMUNITY_VISIBILITY_LEVELS, 'Invalid member list visibility');
  if (memberListVisibility !== undefined) updates.memberListVisibility = memberListVisibility;

  const contentVisibility = optionalEnumValue(input.contentVisibility, COMMUNITY_VISIBILITY_LEVELS, 'Invalid content visibility');
  if (contentVisibility !== undefined) updates.contentVisibility = contentVisibility;

  const authorReviewHours = optionalIntegerValue(input.authorReviewHours, 0, 8760, 'authorReviewHours must be 0–8760');
  if (authorReviewHours !== undefined) updates.authorReviewHours = authorReviewHours;

  const communitySignalHours = optionalIntegerValue(input.communitySignalHours, 0, 8760, 'communitySignalHours must be 0–8760');
  if (communitySignalHours !== undefined) updates.communitySignalHours = communitySignalHours;

  const votingHours = optionalIntegerValue(input.votingHours, 0, 8760, 'votingHours must be 0–8760');
  if (votingHours !== undefined) updates.votingHours = votingHours;

  const finalReviewHours = optionalIntegerValue(input.finalReviewHours, 0, 8760, 'finalReviewHours must be 0–8760');
  if (finalReviewHours !== undefined) updates.finalReviewHours = finalReviewHours;

  const deliberationMinHours = optionalIntegerValue(input.deliberationMinHours, 1, 8760, 'deliberationMinHours must be 1–8760');
  if (deliberationMinHours !== undefined) updates.deliberationMinHours = deliberationMinHours;

  const deliberationMaxHours = optionalIntegerValue(input.deliberationMaxHours, 1, 8760, 'deliberationMaxHours must be 1–8760');
  if (deliberationMaxHours !== undefined) updates.deliberationMaxHours = deliberationMaxHours;

  const votingMinHours = optionalIntegerValue(input.votingMinHours, 1, 8760, 'votingMinHours must be 1–8760');
  if (votingMinHours !== undefined) updates.votingMinHours = votingMinHours;

  const votingMaxHours = optionalIntegerValue(input.votingMaxHours, 1, 8760, 'votingMaxHours must be 1–8760');
  if (votingMaxHours !== undefined) updates.votingMaxHours = votingMaxHours;

  // Only catches a self-contradictory pair sent together. A partial update
  // that crosses the *stored* bound is caught by assertCommunityRanges(),
  // which the route runs against the merged result.
  assertAuthoredRanges(updates);

  return updates;
}

/**
 * Cross-field check against the settings a community will actually hold once
 * an update is applied. The update sanitizer only sees the keys that were
 * sent, so a PATCH of one half of a range has to be judged against the other
 * half as stored.
 */
export function assertCommunityRanges(merged: {
  deliberationMinHours?: number | null;
  deliberationMaxHours?: number | null;
  votingMinHours?: number | null;
  votingMaxHours?: number | null;
}): void {
  assertAuthoredRanges({
    deliberationMinHours: merged.deliberationMinHours ?? undefined,
    deliberationMaxHours: merged.deliberationMaxHours ?? undefined,
    votingMinHours: merged.votingMinHours ?? undefined,
    votingMaxHours: merged.votingMaxHours ?? undefined,
  });
}
