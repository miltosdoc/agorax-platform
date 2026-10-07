/** Stable identities and pagination shared by every activity stream. */
export const FEED_SOURCES = ['proposal', 'survey', 'proposal-media', 'community-media'] as const;
export type FeedSource = typeof FEED_SOURCES[number];
export type FeedScope = 'mine' | 'discover' | 'all';
export type FeedStage = 'active' | 'completed' | 'all';
export type FeedKind = 'all' | 'proposal' | 'survey' | 'podcast' | 'video';

export interface ActivityItem {
  id: number;
  feedKey: string;
  source: FeedSource;
  feedType: 'proposal' | 'survey' | 'media';
  createdAt: string;
  communityId: number | null;
  communityName: string | null;
  actorId: number | null;
  actorName: string | null;
  actorUsername: string | null;
  viewerIsMember: boolean;
  joinPolicy: string | null;
  title?: string | null;
  question?: string;
  solution?: string | null;
  description?: string | null;
  status?: string;
  kind?: string;
  tier?: string;
  topicTag?: string;
  thumbnailKey?: string | null;
  phaseDeadline?: string | null;
  proposalId?: number | null;
  proposalQuestion?: string | null;
  filePath?: string;
  thumbPath?: string | null;
  durationS?: string | null;
  isFeatured?: boolean;
  // Kept for existing media shelves and compact contextual rails.
  uploaderName?: string | null;
  authorName?: string | null;
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}

export interface FeedCursor { createdAt: string; source: FeedSource; id: number }

export function encodeFeedCursor(item: Pick<ActivityItem, 'createdAt' | 'source' | 'id'>): string {
  return `${new Date(item.createdAt).toISOString()}|${item.source}|${item.id}`;
}

export function decodeFeedCursor(raw: unknown): FeedCursor | null {
  if (typeof raw !== 'string' || raw.length > 180) return null;
  const parts = raw.split('|');
  if (parts.length !== 3 || !FEED_SOURCES.includes(parts[1] as FeedSource)) return null;
  const date = new Date(parts[0]);
  const id = Number(parts[2]);
  if (!Number.isFinite(date.getTime()) || !Number.isSafeInteger(id) || id < 1) return null;
  return { createdAt: date.toISOString(), source: parts[1] as FeedSource, id };
}

/** Newest first, deterministic even when different tables share a timestamp/id. */
export function compareFeedItems(a: Pick<ActivityItem, 'createdAt' | 'source' | 'id'>, b: Pick<ActivityItem, 'createdAt' | 'source' | 'id'>): number {
  const byTime = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (byTime) return byTime;
  if (a.source !== b.source) return a.source < b.source ? 1 : -1;
  return b.id - a.id;
}

export function isAfterFeedCursor(item: Pick<ActivityItem, 'createdAt' | 'source' | 'id'>, cursor: FeedCursor): boolean {
  return compareFeedItems(item, cursor) > 0;
}

export const ACTIVE_PROPOSAL_STATES = ['review', 'author_review', 'community_signal', 'final_review', 'sortition_synthesis', 'voting'] as const;
