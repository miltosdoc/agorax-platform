/**
 * Sortition Notification System
 * 
 * Creates and manages notifications for sortition lifecycle events:
 * - sortition_assigned: User selected for a sortition body
 * - sortition_deadline: Deadline approaching for sortition response
 * - sortition_reminder: Reminder to complete sortition assignment
 * - proposal_advanced: Proposal moved to next stage
 * - amendment_ready: Amendments ready for review
 * - vote_started: Voting opened on a proposal
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { sortitionNotifications } from '@shared/schema';
import { notificationBus } from './notification-bus';
import { pushToUsers } from './push-client';

// ─── Notification Types ─────────────────────────────────────────────────────

export type NotificationType =
  | 'sortition_assigned'
  | 'sortition_deadline'
  | 'sortition_reminder'
  | 'proposal_advanced'
  | 'amendment_ready'
  | 'vote_started'
  | 'conference_scheduled'
  | 'conference_starting'
  | 'sortition_room_opened'
  | 'new_proposal'
  | 'new_media'
  | 'file_lost'
  | 'deliberation_reminder';

interface CreateNotificationParams {
  userId: number;
  type: NotificationType;
  title: string;
  message?: string;
  sortitionBodyId?: number;
  proposalId?: number;
  communityId?: number;
  actionUrl?: string;
}

// ─── Core: Create Notification ──────────────────────────────────────────────

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  // Check user preferences before sending
  const prefs = await getUserPreferences(params.userId);
  if (prefs && !isNotificationEnabled(prefs, params.type)) {
    return; // User opted out of this notification type
  }

  await db.insert(sortitionNotifications).values({
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message ?? null,
    sortitionBodyId: params.sortitionBodyId ?? null,
    proposalId: params.proposalId ?? null,
    communityId: params.communityId ?? null,
    actionUrl: params.actionUrl ?? null,
  });

  notificationBus.publish({
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message ?? null,
    sortitionBodyId: params.sortitionBodyId ?? null,
    proposalId: params.proposalId ?? null,
    communityId: params.communityId ?? null,
    actionUrl: params.actionUrl ?? null,
    createdAt: new Date().toISOString(),
  });

  // Fan out to Web Push subscriptions so opted-in browsers get a real OS
  // notification even when the tab is closed. Silent no-op if VAPID isn't
  // configured or the user has no active subscription.
  void pushToUsers([params.userId], {
    title: params.title,
    body: params.message ?? '',
    url: params.actionUrl ?? '/notifications',
    tag: `agorax-${params.type}-${params.proposalId ?? params.sortitionBodyId ?? 'x'}`,
  });
}

// ─── Batch: Notify Community of New Proposal ────────────────────────────────

export async function notifyNewProposal(
  proposalId: number,
  communityId: number,
  proposalQuestion: string,
  authorUserId: number,
): Promise<number> {
  const members = await db.execute(sql`
    SELECT cm.user_id FROM community_members cm
    WHERE cm.community_id = ${communityId} AND cm.user_id <> ${authorUserId}
  `);
  let notified = 0;
  const short = proposalQuestion.length > 120
    ? proposalQuestion.slice(0, 117) + '…'
    : proposalQuestion;
  for (const member of members.rows) {
    const userId = member.user_id as number;
    await createNotification({
      userId,
      type: 'new_proposal',
      title: 'Νέα πρόταση στην κοινότητά σου',
      message: short,
      proposalId,
      communityId,
      actionUrl: `/proposals/${proposalId}`,
    });
    notified++;
  }
  return notified;
}

// ─── Batch: Notify Community of New Media on a Proposal ─────────────────────

export async function notifyNewMedia(
  proposalId: number,
  communityId: number,
  kind: 'podcast' | 'video' | 'document',
  uploaderUserId: number,
  proposalQuestion: string,
): Promise<number> {
  const members = await db.execute(sql`
    SELECT cm.user_id FROM community_members cm
    WHERE cm.community_id = ${communityId} AND cm.user_id <> ${uploaderUserId}
  `);
  let notified = 0;
  const label = kind === 'podcast' ? 'podcast' : kind === 'video' ? 'βίντεο' : 'έγγραφο';
  const short = proposalQuestion.length > 100
    ? proposalQuestion.slice(0, 97) + '…'
    : proposalQuestion;
  for (const member of members.rows) {
    const userId = member.user_id as number;
    await createNotification({
      userId,
      type: 'new_media',
      title: `Νέο ${label} σε πρόταση`,
      message: short,
      proposalId,
      communityId,
      actionUrl: `/proposals/${proposalId}`,
    });
    notified++;
  }
  return notified;
}

// ─── Personal: Notify uploader their file was lost ──────────────────────────

export async function notifyFileLost(
  uploaderId: number,
  proposalId: number,
  kind: 'podcast' | 'video' | 'document',
): Promise<void> {
  const label = kind === 'podcast' ? 'podcast' : kind === 'video' ? 'βίντεο' : 'έγγραφο';
  await createNotification({
    userId: uploaderId,
    type: 'file_lost',
    title: `Το αρχείο ${label} σας χάθηκε`,
    message: 'Το αρχείο σας δεν βρέθηκε στον διακομιστή (πιθανώς λόγω επανεκκίνησης). Παρακαλώ ανεβάστε ξανά.',
    proposalId,
    actionUrl: `/proposals/${proposalId}`,
  });
}

// ─── Batch: Notify Sortition Members ────────────────────────────────────────

export async function notifySortitionMembers(
  bodyId: number,
  communityId: number,
  proposalId: number | null,
  responseHours: number
): Promise<number> {
  // Get all members of the sortition body
  const members = await db.execute(sql`
    SELECT sm.user_id FROM sortition_members sm
    WHERE sm.body_id = ${bodyId}
  `);

  let notified = 0;
  const hoursLabel = responseHours.toString();

  for (const member of members.rows) {
    const userId = member.user_id as number;
    await createNotification({
      userId,
      type: 'sortition_assigned',
      title: 'Sortition Assignment',
      message: `You have been selected for a sortition body. You have ${hoursLabel} hours to respond.`,
      sortitionBodyId: bodyId,
      proposalId: proposalId || undefined,
      communityId,
      actionUrl: `/sortition/${bodyId}`,
    });
    notified++;
  }

  return notified;
}

// ─── Batch: Notify Community of Proposal Advancement ────────────────────────

export async function notifyProposalAdvanced(
  proposalId: number,
  communityId: number,
  newStatus: string,
  proposalTitle: string
): Promise<number> {
  // Get all community members
  const members = await db.execute(sql`
    SELECT cm.user_id FROM community_members cm
    WHERE cm.community_id = ${communityId}
  `);

  const short = proposalTitle.length > 100 ? proposalTitle.slice(0, 97) + '…' : proposalTitle;
  // Member-facing stage announcements — only stages where members act or
  // learn an outcome get a tailored message.
  const stageMessage: Record<string, { title: string; message: string }> = {
    community_signal: {
      title: 'Σήμα κοινότητας — ψηφίστε τροπολογίες',
      message: `Ψηφίστε ⬆/⬇ στις τροπολογίες της πρότασης «${short}».`,
    },
    decided: {
      title: 'Η πρόταση ολοκληρώθηκε',
      message: `Η ψηφοφορία για την πρόταση «${short}» ολοκληρώθηκε — δείτε το αποτέλεσμα.`,
    },
  };
  const text = stageMessage[newStatus] ?? {
    title: 'Η πρόταση προχώρησε',
    message: `Η πρόταση «${short}» πέρασε σε νέο στάδιο.`,
  };

  let notified = 0;
  for (const member of members.rows) {
    const userId = member.user_id as number;
    await createNotification({
      userId,
      type: 'proposal_advanced',
      title: text.title,
      message: text.message,
      proposalId,
      communityId,
      actionUrl: `/proposals/${proposalId}`,
    });
    notified++;
  }

  return notified;
}

// ─── Batch: Notify Community of New Amendment ───────────────────────────────

export async function notifyNewAmendment(
  proposalId: number,
  communityId: number,
  amendmentAuthorId: number,
  proposalQuestion: string,
): Promise<number> {
  const members = await db.execute(sql`
    SELECT cm.user_id FROM community_members cm
    WHERE cm.community_id = ${communityId} AND cm.user_id <> ${amendmentAuthorId}
  `);
  let notified = 0;
  const short = proposalQuestion.length > 100
    ? proposalQuestion.slice(0, 97) + '…'
    : proposalQuestion;
  for (const member of members.rows) {
    const userId = member.user_id as number;
    await createNotification({
      userId,
      type: 'amendment_ready',
      title: 'Νέα τροπολογία σε πρόταση',
      message: short,
      proposalId,
      communityId,
      actionUrl: `/proposals/${proposalId}`,
    });
    notified++;
  }
  return notified;
}

// ─── Batch: Notify Vote Started ─────────────────────────────────────────────

export async function notifyVoteStarted(
  proposalId: number,
  communityId: number,
  proposalTitle: string
): Promise<number> {
  const members = await db.execute(sql`
    SELECT cm.user_id FROM community_members cm
    WHERE cm.community_id = ${communityId}
  `);

  let notified = 0;
  for (const member of members.rows) {
    const userId = member.user_id as number;
    await createNotification({
      userId,
      type: 'vote_started',
      title: 'Ξεκίνησε ψηφοφορία',
      message: `Η ψηφοφορία για την πρόταση «${proposalTitle.length > 100 ? proposalTitle.slice(0, 97) + '…' : proposalTitle}» είναι ανοιχτή — δώστε την ψήφο σας!`,
      proposalId,
      communityId,
      actionUrl: `/proposals/${proposalId}`,
    });
    notified++;
  }

  return notified;
}

// ─── Deadline Reminder ──────────────────────────────────────────────────────

/**
 * True if this user already got this notification type for this subject.
 * The sweep runs on a timer, so without this every pass would re-notify —
 * one reminder per deadline, not one every ten minutes.
 */
