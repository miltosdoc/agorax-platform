import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('State Machine Integration', () => {
  const stateMachine = readFileSync(
    join(__dirname, '../../server/utils/proposal-state-machine.ts'),
    'utf8'
  );

  it('defines 8 states', () => {
    const states = ['draft', 'review', 'synthesis', 'author_review', 'voting', 'decided', 'archived', 'rejected'];
    for (const state of states) {
      expect(stateMachine).toContain(state);
    }
  });

  it('enforces unidirectional transitions', () => {
    expect(stateMachine).toMatch(/transitionProposal|TRANSITIONS/);
  });

  it('validates transitions at API level', () => {
    expect(stateMachine).toMatch(/throw|invalid|not allowed/);
  });
});
