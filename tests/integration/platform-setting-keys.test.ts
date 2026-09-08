/**
 * Which platform settings may be written over HTTP.
 *
 * The write route was gated on requireAuth alone, so any signed-in member
 * could PATCH any key, and the storage layer upserts whatever it is handed.
 * The admin gate is the fix; this list is the second lock, and these tests
 * exist mainly to keep two keys off it.
 */

import { describe, expect, it } from 'vitest';
import {
  WRITABLE_PLATFORM_SETTING_KEYS,
  isWritablePlatformSettingKey,
} from '../../shared/platform-setting-keys';

describe('writable platform settings', () => {
  it('admits the keys the settings screen actually offers', () => {
    for (const key of ['platform_name', 'default_language', 'proposal_voting_period_days', 'sortition_max_members']) {
      expect(isWritablePlatformSettingKey(key)).toBe(true);
    }
  });

  it('keeps the economy keys out of reach of the settings form', () => {
    // economy.phase decides whether Democracy Points can be redeemed for real
    // value; pointsPerEur decides at what rate. Neither belongs behind a text
    // input, and before the allowlist both were writable by any account.
    expect(isWritablePlatformSettingKey('economy.phase')).toBe(false);
    expect(isWritablePlatformSettingKey('economy.pointsPerEur')).toBe(false);
    expect(WRITABLE_PLATFORM_SETTING_KEYS).not.toContain('economy.phase');
  });

  it('refuses a key nobody defined, so a typo cannot create a setting', () => {
    expect(isWritablePlatformSettingKey('platfrom_name')).toBe(false);
    expect(isWritablePlatformSettingKey('')).toBe(false);
    expect(isWritablePlatformSettingKey(undefined)).toBe(false);
    expect(isWritablePlatformSettingKey(null)).toBe(false);
    expect(isWritablePlatformSettingKey(42)).toBe(false);
  });

  it('has no duplicates, so the list stays readable as it grows', () => {
    expect(new Set(WRITABLE_PLATFORM_SETTING_KEYS).size).toBe(WRITABLE_PLATFORM_SETTING_KEYS.length);
  });
});