async function alreadyReminded(
  userId: number,
  type: NotificationType,
  subject: { proposalId?: number; sortitionBodyId?: number },
): Promise<boolean> {
  const scope = subject.proposalId != null
    ? sql`proposal_id = ${subject.proposalId}`
    : sql`sortition_body_id = ${subject.sortitionBodyId}`;
  const existing = await db.execute(sql`
    SELECT 1 FROM sortition_notifications
    WHERE user_id = ${userId} AND type = ${type} AND ${scope}
      AND created_at > NOW() - INTERVAL '24 hours'
    LIMIT 1
  `);
  return existing.rows.length > 0;
}

/**
 * Remind proposal authors who still have amendments they have not judged.
 * An unjudged amendment is dropped by the merge, so silence here means the
 * vote opens on text the deliberation never touched — the failure is silent
 * unless we say something before the deadline.
 */
async function remindAuthorsOfPendingAmendments(): Promise<number> {
  const rows = await db.execute(sql`
    SELECT p.id, p.author_id, p.question, p.community_id, p.phase_deadline,
           count(a.id) AS pending
    FROM proposals p
    JOIN proposal_amendments a
      ON a.proposal_id = p.id
     AND a.parent_amendment_id IS NULL
     AND a.author_decision IS NULL
    WHERE p.status = 'community_signal'
      AND p.phase_deadline IS NOT NULL
      AND p.phase_deadline > NOW()
      AND p.phase_deadline < NOW() + INTERVAL '12 hours'
    GROUP BY p.id
  `);

  let reminded = 0;
  for (const row of rows.rows) {
    const proposalId = row.id as number;
    const authorId = row.author_id as number;
    if (await alreadyReminded(authorId, 'deliberation_reminder', { proposalId })) continue;
    const pending = Number(row.pending);
    await createNotification({
      userId: authorId,
      type: 'deliberation_reminder',
      title: 'Εκκρεμούν τροπολογίες στην πρότασή σας',
      message:
        `${pending} ${pending === 1 ? 'τροπολογία δεν έχει κριθεί' : 'τροπολογίες δεν έχουν κριθεί'}. `
        + 'Όσες δεν αποδεχτείτε δεν θα ενσωματωθούν στο τελικό κείμενο. '
        + 'Η διαβούλευση κλείνει σε λιγότερο από 12 ώρες.',
      proposalId,
      communityId: (row.community_id as number) || undefined,
      actionUrl: `/proposals/${proposalId}/amendments/review`,
    });
    reminded++;
  }
  return reminded;
}

