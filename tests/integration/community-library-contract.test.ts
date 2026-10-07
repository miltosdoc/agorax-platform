/**
 * Community library contract (source-pin, no DB roundtrip).
 *
 * Pins the invariants of the community media library:
 *   1. schema + migration shapes (kind/status CHECKs, pin columns);
 *   2. route gates — upload requires auth + membership, list respects
 *      community content visibility, pinning is admin-only;
 *   3. THE FEED INVARIANT: only published audio/video from readable
 *      communities can appear in the activity feed; documents stay in the library;
 *   4. General community activation: auto-enroll on BOTH signup paths.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('community_media schema & migration', () => {
  const migration = read('migrations/0035_community_media.sql');
  const schema = read('shared/schema.ts');

  it('migration creates the table with kind/status checks and the library index', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS community_media/);
    expect(migration).toMatch(/kind IN \('podcast', 'video', 'document'\)/);
    expect(migration).toMatch(/status IN \('published', 'hidden'\)/);
    expect(migration).toMatch(/community_media_library_idx/);
    expect(migration).toMatch(/pinned BOOLEAN NOT NULL DEFAULT FALSE/);
    expect(migration).toMatch(/REFERENCES communities\(id\) ON DELETE CASCADE/);
  });

  it('drizzle schema mirrors the table', () => {
    expect(schema).toMatch(/export const communityMedia = pgTable\("community_media"/);
    expect(schema).toMatch(/pinnedBy: integer\("pinned_by"\)\.references\(\(\) => users\.id, \{ onDelete: "set null" \}\)/);
  });
});

describe('community library routes', () => {
  const router = read('server/routers/community-media.ts');

  it('upload requires auth and community membership', () => {
    expect(router).toMatch(/app\.post\('\/api\/communities\/:id\/media',\s*requireAuth/);
    expect(router).toMatch(/isCommunityMember\(communityId, userId\)/);
  });

  it('list respects community content visibility', () => {
    expect(router).toMatch(/canViewCommunityContentById\(communityId, viewerId\)/);
    expect(router).toMatch(/contentHidden: true/);
  });

  it('pinning is a curator (founder/admin) act', () => {
    expect(router).toMatch(/only community admins can pin/);
    expect(router).toMatch(/getCommunityMemberRole/);
  });

  it('listing puts pinned items first, then newest', () => {
    expect(router).toMatch(/orderBy\(desc\(communityMedia\.pinned\), desc\(communityMedia\.createdAt\)\)/);
  });

  it('shares the proposal-media validation rules (single source of truth)', () => {
    expect(router).toMatch(/from '\.\.\/utils\/media-rules'/);
    expect(read('server/routers/media.ts')).toMatch(/from '\.\.\/utils\/media-rules'/);
  });
});

describe('library feed visibility contract', () => {
  it('routes the global feed through the scoped activity repository', () => {
    expect(read('server/routers/media.ts')).toMatch(/getActivityFeed/);
    const feed = read('server/storage/activity-feed.ts');
    expect(feed).toMatch(/eq\(communityMedia.status, 'published'\)/);
    expect(feed).toMatch(/inArray\(communityMedia.kind, mediaKinds\)/);
    expect(feed).toMatch(/'podcast', 'video'/);
    expect(feed).toMatch(/ne\(communities.contentVisibility, 'members'\), member/);
    expect(feed).toMatch(/where\(and\(\.\.\.common/);
    expect(feed).toMatch(/source === 'community-media' \? null/);
  });
  it('keeps uploads and curation in the community router', () => {
    expect(read('server/routers/community-media.ts')).toMatch(/isCommunityMember\(communityId, userId\)/);
    expect(read('server/routers/community-media.ts')).not.toMatch(/app\.get\('\/api\/feed/);
  });
});

describe('General community activation', () => {
  const auth = read('server/auth.ts');

  it('local registration auto-enrolls into the General community', () => {
    const registerBlock = auth.slice(auth.indexOf('app.post("/api/register"'));
    expect(registerBlock).toMatch(/getGeneralCommunity\(\)/);
  });

  it('Google OAuth signup auto-enrolls too (was a gap)', () => {
    const googleBlock = auth.slice(
      auth.indexOf('new GoogleStrategy'),
      auth.indexOf('app.post("/api/register"'),
    );
    expect(googleBlock).toMatch(/getGeneralCommunity\(\)/);
    expect(googleBlock).toMatch(/addCommunityMember\(general\.id, newUser\.id\)/);
  });

  it('activation script is idempotent and backfills every user', () => {
    const script = read('scripts/create-general-community.ts');
    expect(script).toMatch(/getGeneralCommunity\(\)/);
    expect(script).toMatch(/isGeneral: true/);
    expect(script).toMatch(/addMember\(general\.id, u\.id\)/);
  });
});
