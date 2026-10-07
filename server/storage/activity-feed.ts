import { existsSync } from 'node:fs';
import path from 'node:path';
import { and, desc, eq, ilike, inArray, isNull, lt, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { communities, communityMembers, communityMedia, proposalMedia, proposals, surveyPolls, users } from '@shared/schema';
import { ACTIVE_PROPOSAL_STATES, compareFeedItems, encodeFeedCursor, type ActivityItem, type ActivityPage, type FeedCursor, type FeedKind, type FeedScope, type FeedSource, type FeedStage } from '@shared/activity-feed';
import { MEDIA_ROOT } from '../utils/media-rules';

export interface ActivityFeedOptions {
  viewerId?: number;
  scope: FeedScope;
  stage: FeedStage;
  kind: FeedKind;
  search?: string;
  communityId?: number;
  cursor?: FeedCursor | null;
  limit: number;
}

export async function getActivityFeed(opts: ActivityFeedOptions): Promise<ActivityPage> {
  const member = opts.viewerId
    ? sql<boolean>`exists(select 1 from ${communityMembers} where ${communityMembers.communityId} = ${communities.id} and ${communityMembers.userId} = ${opts.viewerId})`
    : sql<boolean>`false`;
  // Apply visibility and scope IN the query, before LIMIT. Restricted items
  // cannot displace visible rows or make pagination end prematurely.
  const visible = or(isNull(communities.id), isNull(communities.contentVisibility), ne(communities.contentVisibility, 'members'), member)!;
  const common: SQL[] = [visible];
  if (opts.scope === 'mine') common.push(member);
  if (opts.scope === 'discover') common.push(sql`not (${member})`);
  if (opts.communityId) common.push(eq(communities.id, opts.communityId));
  const batch = opts.limit + 1;
  const normalizedTime = (column: AnyPgColumn) => sql`date_trunc('milliseconds', ${column})`;
  const pattern = opts.search ? `%${opts.search.replace(/[\\%_]/g, '\\$&')}%` : undefined;
  const searchFor = (title: AnyPgColumn) => opts.search
    ? or(ilike(title, pattern!), ilike(communities.name, pattern!), ilike(users.name, pattern!), ilike(users.username, pattern!))
    : undefined;
  const cursorFor = (createdAt: AnyPgColumn, id: AnyPgColumn, source: FeedSource) => {
    const cursor = opts.cursor;
    if (!cursor) return undefined;
    const time = normalizedTime(createdAt);
    // Columns store UTC wallclocks without a timezone. Passing a JS Date to
    // a SQL expression bypasses Drizzle's timestamp encoder; node-pg then
    // serializes it in the process's local zone and repeats already-read rows.
    const cursorTime = sql`${cursor.createdAt}::timestamp`;
    return or(lt(time, cursorTime), and(eq(time, cursorTime),
      source < cursor.source ? sql`true` : source === cursor.source ? lt(id, cursor.id) : sql`false`));
  };
  const context = {
    communityId: communities.id, communityName: communities.name,
    actorId: users.id, actorName: users.name, actorUsername: users.username,
    viewerIsMember: member, joinPolicy: communities.joinPolicy,
  };
  const stageFor = opts.stage === 'active' ? inArray(proposals.status, [...ACTIVE_PROPOSAL_STATES])
    : opts.stage === 'completed' ? inArray(proposals.status, ['decided', 'archived'])
    : ne(proposals.status, 'draft');
  const wantProposals = opts.kind === 'all' || opts.kind === 'proposal';
  const wantSurveys = opts.kind === 'all' || opts.kind === 'survey';
  const wantMedia = opts.kind === 'all' || opts.kind === 'podcast' || opts.kind === 'video';
  const mediaKinds = opts.kind === 'podcast' || opts.kind === 'video' ? [opts.kind] : ['podcast', 'video'];

  const [proposalRows, surveyRows, mediaRows, libraryRows] = await Promise.all([
    wantProposals ? db.select({ ...context, id: proposals.id, question: proposals.question,
      solution: proposals.solution, status: proposals.status, kind: proposals.kind,
      thumbnailKey: proposals.thumbnailKey, createdAt: proposals.createdAt, phaseDeadline: proposals.phaseDeadline })
      .from(proposals).innerJoin(communities, eq(proposals.communityId, communities.id)).leftJoin(users, eq(proposals.authorId, users.id))
      .where(and(...common, stageFor, searchFor(proposals.question), cursorFor(proposals.createdAt, proposals.id, 'proposal')))
      .orderBy(desc(normalizedTime(proposals.createdAt)), desc(proposals.id)).limit(batch) : [],
    wantSurveys ? db.select({ ...context, id: surveyPolls.id, title: surveyPolls.title,
      topicTag: surveyPolls.topicTag, tier: surveyPolls.tier, status: surveyPolls.status,
      thumbnailKey: surveyPolls.thumbnailKey, createdAt: surveyPolls.createdAt })
      .from(surveyPolls).leftJoin(communities, eq(surveyPolls.communityId, communities.id)).leftJoin(users, eq(surveyPolls.creatorId, users.id))
      .where(and(...common, inArray(surveyPolls.status, opts.stage === 'active' ? ['live'] : opts.stage === 'completed' ? ['closed'] : ['live', 'closed']),
        searchFor(surveyPolls.title), cursorFor(surveyPolls.createdAt, surveyPolls.id, 'survey')))
      .orderBy(desc(normalizedTime(surveyPolls.createdAt)), desc(surveyPolls.id)).limit(batch) : [],
    wantMedia ? db.select({ ...context, id: proposalMedia.id, proposalId: proposals.id,
      proposalQuestion: proposals.question, title: proposalMedia.title, kind: proposalMedia.kind,
      filePath: proposalMedia.filePath, thumbPath: proposalMedia.thumbPath, durationS: proposalMedia.durationS,
      isFeatured: proposalMedia.isFeatured, createdAt: proposalMedia.createdAt })
      .from(proposalMedia).innerJoin(proposals, eq(proposalMedia.proposalId, proposals.id))
      .innerJoin(communities, eq(proposals.communityId, communities.id)).leftJoin(users, eq(proposalMedia.uploaderId, users.id))
      .where(and(...common, eq(proposalMedia.status, 'published'), inArray(proposalMedia.kind, mediaKinds),
        notInArray(proposals.status, ['draft']), opts.stage === 'active' ? inArray(proposals.status, [...ACTIVE_PROPOSAL_STATES]) : opts.stage === 'completed' ? inArray(proposals.status, ['decided', 'archived']) : undefined,
        opts.search ? or(searchFor(proposalMedia.title), ilike(proposals.question, pattern!)) : undefined,
        cursorFor(proposalMedia.createdAt, proposalMedia.id, 'proposal-media')))
      .orderBy(desc(normalizedTime(proposalMedia.createdAt)), desc(proposalMedia.id)).limit(batch) : [],
    wantMedia && opts.stage !== 'completed' ? db.select({ ...context, id: communityMedia.id,
      title: communityMedia.title, description: communityMedia.description, kind: communityMedia.kind,
      filePath: communityMedia.filePath, thumbPath: communityMedia.thumbPath, durationS: communityMedia.durationS,
      createdAt: communityMedia.createdAt })
      .from(communityMedia).innerJoin(communities, eq(communityMedia.communityId, communities.id)).leftJoin(users, eq(communityMedia.uploaderId, users.id))
      .where(and(...common, eq(communityMedia.status, 'published'), inArray(communityMedia.kind, mediaKinds), searchFor(communityMedia.title),
        cursorFor(communityMedia.createdAt, communityMedia.id, 'community-media')))
      .orderBy(desc(normalizedTime(communityMedia.createdAt)), desc(communityMedia.id)).limit(batch) : [],
  ]);

  const mapRows = (rows: object[], source: FeedSource, feedType: ActivityItem['feedType']): ActivityItem[] => rows.map((row: any) => ({
    ...row, source, feedType, feedKey: `${source}:${row.id}`,
    createdAt: row.createdAt.toISOString(), phaseDeadline: row.phaseDeadline?.toISOString() ?? null,
    solution: row.solution?.slice(0, 360), authorName: row.actorName, uploaderName: row.actorName,
    proposalId: source === 'community-media' ? null : row.proposalId,
  }));
  const sorted = [
    ...mapRows(proposalRows, 'proposal', 'proposal'), ...mapRows(surveyRows, 'survey', 'survey'),
    ...mapRows(mediaRows, 'proposal-media', 'media'), ...mapRows(libraryRows, 'community-media', 'media'),
  ].sort(compareFeedItems);
  // Advance across missing files too: a deleted file must not trap the reader
  // on one page or hide every subsequent published attachment.
  const scanned = sorted.slice(0, opts.limit);
  const items = scanned.filter(row => !row.filePath || existsSync(path.join(MEDIA_ROOT, row.filePath)));
  return { items, nextCursor: sorted.length > opts.limit && scanned.length ? encodeFeedCursor(scanned[scanned.length - 1]) : null };
}
