/**
 * Panel service — anonymous-side panelist lifecycle.
 *
 * Enrollment flow (mirrors anonymous voting):
 *   1. authenticated user fetches the enrollment public key
 *   2. client blinds a fresh token, POSTs it; server checks the one-per-user
 *      ledger (panel_enrollments), records the channel, signs blind
 *   3. client unblinds; POSTs token + signature + demographic profile on an
 *      UNauthenticated route (credentials omitted) → panelist row keyed by
 *      sha256(token). The token never appears next to a user id.
 *
 * Subsequent panel requests authenticate with `X-Panel-Token` (the raw
 * token, base64); we hash and look up. All reads/writes here go through
 * voteDb — the connection role that cannot read identity tables.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { voteDb } from '../db';
import {
  panelists, panelProfiles,
  type Panelist, type PanelProfile,
} from '@shared/schema';
import {
  panelProfileSchema, type PanelProfileInput,
  RECRUITMENT_CHANNELS, type RecruitmentChannel,
} from '@shared/polling';
import { base64ToBytes, verify, type PublicKey } from '@shared/blind-sig';
import { loadAllEnrollmentPublicKeys } from './panel-vault';

export function hashToken(tokenB64: string): string {
  return createHash('sha256').update(Buffer.from(tokenB64, 'base64')).digest('hex');
}

export interface RegisterPanelistInput {
  token: string;        // base64 40-byte token
  preparedMsg: string;  // base64 prepared message (RFC 9474 Randomized)
  signature: string;    // base64 unblinded RSA-PSS signature
  sourceChannel?: string;
  profile: unknown;
}

export type RegisterResult =
  | { ok: true; panelistId: number }
  | { ok: false; status: number; message: string };

export async function registerPanelist(input: RegisterPanelistInput): Promise<RegisterResult> {
  const profileParsed = panelProfileSchema.safeParse(input.profile);
  if (!profileParsed.success) {
    return { ok: false, status: 400, message: 'Invalid profile: ' + profileParsed.error.issues.map(i => i.message).join('; ') };
  }
  const channel: RecruitmentChannel = RECRUITMENT_CHANNELS.includes(input.sourceChannel as RecruitmentChannel)
    ? (input.sourceChannel as RecruitmentChannel)
    : 'organic';

  // Verify the blind signature against every enrollment key.
  let verified = false;
  let keys: PublicKey[];
  try {
    keys = await loadAllEnrollmentPublicKeys();
  } catch {
    return { ok: false, status: 500, message: 'Enrollment keys unavailable' };
  }
  const token = base64ToBytes(input.token);
  const preparedMsg = base64ToBytes(input.preparedMsg);
  for (const key of keys) {
    try {
      if (await verify(token, preparedMsg, input.signature, key)) { verified = true; break; }
    } catch { /* try next key */ }
  }
  if (!verified) return { ok: false, status: 403, message: 'Invalid enrollment signature' };

  const tokenHash = hashToken(input.token);
  const [existing] = await voteDb.select().from(panelists).where(eq(panelists.tokenHash, tokenHash)).limit(1);
  if (existing) return { ok: false, status: 409, message: 'Token already registered' };

  const [panelist] = await voteDb.insert(panelists).values({
    tokenHash,
    sourceChannel: channel,
  }).returning();

  const refreshDueAt = new Date(Date.now() + 365 * 86_400_000);
  await voteDb.insert(panelProfiles).values({
    panelistId: panelist.id,
    ageBand: profileParsed.data.ageBand,
    gender: profileParsed.data.gender,
    region: profileParsed.data.region,
    education: profileParsed.data.education,
    urbanity: profileParsed.data.urbanity,
    pastVote2023: profileParsed.data.pastVote2023,
    benchmarks: profileParsed.data.benchmarks,
    refreshDueAt,
  });

  return { ok: true, panelistId: panelist.id };
}

/** Resolve the panelist behind an X-Panel-Token header value. */
export async function resolvePanelist(tokenB64: string | undefined): Promise<Panelist | null> {
  if (!tokenB64 || typeof tokenB64 !== 'string' || tokenB64.length > 200) return null;
  let tokenHash: string;
  try {
    tokenHash = hashToken(tokenB64);
  } catch {
    return null;
  }
  const [row] = await voteDb
    .select()
    .from(panelists)
    .where(and(eq(panelists.tokenHash, tokenHash), eq(panelists.status, 'active')))
    .limit(1);
  if (row) {
    // Best-effort activity stamp; never block the request on it.
    Promise.resolve(
      voteDb.update(panelists).set({ lastActiveAt: new Date() }).where(eq(panelists.id, row.id)),
    ).catch(() => {});
  }
  return row ?? null;
}

export async function getProfile(panelistId: number): Promise<PanelProfile | null> {
  const [row] = await voteDb.select().from(panelProfiles)
    .where(eq(panelProfiles.panelistId, panelistId)).limit(1);
  return row ?? null;
}

/** Annual refresh / correction. Full replace — partial profiles are invalid. */
export async function updateProfile(panelistId: number, profile: unknown): Promise<{ ok: boolean; message?: string }> {
  const parsed = panelProfileSchema.safeParse(profile);
  if (!parsed.success) {
    return { ok: false, message: 'Invalid profile: ' + parsed.error.issues.map(i => i.message).join('; ') };
  }
  await voteDb.update(panelProfiles).set({
    ageBand: parsed.data.ageBand,
    gender: parsed.data.gender,
    region: parsed.data.region,
    education: parsed.data.education,
    urbanity: parsed.data.urbanity,
    pastVote2023: parsed.data.pastVote2023,
    benchmarks: parsed.data.benchmarks,
    updatedAt: new Date(),
    refreshDueAt: new Date(Date.now() + 365 * 86_400_000),
  }).where(eq(panelProfiles.panelistId, panelistId));
  return { ok: true };
}

/** A fresh one-time claim code (raw + hash). Raw goes to the respondent. */
export function makeClaimCode(): { code: string; codeHash: string } {
  const code = randomBytes(24).toString('base64url');
  const codeHash = createHash('sha256').update(code).digest('hex');
  return { code, codeHash };
}

export function hashClaimCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
