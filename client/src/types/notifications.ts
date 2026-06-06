export interface SortitionNotification {
  id: number;
  userId: number;
  type:
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
    | 'new_media';
  title: string;
  message: string | null;
  sortitionBodyId: number | null;
  proposalId: number | null;
  communityId: number | null;
  read: boolean;
  actionUrl: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationsResponse {
  notifications: SortitionNotification[];
  unreadCount: number;
  total: number;
}

export const notificationTypeConfig: Record<SortitionNotification['type'], { icon: string; color: string }> = {
  sortition_assigned: { icon: '🎯', color: 'bg-blue-50 border-blue-200' },
  sortition_deadline: { icon: '⏰', color: 'bg-amber-50 border-amber-200' },
  sortition_reminder: { icon: '🔔', color: 'bg-yellow-50 border-yellow-200' },
  proposal_advanced: { icon: '📈', color: 'bg-green-50 border-green-200' },
  amendment_ready: { icon: '✏️', color: 'bg-purple-50 border-purple-200' },
  vote_started: { icon: '🗳️', color: 'bg-indigo-50 border-indigo-200' },
  conference_scheduled: { icon: '🎙️', color: 'bg-teal-50 border-teal-200' },
  conference_starting: { icon: '🎙️', color: 'bg-teal-50 border-teal-200' },
  sortition_room_opened: { icon: '🎙️', color: 'bg-teal-50 border-teal-200' },
  new_proposal: { icon: '📝', color: 'bg-emerald-50 border-emerald-200' },
  new_media: { icon: '🎧', color: 'bg-rose-50 border-rose-200' },
};
