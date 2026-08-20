/**
 * Demo seed contract tests.
 *
 * AgoraX should not boot with fake staged deliberations pretending to be real
 * civic activity. Seed data may provide accounts and communities, but proposals
 * should be created through the actual proposal flow during review.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const seedDemoSource = readFileSync(resolve(process.cwd(), 'seed_demo.sql'), 'utf8');

describe('demo seed contract', () => {
  it('does not seed mock proposal deliberations', () => {
    expect(seedDemoSource).not.toContain('INSERT INTO proposals');
    expect(seedDemoSource).not.toContain('INSERT INTO debate_arguments');
    expect(seedDemoSource).not.toContain('INSERT INTO proposal_support');
  });

  it('keeps demo data limited to users, communities, and memberships', () => {
    expect(seedDemoSource).toContain('INSERT INTO users');
    expect(seedDemoSource).toContain('INSERT INTO communities');
    expect(seedDemoSource).toContain('INSERT INTO community_members');
  });
});
