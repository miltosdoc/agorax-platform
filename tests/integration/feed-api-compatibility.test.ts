import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import { decodeFeedCursor, encodeFeedCursor } from '../../shared/activity-feed';

// Exercise the registered handlers without a database or real media files.
// Native Android clients deserialize nextCursor as Long; the web feed has a
// timestamp/source/id cursor and must never replace that native contract.
const mocks = vi.hoisted(() => ({
  mediaFeed: vi.fn(),
  activityFeed: vi.fn(),
  select: vi.fn(),
  visibleCommunities: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  mediaRepo: { feed: mocks.mediaFeed }, proposalRepo: {}, communityRepo: {},
}));
vi.mock('../../server/db', () => ({ db: { select: mocks.select } }));
vi.mock('../../server/storage/activity-feed', () => ({ getActivityFeed: mocks.activityFeed }));
vi.mock('../../server/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('../../server/utils/community-visibility', () => ({
  visibleCommunityIdSet: mocks.visibleCommunities,
  requireProposalContentAccess: () => vi.fn(),
  canViewProposal: vi.fn(),
}));
vi.mock('../../server/utils/media-probe', () => ({ probeMedia: vi.fn(), extractVideoThumbnail: vi.fn() }));
vi.mock('../../server/utils/media-scripts', () => ({ generatePodcastScript: vi.fn(), generateTeaserScript: vi.fn() }));
vi.mock('../../server/utils/notifications', () => ({ notifyFileLost: vi.fn() }));
vi.mock('../../server/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('fs', async (importOriginal) => ({
  ...await importOriginal<typeof import('fs')>(), existsSync: () => true,
}));

import { registerMediaRoutes } from '../../server/routers/media';

type Handler = (request: any, response: any) => Promise<void>;
const handlers = new Map<string, Handler>();
registerMediaRoutes({
  use: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  get: (route: string, ...callbacks: Handler[]) => handlers.set(route, callbacks.at(-1)!),
} as unknown as Express);

async function request(route: string, query: Record<string, string>, viewerId?: number) {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  await handlers.get(route)!({ query, user: viewerId ? { id: viewerId } : undefined }, response);
  return response;
}