export async function sendDeadlineReminders(): Promise<number> {
  const authorReminders = await remindAuthorsOfPendingAmendments();

  // Find sortition bodies that are active and approaching deadline
  const bodies = await db.execute(sql`
    SELECT sb.id, sb.response_hours, sb.selected_at, sb.proposal_id, sb.community_id
    FROM sortition_bodies sb
    WHERE sb.status = 'active'
      AND sb.selected_at IS NOT NULL
      AND (sb.selected_at + (sb.response_hours || ' hours')::interval) > NOW()
      AND (sb.selected_at + (sb.response_hours || ' hours')::interval) < NOW() + INTERVAL '24 hours'
  `);

  let reminded = 0;
  for (const body of bodies.rows) {
    // Find members who haven't responded
    const unresponsive = await db.execute(sql`
      SELECT sm.user_id FROM sortition_members sm
      WHERE sm.body_id = ${body.id} AND sm.responded = FALSE
    `);

    for (const member of unresponsive.rows) {
      const userId = member.user_id as number;
      const bodyId = body.id as number;
      if (await alreadyReminded(userId, 'sortition_reminder', { sortitionBodyId: bodyId })) continue;
      await createNotification({
        userId,
        type: 'sortition_reminder',
        title: 'Deadline Approaching',
        message: 'Your sortition assignment deadline is approaching. Please complete your evaluation.',
        sortitionBodyId: body.id as number,
        proposalId: (body.proposal_id as number) || undefined,
        communityId: body.community_id as number,
        actionUrl: `/sortition/${body.id}`,
      });
      reminded++;
    }
  }

  return reminded;
}

