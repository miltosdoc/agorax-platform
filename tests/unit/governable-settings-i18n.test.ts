/**
 * Every governable setting must be readable in both languages.
 *
 * scripts/check-i18n-keys.mjs only matches literal `t('...')` calls, so the
 * liquid-settings view — which resolves its keys through a map — is invisible
 * to it. Four settings shipped with no dictionary entry and rendered as
 * `community.governance_model` to Greek members. This test closes that hole:
 * it walks the descriptors, not a hand-written list, so a new governable
 * setting fails here until both locales carry its wording.
 */

import { describe, it, expect } from 'vitest';
import {
  ACTIVE_GOVERNABLE_SETTING_KEYS,
  GOVERNABLE_SETTING_KEYS,
  GOVERNABLE_SETTING_DESCRIPTORS,
  RETIRED_GOVERNABLE_SETTING_KEYS,
  isActiveGovernableSettingKey,
  isGovernableSettingKey,
} from '../../shared/governable-settings';
import {
  RATIO_SETTINGS,
  SETTING_HELP_KEYS,
  SETTING_LABEL_KEYS,
  SETTING_VALUE_KEY_PREFIXES,
  settingValueLabel,
} from '../../client/src/lib/governable-setting-labels';
import el from '../../client/src/locales/el';
import en from '../../client/src/locales/en';

const LOCALES = { el, en } as const;

describe('governable settings i18n', () => {
  it('maps every governable setting to a dictionary key', () => {
    expect(Object.keys(SETTING_LABEL_KEYS).sort()).toEqual([...GOVERNABLE_SETTING_KEYS].sort());
  });

  for (const [name, dict] of Object.entries(LOCALES)) {
    it(`has a ${name} label for every setting`, () => {
      const missing = ACTIVE_GOVERNABLE_SETTING_KEYS.filter((key) => !dict[SETTING_LABEL_KEYS[key]]);
      expect(missing).toEqual([]);
    });

    it(`has a ${name} label for every allowed enum value`, () => {
      const missing: string[] = [];
      for (const key of ACTIVE_GOVERNABLE_SETTING_KEYS) {
        const prefix = SETTING_VALUE_KEY_PREFIXES[key];
        if (!prefix) continue;
        for (const value of GOVERNABLE_SETTING_DESCRIPTORS[key].allowed ?? []) {
          if (!dict[`${prefix}${value}`]) missing.push(`${prefix}${value}`);
        }
      }
      expect(missing).toEqual([]);
    });

    it(`explains every setting in ${name}`, () => {
      const missing = ACTIVE_GOVERNABLE_SETTING_KEYS.filter((key) => !dict[SETTING_HELP_KEYS[key]]);
      expect(missing).toEqual([]);
    });

    it(`has a ${name} label for booleans and the unlimited sentinel`, () => {
      expect(dict['community.value_true']).toBeTruthy();
      expect(dict['community.value_false']).toBeTruthy();
      expect(dict['community.value_unlimited']).toBeTruthy();
    });
  }

  it('shows ratios as percentages rather than raw decimals', () => {
    const t = (key: string) => el[key] ?? key;
    expect(settingValueLabel(t, 'amendmentThreshold', '0.5')).toBe('50%');
    expect(settingValueLabel(t, 'amendmentInclusionThreshold', '0.6')).toBe('60%');
    // -1 is a sentinel, not a number members should have to decode.
    expect(settingValueLabel(t, 'maxConcurrentVotes', '-1')).toBe(el['community.value_unlimited']);
    expect(settingValueLabel(t, 'requireGovgrVerification', 'false')).toBe(el['community.value_false']);
    expect(settingValueLabel(t, 'governanceModel', 'no_admin')).toBe(el['community.governance_no_admin']);
  });

  it('keeps the ratio hint pointing at settings that are really ratios', () => {
    for (const key of RATIO_SETTINGS) {
      expect(GOVERNABLE_SETTING_DESCRIPTORS[key].type).toBe('decimal');
      expect(GOVERNABLE_SETTING_DESCRIPTORS[key].max).toBe(1);
    }
  });

  describe('retired settings', () => {
    it('keeps every retired key inside the known set', () => {
      // Dropping it from the union instead would strand the stored column and
      // let PATCH edit it behind the community's back.
      for (const key of RETIRED_GOVERNABLE_SETTING_KEYS) {
        expect(isGovernableSettingKey(key)).toBe(true);
        expect(isActiveGovernableSettingKey(key)).toBe(false);
      }
    });

    it('offers members every key that is not retired, and no other', () => {
      expect([...ACTIVE_GOVERNABLE_SETTING_KEYS].sort()).toEqual(
        GOVERNABLE_SETTING_KEYS
          .filter((key) => !(RETIRED_GOVERNABLE_SETTING_KEYS as readonly string[]).includes(key))
          .sort(),
      );
    });

    it('keeps gov.gr verification off the ballot while nothing enforces it', () => {
      expect(ACTIVE_GOVERNABLE_SETTING_KEYS).not.toContain('requireGovgrVerification');
    });
  });

  it('gives every enum setting a value prefix', () => {
    const enumsWithoutPrefix = ACTIVE_GOVERNABLE_SETTING_KEYS.filter(
      (key) => GOVERNABLE_SETTING_DESCRIPTORS[key].type === 'enum' && !SETTING_VALUE_KEY_PREFIXES[key],
    );
    expect(enumsWithoutPrefix).toEqual([]);
  });
});
