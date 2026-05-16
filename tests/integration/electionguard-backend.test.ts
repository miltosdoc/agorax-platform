/**
 * ElectionGuard voting backend — contract tests.
 *
 * Pins the integration surface of the `electionguard` VotingBackend: the
 * class shape, its registration in the backend factory, the database schema,
 * the migration, and the dynamic-import discipline that keeps the SDK out of
 * the default backend's module graph.
 *
 * The cryptographic behaviour itself is covered by the @agorax/voting SDK's
 * own 65-test suite and by scripts/eg-smoke.ts (a live end-to-end run).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const backend = read('server/voting/electionguard-backend.ts');
const registry = read('server/voting/index.ts');
const schema = read('shared/schema.ts');

describe('ElectionGuard backend — class contract', () => {
  it('exports an ElectionGuardBackend class', () => {
    expect(backend).toMatch(/export class ElectionGuardBackend/);
  });

  it('implements the full VotingBackend interface', () => {
    expect(backend).toMatch(/implements VotingBackend/);
    for (const method of [
      'startElection',
      'castSignedBallot',
      'getTally',
      'closeAndTally',
      'getProof',
      'verify',
    ]) {
      expect(backend).toMatch(new RegExp(`\\b${method}\\b`));
    }
  });

  it('imports the SDK dynamically, never statically', () => {
    // A static value import of the SDK would pull it into the default
    // backend's graph and break the production server bundle.
    expect(backend).not.toMatch(/^import\s+\{[^}]*\}\s+from\s+'@agorax\/voting'/m);
    expect(backend).toMatch(/import\('@agorax\/voting'\)/);
  });

  it('is labelled development-only / not for binding elections', () => {
    expect(backend).toMatch(/NOT FOR BINDING ELECTIONS/i);
  });
});

describe('ElectionGuard backend — registration', () => {
  it('is registered in the backend factory under "electionguard"', () => {
    expect(registry).toMatch(/case 'electionguard'/);
    expect(registry).toMatch(/new ElectionGuardBackend\(\)/);
  });

  it('no longer reserves the obsolete "helios" slot', () => {
    expect(registry).not.toMatch(/case 'helios'/);
  });
});

describe('ElectionGuard backend — database schema', () => {
  it('declares the eg_elections, eg_ballots and eg_election_records tables', () => {
    expect(schema).toMatch(/egElections = pgTable\("eg_elections"/);
    expect(schema).toMatch(/egBallots = pgTable\("eg_ballots"/);
    expect(schema).toMatch(/egElectionRecords = pgTable\("eg_election_records"/);
  });

  it('ships a migration for the ElectionGuard tables', () => {
    const migration = read('migrations/0011_electionguard_voting.sql');
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS "eg_elections"/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS "eg_ballots"/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS "eg_election_records"/);
  });
});