function links(rows: { id: number; communityId: number; status?: string }[]) {
  mocks.select.mockReturnValue({ from: () => ({ where: () => Promise.resolve(rows) }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mediaFeed.mockResolvedValue([]);
  mocks.visibleCommunities.mockResolvedValue(new Set([7]));
});

describe('native and web feed API compatibility', () => {
  it('retains numeric media cursors and the legacy response for native clients', async () => {
    mocks.mediaFeed.mockResolvedValue([
      { id: 41, proposalId: 11, filePath: 'test-a.mp4', uploaderName: 'Alice', communityName: 'Public' },
      { id: 40, proposalId: 12, filePath: 'test-b.mp4', uploaderName: 'Bob', communityName: 'Public' },
    ]);
    links([{ id: 11, communityId: 7 }, { id: 12, communityId: 7 }]);

    const response = await request('/api/feed', { type: 'video', cursor: '42', limit: '2' });
    expect(mocks.mediaFeed).toHaveBeenCalledWith({ kind: 'video', cursor: 42, limit: 2 });
    expect(response.json).toHaveBeenCalledWith({
      items: [
        { feedType: 'media', id: 41, proposalId: 11, filePath: 'test-a.mp4', uploaderName: 'Alice', communityName: 'Public' },
        { feedType: 'media', id: 40, proposalId: 12, filePath: 'test-b.mp4', uploaderName: 'Bob', communityName: 'Public' },
      ],
      nextCursor: 40,
    });
    expect(mocks.activityFeed).not.toHaveBeenCalled();
  });

  it('retains the legacy community privacy gate for media', async () => {
    mocks.mediaFeed.mockResolvedValue([
      { id: 41, proposalId: 11, filePath: 'public.mp4' },
      { id: 40, proposalId: 12, filePath: 'members-only.mp4' },
    ]);
    links([{ id: 11, communityId: 7 }, { id: 12, communityId: 8 }]);

    const response = await request('/api/feed', { type: 'podcast', limit: '2' }, 99);
    expect(mocks.visibleCommunities).toHaveBeenCalledWith([7, 8], 99);
    expect(response.json).toHaveBeenCalledWith({
      items: [{ feedType: 'media', id: 41, proposalId: 11, filePath: 'public.mp4' }], nextCursor: null,
    });
  });

  it('excludes draft and missing proposals even when their media is published', async () => {
    mocks.mediaFeed.mockResolvedValue([
      { id: 41, proposalId: 11, filePath: 'public.mp4' },
      { id: 40, proposalId: 12, filePath: 'draft.mp4' },
      { id: 39, proposalId: 13, filePath: 'missing.mp4' },
      { id: 38, proposalId: null, filePath: 'unlinked.mp4' },
    ]);
    links([{ id: 11, communityId: 7, status: 'voting' }, { id: 12, communityId: 7, status: 'draft' }]);

    const response = await request('/api/feed', { type: 'video', limit: '4' }, 99);
    expect(response.json).toHaveBeenCalledWith({
      items: [{ feedType: 'media', id: 41, proposalId: 11, filePath: 'public.mp4' }], nextCursor: null,
    });
  });

  it('retains the legacy proposal response and community visibility', async () => {
    const rows = [
      { id: 5, communityId: 7, question: 'Public proposal', solution: 'Solution', createdAt: '2026-10-07T10:00:00Z', status: 'voting', kind: 'policy', thumbnailKey: null, communityName: 'Public', authorName: 'Alice' },
      { id: 6, communityId: 8, question: 'Private proposal', createdAt: '2026-10-07T11:00:00Z' },
    ];
    const chain: any = {};
    for (const method of ['from', 'innerJoin', 'where', 'orderBy']) chain[method] = () => chain;
    chain.limit = () => Promise.resolve(rows);
    mocks.select.mockReturnValue(chain);

    const response = await request('/api/feed', { type: 'proposal' }, 99);
    expect(response.json).toHaveBeenCalledWith({
      items: [{ feedType: 'proposal', ...rows[0] }], nextCursor: null,
    });
    expect(mocks.visibleCommunities).toHaveBeenCalledWith([7, 8], 99);
  });

  it('excludes private-community surveys while retaining global surveys and the native shape', async () => {
    const rows = [
      { id: 5, communityId: 7, title: 'Public survey', topicTag: 'transport', tier: 'quick', status: 'live', createdAt: '2026-10-07T10:00:00Z' },
      { id: 6, communityId: 8, title: 'Private survey', createdAt: '2026-10-07T11:00:00Z' },
      { id: 7, communityId: null, title: 'Global survey', topicTag: 'environment', tier: 'quick', status: 'closed', createdAt: '2026-10-06T10:00:00Z' },
    ];
    const chain: any = {};
    for (const method of ['from', 'where', 'orderBy']) chain[method] = () => chain;
    chain.limit = () => Promise.resolve(rows);
    mocks.select.mockReturnValue(chain);

    const response = await request('/api/feed', { type: 'survey' }, 99);
    expect(response.json).toHaveBeenCalledWith({
      items: [
        { feedType: 'survey', id: 5, title: 'Public survey', topicTag: 'transport', tier: 'quick', status: 'live', createdAt: '2026-10-07T10:00:00Z' },
        { feedType: 'survey', id: 7, title: 'Global survey', topicTag: 'environment', tier: 'quick', status: 'closed', createdAt: '2026-10-06T10:00:00Z' },
      ], nextCursor: null,
    });
    expect(mocks.visibleCommunities).toHaveBeenCalledWith([7, 8], 99);
  });

  it('accepts opaque cursors exclusively on the redesigned activity endpoint', async () => {
    const cursor = encodeFeedCursor({ createdAt: '2026-10-07T10:00:00Z', source: 'proposal', id: 42 });
    const nextCursor = encodeFeedCursor({ createdAt: '2026-10-06T10:00:00Z', source: 'proposal-media', id: 40 });
    mocks.activityFeed.mockResolvedValue({ items: [], nextCursor });

    const response = await request('/api/activity-feed', {
      type: 'all', scope: 'mine', stage: 'active', limit: '12', cursor, community: '7', q: '  Athens  ',
    }, 99);
    expect(mocks.activityFeed).toHaveBeenCalledWith({
      viewerId: 99, kind: 'all', scope: 'mine', stage: 'active', limit: 12,
      cursor: decodeFeedCursor(cursor), communityId: 7, search: 'Athens',
    });
    expect(response.json).toHaveBeenCalledWith({ items: [], nextCursor });
    expect(mocks.mediaFeed).not.toHaveBeenCalled();
  });

  it('rejects a legacy numeric cursor on the activity endpoint', async () => {
    const response = await request('/api/activity-feed', { type: 'video', cursor: '42' });
    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.activityFeed).not.toHaveBeenCalled();
  });

  it('keeps the member feed authenticated on the activity endpoint', async () => {
    const response = await request('/api/activity-feed', { scope: 'mine' });
    expect(response.status).toHaveBeenCalledWith(401);
    expect(mocks.activityFeed).not.toHaveBeenCalled();
  });
});
