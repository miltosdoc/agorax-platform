/**
 * Economy configuration — the platform's revenue phase and points/EUR rate.
 *
 * Stored in the existing `platform_settings` key/value table so an operator
 * can advance the phase without a deploy. Honest defaults: `pre_revenue`
 * (redemption closed) and 100 points per EUR.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { platformSettings } from '@shared/schema';

/** Platform maturity phase. Redemption is closed in `pre_revenue`. */
export type EconomyPhase = 'pre_revenue' | 'early_revenue' | 'scaled';

const PHASE_KEY = 'economy.phase';
const RATE_KEY = 'economy.pointsPerEur';
const DEFAULT_PHASE: EconomyPhase = 'pre_revenue';
const DEFAULT_POINTS_PER_EUR = 100;

async function readSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);
  return row?.value ?? null;
}

/** The current platform revenue phase. */
export async function getEconomyPhase(): Promise<EconomyPhase> {
  const value = await readSetting(PHASE_KEY);
  return value === 'early_revenue' || value === 'scaled' || value === 'pre_revenue'
    ? value
    : DEFAULT_PHASE;
}

/** How many Democracy Points equal one EUR. */
export async function getPointsPerEur(): Promise<number> {
  const value = await readSetting(RATE_KEY);
  const n = value != null ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_POINTS_PER_EUR;
}

/** Convert points to EUR, rounding DOWN — the platform never overpays. */
export function pointsToEur(points: number, pointsPerEur: number): number {
  return Math.floor((points / pointsPerEur) * 100) / 100;
}

/** True once the platform has revenue and redemption may open. */
export function redemptionOpen(phase: EconomyPhase): boolean {
  return phase !== 'pre_revenue';
}
