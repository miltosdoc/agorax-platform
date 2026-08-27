/**
 * The speaking queue.
 *
 * The whole point of it is that it is checkable: whoever raised their hand
 * first is first, and the order does not change because somebody coughed near
 * a microphone. So the tests are about ordering under adversarial conditions —
 * simultaneous raises, arrivals out of order, a participant who leaves.
 */

import { describe, expect, it } from 'vitest';
import {
  COMFORTABLE_VIDEO_PARTICIPANTS,
  DEFAULT_ROOM_CAPACITY,
  HAND_ATTRIBUTE,
  handAttributePatch,
  parseHandRaisedAt,
  queuePositionOf,
  readRoomCapacity,
  speakerQueue,
} from '../../shared/conference';

const at = (identity: string, name: string, raisedAt?: number) => ({
  identity,
  name,
  attributes: raisedAt === undefined ? {} : { [HAND_ATTRIBUTE]: String(raisedAt) },
});

describe('speaker queue', () => {
  it('lists only raised hands, first raised first', () => {
    const queue = speakerQueue([
      at('user-3', 'Γιώργος', 3_000),
      at('user-1', 'Μαρία', 1_000),
      at('user-9', 'Σιωπηλός'),
      at('user-2', 'Ελένη', 2_000),
    ]);
    expect(queue.map(e => e.name)).toEqual(['Μαρία', 'Ελένη', 'Γιώργος']);
  });

  it('breaks a simultaneous raise deterministically', () => {
    // Two hands in the same millisecond must not swap places between renders.
    const people = [at('user-2', 'Β', 5_000), at('user-1', 'Α', 5_000)];
    const first = speakerQueue(people).map(e => e.identity);
    const second = speakerQueue([...people].reverse()).map(e => e.identity);
    expect(first).toEqual(second);
    expect(first).toEqual(['user-1', 'user-2']);
  });

  it('treats an empty attribute as a lowered hand', () => {
    expect(speakerQueue([{ identity: 'user-1', name: 'Α', attributes: { [HAND_ATTRIBUTE]: '' } }])).toEqual([]);
    expect(speakerQueue([{ identity: 'user-1', name: 'Α', attributes: undefined }])).toEqual([]);
    expect(parseHandRaisedAt('nonsense')).toBeNull();
    expect(parseHandRaisedAt('0')).toBeNull();
    expect(parseHandRaisedAt('-5')).toBeNull();
    expect(parseHandRaisedAt('1750000000000')).toBe(1750000000000);
  });

  it('falls back to the identity when a participant has no display name', () => {
    expect(speakerQueue([at('user-7', '   ', 1)])[0].name).toBe('user-7');
  });

  it('reports a 1-based position, and nothing for a hand that is down', () => {
    const queue = speakerQueue([at('user-1', 'Α', 1), at('user-2', 'Β', 2)]);
    expect(queuePositionOf(queue, 'user-1')).toBe(1);
    expect(queuePositionOf(queue, 'user-2')).toBe(2);
    expect(queuePositionOf(queue, 'user-3')).toBeNull();
  });

  it('closes the gap when the person ahead of you speaks and lowers their hand', () => {
    const people = [at('user-1', 'Α', 1), at('user-2', 'Β', 2), at('user-3', 'Γ', 3)];
    expect(queuePositionOf(speakerQueue(people), 'user-3')).toBe(3);
    people[0] = at('user-1', 'Α');
    expect(queuePositionOf(speakerQueue(people), 'user-3')).toBe(2);
  });

  it('raises and lowers through the attribute map', () => {
    expect(handAttributePatch(true, 1234)).toEqual({ [HAND_ATTRIBUTE]: '1234' });
    // Empty string is how LiveKit deletes an attribute key.
    expect(handAttributePatch(false, 1234)).toEqual({ [HAND_ATTRIBUTE]: '' });
  });
});

describe('room capacity', () => {
  it('defaults when unset or unparseable', () => {
    expect(readRoomCapacity(undefined)).toBe(DEFAULT_ROOM_CAPACITY);
    expect(readRoomCapacity('')).toBe(DEFAULT_ROOM_CAPACITY);
    expect(readRoomCapacity('plenty')).toBe(DEFAULT_ROOM_CAPACITY);
  });

  it('clamps to something a room can actually survive', () => {
    expect(readRoomCapacity('40')).toBe(40);
    expect(readRoomCapacity('1')).toBe(2);
    expect(readRoomCapacity('100000')).toBe(200);
    expect(readRoomCapacity('12.7')).toBe(12);
  });

  it('keeps the comfort threshold below the hard cap', () => {
    expect(COMFORTABLE_VIDEO_PARTICIPANTS).toBeLessThan(DEFAULT_ROOM_CAPACITY);
  });
});