// ─── User Preferences ───────────────────────────────────────────────────────

interface NotificationPreferences {
  sortition_assigned: boolean;
  sortition_deadline: boolean;
  sortition_reminder: boolean;
  proposal_advanced: boolean;
  amendment_ready: boolean;
  vote_started: boolean;
  reminder_hours_before: number;
}

async function getUserPreferences(userId: number): Promise<NotificationPreferences | null> {
  const result = await db.execute(sql`
    SELECT * FROM notification_preferences WHERE user_id = ${userId}
  `);
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    sortition_assigned: row.sortition_assigned as boolean,
    sortition_deadline: row.sortition_deadline as boolean,
    sortition_reminder: row.sortition_reminder as boolean,
    proposal_advanced: row.proposal_advanced as boolean,
    amendment_ready: row.amendment_ready as boolean,
    vote_started: row.vote_started as boolean,
    reminder_hours_before: row.reminder_hours_before as number,
  };
}

function isNotificationEnabled(prefs: NotificationPreferences, type: NotificationType): boolean {
  const map: Partial<Record<NotificationType, keyof NotificationPreferences>> = {
    sortition_assigned: 'sortition_assigned',
    sortition_deadline: 'sortition_deadline',
    sortition_reminder: 'sortition_reminder',
    proposal_advanced: 'proposal_advanced',
    amendment_ready: 'amendment_ready',
    vote_started: 'vote_started',
  };
  const key = map[type];
  // New notification types (conference_*, sortition_room_opened) don't have
  // a dedicated preference yet — they're on by default. A future migration
  // can add columns and an opt-out UI.
  if (!key) return true;
  return prefs[key] as boolean;
}

export async function getOrCreatePreferences(userId: number): Promise<NotificationPreferences> {
  let prefs = await getUserPreferences(userId);
  if (!prefs) {
    await db.execute(sql`
      INSERT INTO notification_preferences (user_id) VALUES (${userId})
      ON CONFLICT (user_id) DO NOTHING
    `);
    prefs = await getUserPreferences(userId);
  }
  return prefs!;
}

export async function updatePreferences(
  userId: number,
  updates: Partial<NotificationPreferences>
): Promise<void> {
  const setClauses: string[] = [];
  if (updates.sortition_assigned !== undefined) setClauses.push(`sortition_assigned = ${updates.sortition_assigned}`);
  if (updates.sortition_deadline !== undefined) setClauses.push(`sortition_deadline = ${updates.sortition_deadline}`);
  if (updates.sortition_reminder !== undefined) setClauses.push(`sortition_reminder = ${updates.sortition_reminder}`);
  if (updates.proposal_advanced !== undefined) setClauses.push(`proposal_advanced = ${updates.proposal_advanced}`);
  if (updates.amendment_ready !== undefined) setClauses.push(`amendment_ready = ${updates.amendment_ready}`);
  if (updates.vote_started !== undefined) setClauses.push(`vote_started = ${updates.vote_started}`);
  if (updates.reminder_hours_before !== undefined) setClauses.push(`reminder_hours_before = ${updates.reminder_hours_before}`);

  if (setClauses.length > 0) {
    setClauses.push(`updated_at = NOW()`);
    await db.execute(sql.raw(`
      UPDATE notification_preferences SET ${setClauses.join(', ')} WHERE user_id = ${userId}
    `));
  }
}
