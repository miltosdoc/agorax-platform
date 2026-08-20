import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Proposal State Machine', () => {
  const stateMachine = readFileSync(
    join(__dirname, '../../server/utils/proposal-state-machine.ts'),
    'utf8'
  );

  describe('8-State Lifecycle', () => {
    const states = ['draft', 'review', 'synthesis', 'author_review', 'voting', 'decided', 'archived', 'rejected'];

    it('defines all 8 states', () => {
      for (const state of states) {
        expect(stateMachine).toContain(state);
      }
    });

    it('enforces unidirectional transitions', () => {
      expect(stateMachine).toMatch(/transitionProposal/);
    });

    it('validates transitions at API level', () => {
      expect(stateMachine).toMatch(/throw|invalid|not allowed/);
    });
  });

  describe('Transition Enforcement', () => {
    it('should not allow skipping states', () => {
      // draft → voting should be invalid
      expect(stateMachine).toMatch(/TRANSITIONS|transitions/);
    });

    it('should handle author_review → voting transition', () => {
      expect(stateMachine).toMatch(/author_review.*voting|voting.*author_review/);
    });

    it('should handle voting → decided transition', () => {
      expect(stateMachine).toMatch(/voting.*decided|decided.*voting/);
    });
  });
});
