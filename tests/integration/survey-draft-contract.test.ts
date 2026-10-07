import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canEditSurveyDraft, hydrateSurveyDraft, surveyDraftPatch, validSurveyDraft, type SurveyDraftResponse } from '../../client/src/lib/survey-draft';

const savedDraft: SurveyDraftResponse = {
  poll: {
    id: 42, title: 'Ανοιχτή ερώτηση', topicTag: 'γειτονιά', tier: 'community', creatorId: 7, status: 'draft',
    gatekeeperVerdict: { approved: true, flags: [{ issue: 'Διατύπωση', explanation: 'Ελέγξτε τις απαντήσεις.', severity: 'minor' }] },
  },
  items: [
    { id: 10, text: 'Ποια απάντηση προτιμάτε;', itemType: 'single_choice', options: ['Πρώτη', 'Δεύτερη'], randomizeOptions: true, isAttentionCheck: false, required: false },
    { id: 11, text: 'Επιλέξτε τη δεύτερη απάντηση.', itemType: 'single_choice', options: ['Πρώτη', 'Δεύτερη'], randomizeOptions: false, isAttentionCheck: true, required: true },
    { id: 12, text: 'Πάγια ερώτηση πλατφόρμας.', itemType: 'single_choice', options: ['Ναι', 'Όχι'], randomizeOptions: false, isAttentionCheck: false, isModuleItem: true, required: true },
    { id: 13, text: 'Τι άλλο θα προτείνατε;', itemType: 'open_text', options: null, randomizeOptions: false, isAttentionCheck: false, required: false },
  ],
};

describe('saved survey draft editing', () => {
  it('restores GET detail data and methodology flags without needing the original compile response', () => {
    const restored = hydrateSurveyDraft(savedDraft);
    expect(restored.title).toBe(savedDraft.poll.title);
    expect(restored.verdict).toEqual(savedDraft.poll.gatekeeperVerdict);
    expect(restored.items[0]).toMatchObject({ randomizeOptions: true, required: false, deleted: false });
    restored.items[0].options![0] = 'Αλλαγή';
    expect(savedDraft.items[0].options![0]).toBe('Πρώτη');
  });

  it('allows only the original author to edit an unpublished draft', () => {
    expect(canEditSurveyDraft(savedDraft.poll, 7)).toBe(true);
    expect(canEditSurveyDraft(savedDraft.poll, 8)).toBe(false);
    expect(canEditSurveyDraft(savedDraft.poll, null)).toBe(false);
    for (const status of ['live', 'closed', 'gatekeeper_flagged']) {
      expect(canEditSurveyDraft({ ...savedDraft.poll, status }, 7)).toBe(false);
    }
  });

  it('saves edits and deletions without submitting quality fields or touching fixed questions', () => {
    const restored = hydrateSurveyDraft(savedDraft);
    restored.items[0].text = '  Ποια λύση επιλέγετε;  ';
    restored.items[0].options = [' Πρώτη ', 'Δεύτερη', ''];
    restored.items[1].deleted = true;
    restored.items[2].deleted = true;
    restored.items[3].deleted = true;
    expect(surveyDraftPatch('  Νέος τίτλος  ', restored.items)).toEqual({
      title: 'Νέος τίτλος',
      items: [{ id: 10, text: 'Ποια λύση επιλέγετε;', options: ['Πρώτη', 'Δεύτερη'] }],
      deleteItemIds: [13],
    });
  });

  it('keeps open text questions valid and prevents publishing an empty or incomplete questionnaire', () => {
    const restored = hydrateSurveyDraft(savedDraft);
    expect(validSurveyDraft(restored.title, restored.items)).toBe(true);
    expect(validSurveyDraft('Μικ', restored.items)).toBe(false);
    expect(validSurveyDraft(restored.title, restored.items.map((item) => ({ ...item, deleted: true })))).toBe(false);
    const invalidChoice = restored.items.map((item) => item.id === 10 ? { ...item, options: ['Ένα', ' '] } : item);
    expect(validSurveyDraft(restored.title, invalidChoice)).toBe(false);
    expect(surveyDraftPatch(restored.title, [restored.items[3]]).items).toEqual([{ id: 13, text: 'Τι άλλο θα προτείνατε;' }]);
  });

  it('exposes an authenticated draft editor while preserving the legacy creation redirect', () => {
    const app = readFileSync(resolve(process.cwd(), 'client/src/App.tsx'), 'utf8');
    expect(app).toMatch(/<ProtectedRoute\s+path="\/surveys\/:id\/edit"\s+component=\{SurveyCreatePage\}/);
    expect(app).toMatch(/<Route path="\/surveys\/create">\s*<Redirect to="\/proposals\/new" \/>/);
    const detail = readFileSync(resolve(process.cwd(), 'client/src/pages/survey-detail.tsx'), 'utf8');
    expect(detail).toContain('navigate(`/surveys/${poll.id}/edit`)');
  });
});
