/**
 * The member's public handle.
 *
 * The username is the one label the platform shows wherever a member appears,
 * so it carries every constraint the display name does not. These tests pin
 * the two that matter most: a handle cannot be used to impersonate, and it
 * cannot be changed so often that it stops identifying anyone.
 */

import { describe, expect, it } from 'vitest';
import {
  RESERVED_USERNAMES,
  USERNAME_CHANGE_COOLDOWN_DAYS,
  normalizeUsername,
  publicHandle,
  publicLabel,
  usernameChangeAvailableAt,
  validateUsername,
} from '../../shared/user-identity';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe('normalizing a handle', () => {
  it('strips the @ people type and lowercases', () => {
    expect(normalizeUsername('@Miltos')).toBe('miltos');
    expect(normalizeUsername('  NIKOS  ')).toBe('nikos');
  });

  it('survives nothing at all', () => {
    expect(normalizeUsername(undefined)).toBe('');
    expect(normalizeUsername(null)).toBe('');
  });
});

describe('validating a handle', () => {
  it('accepts an ordinary one', () => {
    expect(validateUsername('miltos')).toEqual({ ok: true, username: 'miltos' });
    expect(validateUsername('nikos.papadopoulos')).toEqual({ ok: true, username: 'nikos.papadopoulos' });
    expect(validateUsername('a1_b-c')).toEqual({ ok: true, username: 'a1_b-c' });
  });

  it('refuses one too short to identify anyone', () => {
    expect(validateUsername('ab')).toEqual({ ok: false, reason: 'too_short' });
  });

  it('refuses one too long for a member list', () => {
    expect(validateUsername('a'.repeat(31))).toEqual({ ok: false, reason: 'too_long' });
  });

  it('refuses Greek letters, because they can be used to impersonate', () => {
    // Greek ο and Latin o draw the same shape. Allowing both would let a
    // member register a handle indistinguishable from another member's in
    // any list, while resolving to a different person.
    expect(validateUsername('νικος')).toEqual({ ok: false, reason: 'charset' });
    expect(validateUsername('nikοs')).toEqual({ ok: false, reason: 'charset' }); // omicron smuggled in
  });

  it('refuses spaces, @ inside, and punctuation at the edges', () => {
    expect(validateUsername('two words')).toEqual({ ok: false, reason: 'charset' });
    expect(validateUsername('a@b')).toEqual({ ok: false, reason: 'charset' });
    expect(validateUsername('.leading')).toEqual({ ok: false, reason: 'charset' });
    expect(validateUsername('trailing-')).toEqual({ ok: false, reason: 'charset' });
  });

  it('refuses handles that would borrow the platform’s authority', () => {
    for (const reserved of ['admin', 'agorax', 'moderator', 'support', 'system']) {
      expect(validateUsername(reserved)).toEqual({ ok: false, reason: 'reserved' });
    }
    expect(RESERVED_USERNAMES).toContain('admin');
  });

  it('refuses a reserved name however it is typed', () => {
    expect(validateUsername('@ADMIN')).toEqual({ ok: false, reason: 'reserved' });
  });
});

describe('the wait between renames', () => {
  it('lets a member who has never renamed do it now', () => {
    expect(usernameChangeAvailableAt(null)).toBeNull();
    expect(usernameChangeAvailableAt(undefined)).toBeNull();
  });

  it('holds a member who renamed today', () => {
    const at = usernameChangeAvailableAt(new Date());
    expect(at).toBeInstanceOf(Date);
  });

  it('releases them once the wait has passed', () => {
    expect(usernameChangeAvailableAt(daysAgo(USERNAME_CHANGE_COOLDOWN_DAYS + 1))).toBeNull();
  });

  it('still holds them the day before', () => {
    expect(usernameChangeAvailableAt(daysAgo(USERNAME_CHANGE_COOLDOWN_DAYS - 1))).toBeInstanceOf(Date);
  });

  it('treats an unreadable stamp as never having renamed rather than locking them out forever', () => {
    expect(usernameChangeAvailableAt('not a date')).toBeNull();
  });
});

describe('the label shown for a member', () => {
  it('is the display name', () => {
    expect(publicLabel({ name: 'Μιλτος Τριανταφύλλου', username: 'miltos', id: 6 }))
      .toBe('Μιλτος Τριανταφύλλου');
  });

  it('falls back to the handle when no name is set', () => {
    expect(publicLabel({ name: '', username: 'miltos', id: 6 })).toBe('miltos');
  });

  it('falls back to the number when the account is gone', () => {
    // A deleted account still has authored arguments on the record.
    expect(publicLabel({ name: null, username: null, id: 6 })).toBe('#6');
    expect(publicLabel(null)).toBe('—');
  });
});

describe('the handle shown beside the name', () => {
  it('is prefixed, because that is how people type it', () => {
    expect(publicHandle({ username: 'miltos' })).toBe('@miltos');
  });

  it('is absent rather than empty when there is none', () => {
    // Names are not unique, so the handle is what separates two members who
    // share one; a caller must be able to tell it is missing.
    expect(publicHandle({ username: null })).toBeNull();
    expect(publicHandle(null)).toBeNull();
  });
});
