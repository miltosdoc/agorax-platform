/**
 * Media router/schema contract tests — no DB roundtrip.
 *
 * Pin: the migration exists with the right shape; the schema export is
 * present; the router registers the expected route shapes; the static
 * media path is mounted.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const migration = read('migrations/0026_proposal_media.sql');
const schema = read('shared/schema.ts');
const router = read('server/routers/media.ts');
const storage = read('server/storage/media.ts');
const routes = read('server/routes.ts');

describe('proposal_media migration', () => {
  it('creates the proposal_media table', () => {
    expect(migration).toMatch(/CREATE TABLE\s+"proposal_media"/);
  });

  it('constrains kind to podcast or video', () => {
    expect(migration).toMatch(/CHECK\s*\(\s*"kind"\s*IN\s*\(\s*'podcast'\s*,\s*'video'\s*\)\s*\)/);
  });

  it('constrains status to published or hidden', () => {
    expect(migration).toMatch(/CHECK\s*\(\s*"status"\s*IN\s*\(\s*'published'\s*,\s*'hidden'\s*\)\s*\)/);
  });

  it('enforces at-most-one featured entry per (proposal, kind)', () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*proposal_media_featured_unique[\s\S]*WHERE "is_featured" = true/);
  });

  it('cascades on proposal deletion', () => {
    expect(migration).toMatch(/REFERENCES\s+"proposals"[\s\S]*ON DELETE CASCADE/);
  });
});

describe('shared/schema.ts — proposalMedia', () => {
  it('exports the proposalMedia table', () => {
    expect(schema).toMatch(/export const proposalMedia = pgTable\("proposal_media"/);
  });

  it('exports a ProposalMedia type', () => {
    expect(schema).toMatch(/export type ProposalMedia/);
  });

  it('exports an InsertProposalMedia type', () => {
    expect(schema).toMatch(/export type InsertProposalMedia/);
  });
});

describe('media router — route shape', () => {
  it('registers the script generator endpoint', () => {
    expect(router).toMatch(/\/api\/proposals\/:id\/scripts\/:kind/);
  });

  it('registers the upload endpoint with multer', () => {
    expect(router).toMatch(/upload\.single\('file'\)/);
    expect(router).toMatch(/\/api\/proposals\/:id\/media/);
  });

  it('registers the curate (PATCH) endpoint', () => {
    expect(router).toMatch(/app\.patch\(['"]\/api\/proposals\/:id\/media\/:mid['"]/);
  });

  it('registers the delete endpoint', () => {
    expect(router).toMatch(/app\.delete\(['"]\/api\/proposals\/:id\/media\/:mid['"]/);
  });

  it('registers the global feed endpoint', () => {
    expect(router).toMatch(/app\.get\(['"]\/api\/feed['"]/);
  });

  it('registers the public share route with server-rendered HTML', () => {
    expect(router).toMatch(/app\.get\(['"]\/p\/:pid\/:kind\/:mid['"]/);
  });

  it('mounts a static /media serve handler', () => {
    expect(router).toMatch(/\/media['"][\s\S]*express\.static\(MEDIA_ROOT/);
  });

  it('renders OG meta tags on the share page', () => {
    expect(router).toMatch(/property="og:title"/);
    expect(router).toMatch(/property="og:description"/);
    expect(router).toMatch(/name="twitter:card"/);
  });
});

describe('media router — security gates', () => {
  it('requires auth on script generation', () => {
    expect(router).toMatch(/scripts\/:kind['"]\s*,\s*requireAuth/);
  });

  it('requires auth on upload', () => {
    expect(router).toMatch(/\/api\/proposals\/:id\/media['"]\s*,\s*\n?\s*requireAuth/);
  });

  it('gates upload on community membership', () => {
    expect(router).toMatch(/isCommunityMember/);
  });

  it('enforces per-kind size & duration limits', () => {
    expect(router).toMatch(/maxBytes/);
    expect(router).toMatch(/maxDurationS/);
  });

  it('validates file extension and mime', () => {
    expect(router).toMatch(/limits\.exts\.has/);
    expect(router).toMatch(/limits\.mimes/);
  });
});

describe('storage/media.ts — repository contract', () => {
  it('exports MediaRepository', () => {
    expect(storage).toMatch(/export class MediaRepository/);
  });

  it('clears prior featured rows before setting a new one', () => {
    // The setFeatured transaction must un-feature siblings to keep the
    // partial unique index satisfied. Look for the un-feature update
    // inside the setFeatured method.
    const m = storage.match(/setFeatured\([\s\S]*?\}\s*\n\s*\}/);
    expect(m, 'setFeatured method should exist').toBeTruthy();
    expect(m![0]).toMatch(/isFeatured:\s*false/);
  });

  it('joins proposals + communities + users in the feed query', () => {
    expect(storage).toMatch(/innerJoin\(proposals/);
    expect(storage).toMatch(/innerJoin\(communities/);
    expect(storage).toMatch(/innerJoin\(users/);
  });
});

describe('routes.ts wiring', () => {
  it('registers the media router', () => {
    expect(routes).toMatch(/registerMediaRoutes/);
  });
});

describe('LLM client + script generator wiring', () => {
  const llmClient = read('server/utils/llm-client.ts');
  const scripts = read('server/utils/media-scripts.ts');
  const config = read('server/config.ts');

  it('exposes a configurable OpenAI-compatible chatCompletion', () => {
    expect(llmClient).toMatch(/export.*function chatCompletion/);
    expect(llmClient).toMatch(/LLM_API_URL/);
    expect(llmClient).toMatch(/LLM_API_KEY/);
    expect(llmClient).toMatch(/LLM_MODEL/);
    expect(llmClient).toMatch(/\/chat\/completions/);
  });

  it('throws LlmUnavailableError on failure, never silently swallows', () => {
    expect(llmClient).toMatch(/class LlmUnavailableError/);
    expect(llmClient).toMatch(/throw new LlmUnavailableError/);
  });

  it('script generator prefers the LLM but falls back to the template', () => {
    expect(scripts).toMatch(/isLlmConfigured\(\)/);
    expect(scripts).toMatch(/templatePodcastScript/);
    expect(scripts).toMatch(/templateTeaserScript/);
    // Both branches must exist — LLM call inside try, template inside catch.
    expect(scripts).toMatch(/catch\s*\(\s*err[^)]*\)\s*\{[\s\S]*?templatePodcastScript/);
  });

  it('exposes the source field on the script result', () => {
    expect(scripts).toMatch(/source:\s*['"]llm['"]\s*\|\s*['"]template['"]/);
  });

  it('production boot allows LLM_API_KEY only with LLM_GATE_AUDITED=true', () => {
    expect(config).toMatch(/LLM_GATE_AUDITED/);
    expect(config).toMatch(/OPENROUTER_API_KEY is banned/);
  });
});
