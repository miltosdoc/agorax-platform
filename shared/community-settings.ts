export const COMMUNITY_TYPES = ['autonomous', 'managed'] as const;
export type CommunityType = typeof COMMUNITY_TYPES[number];

export const COMMUNITY_GOVERNANCE_MODELS = ['no_admin', 'admin_team', 'hybrid'] as const;
export type CommunityGovernanceModel = typeof COMMUNITY_GOVERNANCE_MODELS[number];

export const COMMUNITY_SORTITION_MODES = ['absolute', 'percentage'] as const;
export type CommunitySortitionMode = typeof COMMUNITY_SORTITION_MODES[number];

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
  amendmentThreshold?: unknown;
  amendmentInclusionThreshold?: unknown;
  maxAmendmentsPerProposal?: unknown;
  requireGovgrVerification?: unknown;
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
  amendmentThreshold: string;
  amendmentInclusionThreshold: string;
  maxAmendmentsPerProposal: number;
  requireGovgrVerification: boolean;
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
  amendmentThreshold: '0.5',
  amendmentInclusionThreshold: '1',
  maxAmendmentsPerProposal: -1,
  requireGovgrVerification: false,
} as const;

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

  return {
    name,
    ...(description ? { description } : {}),
    type: enumValue(input.type, COMMUNITY_TYPES, DEFAULT_COMMUNITY_SETTINGS.type, 'Invalid community type'),
    governanceModel: enumValue(input.governanceModel, COMMUNITY_GOVERNANCE_MODELS, DEFAULT_COMMUNITY_SETTINGS.governanceModel, 'Invalid governance model'),
    maxConcurrentVotes: unlimitedOrPositiveInteger(input.maxConcurrentVotes, DEFAULT_COMMUNITY_SETTINGS.maxConcurrentVotes, 'maxConcurrentVotes must be -1 or greater than 0'),
    minParticipationPct: decimalString(input.minParticipationPct, DEFAULT_COMMUNITY_SETTINGS.minParticipationPct ?? '0', 0, 100, 'minParticipationPct must be between 0 and 100'),
    sortitionSize: integerValue(input.sortitionSize, DEFAULT_COMMUNITY_SETTINGS.sortitionSize ?? 12, 3, 500, 'sortitionSize must be between 3 and 500'),
    sortitionMode: enumValue(input.sortitionMode, COMMUNITY_SORTITION_MODES, DEFAULT_COMMUNITY_SETTINGS.sortitionMode ?? 'absolute', 'Invalid sortition mode'),
    sortitionResponseHours: integerValue(input.sortitionResponseHours, DEFAULT_COMMUNITY_SETTINGS.sortitionResponseHours ?? 72, 1, 720, 'sortitionResponseHours must be between 1 and 720'),
    amendmentThreshold: decimalString(input.amendmentThreshold, DEFAULT_COMMUNITY_SETTINGS.amendmentThreshold ?? '0.5', 0, 1, 'amendmentThreshold must be between 0 and 1'),
    amendmentInclusionThreshold: decimalString(input.amendmentInclusionThreshold, DEFAULT_COMMUNITY_SETTINGS.amendmentInclusionThreshold ?? '1', 0, 1, 'amendmentInclusionThreshold must be between 0 and 1'),
    maxAmendmentsPerProposal: unlimitedOrPositiveInteger(input.maxAmendmentsPerProposal, DEFAULT_COMMUNITY_SETTINGS.maxAmendmentsPerProposal ?? -1, 'maxAmendmentsPerProposal must be -1 or greater than 0'),
    requireGovgrVerification: booleanValue(input.requireGovgrVerification, DEFAULT_COMMUNITY_SETTINGS.requireGovgrVerification ?? false),
  };
}

export function sanitizeCommunityUpdateInput(input: CommunitySettingsInput): CommunityUpdateSettings {
  const updates: CommunityUpdateSettings = {};

  const name = optionalString(input.name);
  if (name !== undefined) updates.name = name;

  if ('description' in input) updates.description = optionalString(input.description) ?? null;

  const type = optionalEnumValue(input.type, COMMUNITY_TYPES, 'Invalid community type');
  if (type !== undefined) updates.type = type;

  const governanceModel = optionalEnumValue(input.governanceModel, COMMUNITY_GOVERNANCE_MODELS, 'Invalid governance model');
  if (governanceModel !== undefined) updates.governanceModel = governanceModel;

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

  const amendmentThreshold = optionalDecimalString(input.amendmentThreshold, 0, 1, 'amendmentThreshold must be between 0 and 1');
  if (amendmentThreshold !== undefined) updates.amendmentThreshold = amendmentThreshold;
  const amendmentInclusionThreshold = optionalDecimalString(input.amendmentInclusionThreshold, 0, 1, 'amendmentInclusionThreshold must be between 0 and 1');
  if (amendmentInclusionThreshold !== undefined) updates.amendmentInclusionThreshold = amendmentInclusionThreshold;

  const maxAmendmentsPerProposal = optionalUnlimitedOrPositiveInteger(input.maxAmendmentsPerProposal, 'maxAmendmentsPerProposal must be -1 or greater than 0');
  if (maxAmendmentsPerProposal !== undefined) updates.maxAmendmentsPerProposal = maxAmendmentsPerProposal;

  const requireGovgrVerification = optionalBoolean(input.requireGovgrVerification);
  if (requireGovgrVerification !== undefined) updates.requireGovgrVerification = requireGovgrVerification;

  return updates;
}
