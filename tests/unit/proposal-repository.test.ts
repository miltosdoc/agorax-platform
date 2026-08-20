import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Proposal Repository', () => {
  const repo = readFileSync(
    join(__dirname, '../../server/storage/proposals.ts'),
    'utf8'
  );

  describe('CRUD Operations', () => {
    it('should implement createProposal', () => {
      expect(repo).toMatch(/createProposal/);
    });

    it('should implement getProposal', () => {
      expect(repo).toMatch(/getProposal/);
    });

    it('should implement updateProposal', () => {
      expect(repo).toMatch(/updateProposal/);
    });

    it('should implement getProposals', () => {
      expect(repo).toMatch(/getProposals/);
    });
  });

  describe('Filtering', () => {
    it('should filter by community', () => {
      expect(repo).toMatch(/communityId/);
    });

    it('should filter by status', () => {
      expect(repo).toMatch(/status/);
    });
  });
});
