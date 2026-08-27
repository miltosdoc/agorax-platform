/**
 * Rules for a live conference room that both the browser and the server need
 * to agree on: who is waiting to speak, and how many people fit.
 *
 * The speaking queue is the interesting one. In a physical assembly a raised
 * hand is settled by the chair's eyes — whoever went up first speaks first,
 * and everyone in the room can check that. A video grid destroys exactly that
 * information: tiles reorder on every active speaker change, and a hand in the
 * fourth row is a hand nobody sees. So the order is recorded (the millisecond
 * the hand went up, carried as a LiveKit participant attribute) and rendered
 * as a list rather than left to the layout. A participant who joins late gets
 * the same list, because attributes are server-held state and are replayed on
 * connect — a data-channel message would not survive that.
 */

/**
 * Participant-attribute key holding the epoch-ms at which the hand went up.
 * Empty string (LiveKit's way of deleting a key) means the hand is down.
 * Prefixed because the attribute map is shared with anything else that ever
 * writes to it.
 */
export const HAND_ATTRIBUTE = 'agorax.handRaisedAt';

/**
 * How many people may hold a connection to one room at once.
 *
 * This is a policy number, not a protocol limit: the SFU would happily take
 * far more, but every extra camera multiplies what every other participant has
 * to download, and the bill and the weakest laptop in the call both notice.
 * Override with LIVEKIT_MAX_PARTICIPANTS when the plan (and the agenda) can
 * carry more.
 */
export const DEFAULT_ROOM_CAPACITY = 25;

/**
 * Above this many cameras a grid stops being a meeting and starts being a
 * contact sheet. Not enforced — the UI says so and lets the room decide.
 */
export const COMFORTABLE_VIDEO_PARTICIPANTS = 12;

export interface HandRaiser {
  identity: string;
  name: string;
  raisedAt: number;
}

/** A participant as far as the queue is concerned. */
export interface QueueCandidate {
  identity: string;
  name?: string | null;
  attributes?: Readonly<Record<string, string>> | undefined;
}

export function parseHandRaisedAt(value: string | null | undefined): number | null {
  if (!value) return null;
  const at = Number(value);
  return Number.isFinite(at) && at > 0 ? at : null;
}

/**
 * Everyone with a hand up, in the order they raised it.
 *
 * Ties break on identity rather than on whatever order the SFU happened to
 * deliver: two hands in the same millisecond must not swap places every time
 * the component re-renders, or the queue stops being evidence of anything.
 */
export function speakerQueue(participants: readonly QueueCandidate[]): HandRaiser[] {
  return participants
    .map(p => ({
      identity: p.identity,
      name: (p.name ?? '').trim() || p.identity,
      raisedAt: parseHandRaisedAt(p.attributes?.[HAND_ATTRIBUTE]),
    }))
    .filter((p): p is HandRaiser => p.raisedAt !== null)
    .sort((a, b) => a.raisedAt - b.raisedAt || a.identity.localeCompare(b.identity));
}

/** 1-based place in the queue, or null when that hand is down. */
export function queuePositionOf(queue: readonly HandRaiser[], identity: string): number | null {
  const index = queue.findIndex(entry => entry.identity === identity);
  return index === -1 ? null : index + 1;
}

/**
 * The attribute patch that raises or lowers a hand. `now` is passed in rather
 * than read here so the caller — and the test — owns the clock.
 */
export function handAttributePatch(raised: boolean, now: number): Record<string, string> {
  return { [HAND_ATTRIBUTE]: raised ? String(now) : '' };
}

/** Capacity from the environment, clamped to something a room can survive. */
export function readRoomCapacity(raw: string | undefined): number {
  // Number('') is 0, which is finite — an env var that is present but empty
  // would otherwise cap every room at two people.
  if (!raw || !raw.trim()) return DEFAULT_ROOM_CAPACITY;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_ROOM_CAPACITY;
  return Math.min(200, Math.max(2, Math.floor(parsed)));
}
