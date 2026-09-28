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
  DEFAULT_VOTE_RULES,
  PROPOSAL_KINDS,
  enabledKinds,
  isBindingKind,
  majorityRuleOf,
  meetsMajority,
  proposalStageOf,
  voteRulesFor,
  kindAllowsDeliberation,
  kindCollectsOptions,
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

  it('co-drafts a text for a decision or a statute, collects options otherwise', () => {
    expect(PROPOSAL_KINDS.filter(kindAllowsDeliberation)).toEqual(['decision', 'statute']);
    expect(PROPOSAL_KINDS.filter(kindCollectsOptions)).toEqual(['election', 'poll']);
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

describe('community terms per kind', () => {
  it('counts a qualified majority exactly, a simple one strictly', () => {
    expect(meetsMajority(1, 1, 'simple')).toBe(false);
    expect(meetsMajority(2, 1, 'simple')).toBe(true);
    // Exactly two to one is two thirds — held as 0.6667 it would fail.
    expect(meetsMajority(2, 1, 'two_thirds')).toBe(true);
    expect(meetsMajority(3, 2, 'two_thirds')).toBe(false);
    expect(meetsMajority(3, 2, 'three_fifths')).toBe(true);
    expect(meetsMajority(3, 1, 'three_quarters')).toBe(true);
    expect(meetsMajority(0, 0, 'simple')).toBe(false);
  });

  it('reads legacy decimal thresholds as named rules', () => {
    expect(majorityRuleOf('0.5')).toBe('simple');
    expect(majorityRuleOf(0.6667)).toBe('two_thirds');
    expect(majorityRuleOf('three_quarters')).toBe('three_quarters');
    expect(majorityRuleOf('nonsense', 'two_thirds')).toBe('two_thirds');
  });

  it('gives every kind working defaults on a bare row', () => {
    for (const kind of PROPOSAL_KINDS) {
      expect(voteRulesFor({}, kind)).toEqual(DEFAULT_VOTE_RULES[kind]);
    }
    expect(enabledKinds(null)).toEqual([...PROPOSAL_KINDS]);
  });

  it('reads a community row, uncrossing a min above its max', () => {
    const row = {
      pollEnabled: false,
      statuteMinHours: 720, statuteMaxHours: 168,
      statuteMajority: 'three_quarters', statuteMinParticipationPct: '40',
      minParticipationPct: '10', decisionMajority: 'simple',
    };
    expect(voteRulesFor(row, 'statute')).toEqual({
      enabled: true, codrafting: true, minHours: 168, maxHours: 720, majority: 'three_quarters', quorumPct: 40,
    });
    expect(voteRulesFor({ electionNominationsEnabled: false }, 'election').codrafting).toBe(false);
    expect(voteRulesFor({ pollSuggestionsEnabled: false }, 'poll').codrafting).toBe(false);
    expect(voteRulesFor(row, 'decision').quorumPct).toBe(10);
    expect(enabledKinds(row)).toEqual(['decision', 'statute', 'election']);
  });

  it('never lets a decision be switched off', () => {
    expect(voteRulesFor({ decisionEnabled: false } as Record<string, unknown>, 'decision').enabled).toBe(true);
  });
});

describe('stages', () => {
  it('folds the lifecycle into the three public stages', () => {
    expect(proposalStageOf('draft')).toBe('draft');
    for (const s of ['review', 'author_review', 'community_signal', 'sortition_synthesis', 'final_review']) {
      expect(proposalStageOf(s)).toBe('codrafting');
    }
    expect(proposalStageOf('voting')).toBe('voting');
    expect(proposalStageOf('decided')).toBe('completed');
    expect(proposalStageOf('archived')).toBe('completed');
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

  it('lets a poll collect answers when the description asks for it', async () => {
    chatCompletion.mockResolvedValueOnce(JSON.stringify({
      kind: 'poll',
      question: 'Ποια μέρα σας βολεύει για τη γενική συνέλευση;',
      solution: '',
      category: 'governance',
      track: 'deliberation',
      ballotOptions: ['Δευτέρα', 'Τετάρτη', 'Σάββατο'],
    }));
    const draft = await compileProposal('Δημοσκόπηση για τη μέρα της συνέλευσης, να προτείνουν κι άλλες μέρες');
    expect(draft.kind).toBe('poll');
    expect(draft.track).toBe('deliberation');
  });

  it('accepts an election opening candidacies with a single named candidate', async () => {
    chatCompletion.mockResolvedValueOnce(JSON.stringify({
      kind: 'election',
      question: 'Εκλογή Ταμία του Συλλόγου',
      solution: '',
      category: 'governance',
      track: 'deliberation',
      ballotOptions: ['Ελένη Καραγιάννη'],
    }));
    const draft = await compileProposal('Εκλογή ταμία, να δηλώσουν υποψηφιότητα όσοι θέλουν — ήδη η Ελένη');
    expect(draft.track).toBe('deliberation');
    expect(draft.ballotOptions).toEqual(['Ελένη Καραγιάννη']);
  });

  it('rejects a direct vote with a single option and retries', async () => {
    chatCompletion
      .mockResolvedValueOnce(JSON.stringify({
        kind: 'election', question: 'Εκλογή Ταμία του Συλλόγου', solution: '', category: 'governance',
        track: 'vote', ballotOptions: ['Ελένη Καραγιάννη'],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        kind: 'election', question: 'Εκλογή Ταμία του Συλλόγου', solution: '', category: 'governance',
        track: 'vote', ballotOptions: null,
      }));
    const draft = await compileProposal('Εκλογή ταμία');
    expect(chatCompletion).toHaveBeenCalledTimes(2);
    expect(draft.ballotOptions).toBeNull();
  });

  it('turns a kind the community does not hold into a decision', async () => {
    chatCompletion.mockResolvedValueOnce(JSON.stringify({
      kind: 'poll',
      question: 'Ποια μέρα σας βολεύει για τη γενική συνέλευση;',
      solution: '',
      category: 'governance',
      ballotOptions: ['Δευτέρα', 'Τετάρτη'],
    }));
    const draft = await compileProposal('Δημοσκόπηση για τη μέρα', { allowedKinds: ['decision', 'statute'] });
    expect(draft.kind).toBe('decision');
    expect(String(chatCompletion.mock.calls[0][0].messages[0].content)).toContain('only holds these kinds');
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
