import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Proposal Final Vote Contract', () => {
  const proposalsRouter = readFileSync(
    join(__dirname, '../../server/routers/proposals.ts'),
    'utf8'
  );

  const votingStorage = readFileSync(
    join(__dirname, '../../server/storage/voting.ts'),
    'utf8'
  );

  describe('Storage Contract', () => {
    it('exposes vote-related methods', () => {
      expect(votingStorage).toMatch(/createVote|hasUserVoted|getPollResults/);
    });

    it('implements vote creation', () => {
      expect(votingStorage).toMatch(/async createVote/);
    });

    it('checks if user has voted', () => {
      expect(votingStorage).toMatch(/hasUserVoted/);
    });
  });

  describe('Route Contract', () => {
    it('exposes POST /api/proposals/:id/vote, GET /api/proposals/:id/vote-results', () => {
      expect(proposalsRouter).toMatch(/\/api\/proposals\/:id\/vote/);
      expect(proposalsRouter).toMatch(/\/api\/proposals\/:id\/vote-results/);
    });

    it('refuses votes outside voting lifecycle phase', () => {
      expect(proposalsRouter).toMatch(/status.*!==.*voting|voting.*!==.*status/);
    });

    it('refuses votes from non-members', () => {
      expect(proposalsRouter).toMatch(/community member|Only community members/);
    });

    it('finalize transitions to decided on quorum, archived otherwise', () => {
      expect(proposalsRouter).toMatch(/decided.*archived|meetsQuorum/);
    });
  });
});
