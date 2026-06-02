/**
 * Conference notification + iCalendar helpers.
 *
 * Two fan-outs live here:
 *   • notifyConferenceScheduled — when a community admin opens a community
 *     room, every member of that community gets an in-app notification.
 *   • notifyRoomOpened — when a sortition body's deliberation room is
 *     created, every member of that body gets one. Body members already
 *     subscribed to sortition_assigned-style events, so this matches.
 *
 * The .ics generator produces a minimal RFC 5545 calendar entry that
 * downloads cleanly into Google Calendar / Apple Calendar / Outlook.
 */

import { db } from '../db';
import { communityMembers, sortitionMembers } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createNotification } from './notifications';
import { logger } from './logger';

export interface ConferenceNotificationInput {
  roomId: number;
  communityId: number;
  sortitionBodyId?: number | null;
  title: string;
  scheduledAt?: Date | null;
  /** Stable URL the bell click should navigate to. */
  actionUrl: string;
}

/**
 * Notify every community member that a conference has been scheduled
 * (or is about to start, depending on `kind`). The author is excluded
 * since they just created the room.
 */
export async function notifyConferenceScheduled(
  input: ConferenceNotificationInput,
  authorUserId: number,
  kind: 'conference_scheduled' | 'conference_starting' = 'conference_scheduled',
): Promise<void> {
  try {
    const members = await db
      .select({ userId: communityMembers.userId })
      .from(communityMembers)
      .where(eq(communityMembers.communityId, input.communityId));
    const recipients = members.map(m => m.userId).filter(uid => uid !== authorUserId);
    const message = input.scheduledAt
      ? `Συνάντηση στις ${input.scheduledAt.toLocaleString('el-GR')}`
      : 'Η συνάντηση είναι ενεργή.';
    await Promise.all(recipients.map(uid => createNotification({
      userId: uid,
      type: kind,
      title: input.title,
      message,
      communityId: input.communityId,
      actionUrl: input.actionUrl,
    })));
  } catch (err: any) {
    // A notification failure must never block the room creation that
    // triggered it — we already returned the room row to the caller.
    logger.warn('conference notify fan-out failed', { roomId: input.roomId, err: err?.message });
  }
}

/**
 * Notify every sortition body member that their deliberation room is
 * open. The opener is excluded.
 */
export async function notifyRoomOpened(
  input: ConferenceNotificationInput,
  openerUserId: number,
): Promise<void> {
  if (!input.sortitionBodyId) return;
  try {
    const members = await db
      .select({ userId: sortitionMembers.userId })
      .from(sortitionMembers)
      .where(eq(sortitionMembers.bodyId, input.sortitionBodyId));
    const recipients = members.map(m => m.userId).filter(uid => uid !== openerUserId);
    await Promise.all(recipients.map(uid => createNotification({
      userId: uid,
      type: 'sortition_room_opened',
      title: 'Αίθουσα συσκέψεων κληρωτού σώματος',
      message: input.title,
      sortitionBodyId: input.sortitionBodyId!,
      communityId: input.communityId,
      actionUrl: input.actionUrl,
    })));
  } catch (err: any) {
    logger.warn('sortition room notify fan-out failed', { roomId: input.roomId, err: err?.message });
  }
}

// ─── iCalendar generation ────────────────────────────────────────────────────

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** RFC 5545 UTC timestamp: YYYYMMDDTHHMMSSZ */
function icsDate(date: Date): string {
  return (
    date.getUTCFullYear().toString()
    + pad(date.getUTCMonth() + 1)
    + pad(date.getUTCDate())
    + 'T'
    + pad(date.getUTCHours())
    + pad(date.getUTCMinutes())
    + pad(date.getUTCSeconds())
    + 'Z'
  );
}

/** Escape commas, semicolons, and newlines per RFC 5545. */
function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r?\n/g, '\\n');
}

export interface IcsInput {
  uid: string;                    // stable id, e.g. `agorax-room-42@<host>`
  title: string;
  description?: string;
  url: string;                    // join URL — opens the room page
  start: Date;
  durationMinutes?: number;       // default 60
}

/**
 * Produce a single VEVENT iCalendar payload. Folds long lines per spec.
 */
export function buildIcs(input: IcsInput): string {
  const start = input.start;
  const end = new Date(start.getTime() + (input.durationMinutes ?? 60) * 60_000);
  const dtstamp = icsDate(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AgoraX//Conference//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(input.title)}`,
    input.description ? `DESCRIPTION:${icsEscape(input.description)}` : null,
    `URL:${input.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean) as string[];
  // RFC 5545 line folding: limit lines to 75 octets, continuation with CRLF + space.
  const folded = lines.map(line => {
    if (line.length <= 75) return line;
    const chunks: string[] = [];
    for (let i = 0; i < line.length; i += 73) chunks.push(line.slice(i, i + 73));
    return chunks.join('\r\n ');
  });
  return folded.join('\r\n');
}
