/**
 * Proposal kind contract tests.
 *
 * Pin the few rules that genuinely differ between a decision, a statute, an
 * election and a poll, and what the AI drafting step is allowed to return
 * for each — the LLM is stubbed, so these check the schema around it, not
 * the model.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROPOSAL_KINDS,
  isBindingKind,
  kindAllowsDeliberation,
  kindRequiresOptions,
  kindRequiresText,
  proposalKindOf,
  refusalOptionLabel,
} from '../../shared/proposal-kinds';

const chatCompletion = vi.fn();
vi.mock('../../server/utils/llm-client', () => ({
  chatCompletion: (...args: unknown[]) => chatCompletion(...args),
}));

const { compileProposal } = await import('../../server/utils/proposal-compiler');

describe('proposal kinds — rules', () => {
  it('reads legacy and unknown values as a plain decision', () => {
    expect(proposalKindOf(undefined)).toBe('decision');
    expect(proposalKindOf(null)).toBe('decision');
    expect(proposalKindOf('referendum')).toBe('decision');
    for (const kind of PROPOSAL_KINDS) expect(proposalKindOf(kind)).toBe(kind);
  });

  it('only lets a text be deliberated', () => {
    expect(kindAllowsDeliberation('decision')).toBe(true);
    expect(kindAllowsDeliberation('statute')).toBe(true);
    expect(kindAllowsDeliberation('election')).toBe(false);
    expect(kindAllowsDeliberation('poll')).toBe(false);
  });

  it('requires candidates for an election and text for a decision or statute', () => {
    expect(PROPOSAL_KINDS.filter(kindRequiresOptions)).toEqual(['election']);
    expect(PROPOSAL_KINDS.filter(kindRequiresText)).toEqual(['decision', 'statute']);
  });

  it('treats only a poll as non-binding', () => {
    expect(PROPOSAL_KINDS.filter((k) => !isBindingKind(k))).toEqual(['poll']);
  });

  it('words the refusal option for the ballot it sits on', () => {
    expect(refusalOptionLabel('decision')).toBe('Καμία αλλαγή');
    expect(refusalOptionLabel('statute')).toBe('Καμία αλλαγή');
    expect(refusalOptionLabel('election')).toBe('Λευκό');
    expect(refusalOptionLabel('poll')).toBe('Καμία από τις παραπάνω');
  });
});

describe('proposal compiler — kinds', () => {
  beforeEach(() => chatCompletion.mockReset());

  it('defaults to a direct vote on a decision', async () => {
    chatCompletion.mockResolvedValueOnce(JSON.stringify({
      question: 'Να φτιαχτεί ποδηλατόδρομος στην οδό Ερμού;',
      solution: 'Προτείνεται η δημιουργία ποδηλατόδρομου σε όλο το μήκος της οδού Ερμού, με προστατευμένη λωρίδα.',
      category: 'infrastructure',
    }));
    const draft = await compileProposal('Θέλω ποδηλατόδρομο στην Ερμού');
    expect(draft.kind).toBe('decision');
    expect(draft.track).toBe('vote');
  });

  it('accepts an election with candidates and no description', async () => {
    chatCompletion.mockResolvedValueOnce(JSON.stringify({
      kind: 'election',
      question: 'Εκλογή Προέδρου του Συλλόγου',
      solution: '',
      category: 'governance',
      track: 'vote',
      votingDurationHours: 72,
      ballotOptions: ['Μαρία Παπαδάκη', 'Γιώργος Νικολάου'],
    }));
    const draft = await compileProposal('Εκλογή προέδρου, υποψήφιοι Μαρία Παπαδάκη και Γιώργος Νικολάου');
    expect(draft.kind).toBe('election');
    expect(draft.solution).toBe('');
    expect(draft.ballotOptions).toEqual(['Μαρία Παπαδάκη', 'Γιώργος Νικολάου']);
  });

  it('never sends a poll or an election to deliberation', async () => {
    chatCompletion.mockResolvedValueOnce(JSON.stringify({
      kind: 'poll',
      question: 'Ποια μέρα σας βολεύει για τη γενική συνέλευση;',
      solution: '',
      category: 'governance',
      track: 'deliberation',
      ballotOptions: ['Δευτέρα', 'Τετάρτη', 'Σάββατο'],
    }));
    const draft = await compileProposal('Δημοσκόπηση για τη μέρα της συνέλευσης');
    expect(draft.kind).toBe('poll');
    expect(draft.track).toBe('vote');
  });

  it('retries when a decision comes back without its text', async () => {
    chatCompletion
      .mockResolvedValueOnce(JSON.stringify({
        kind: 'decision', question: 'Να αλλάξει το ωράριο της βιβλιοθήκης;', solution: '', category: 'other',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        kind: 'decision',
        question: 'Να αλλάξει το ωράριο της βιβλιοθήκης;',
        solution: 'Η βιβλιοθήκη να μένει ανοιχτή έως τις 21:00 τις καθημερινές, ώστε να εξυπηρετούνται οι εργαζόμενοι.',
        category: 'other',
      }));
    const draft = await compileProposal('Να μένει ανοιχτή η βιβλιοθήκη ως αργά');
    expect(chatCompletion).toHaveBeenCalledTimes(2);
    expect(String(chatCompletion.mock.calls[1][0].messages[1].content)).toContain('solution');
    expect(draft.solution.length).toBeGreaterThan(30);
  });
});
