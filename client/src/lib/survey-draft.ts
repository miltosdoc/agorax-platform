/** Draft editing uses the existing survey API; quality and platform items stay fixed. */
export interface SurveyDraftItem {
  id: number;
  text: string;
  itemType: string;
  options: string[] | null;
  randomizeOptions: boolean;
  isAttentionCheck: boolean;
  isModuleItem?: boolean;
  required?: boolean;
  deleted?: boolean;
}

export interface SurveyDraftVerdict {
  approved: boolean;
  flags: Array<{ issue: string; explanation: string; severity: string }>;
  reasoning?: string;
}

export interface SurveyDraftResponse {
  poll: {
    id: number;
    title: string;
    topicTag: string;
    tier: string;
    creatorId: number | null;
    status: string;
    gatekeeperVerdict?: SurveyDraftVerdict | null;
  };
  items: SurveyDraftItem[];
  verdict?: SurveyDraftVerdict;
}

export function canEditSurveyDraft(poll: Pick<SurveyDraftResponse['poll'], 'creatorId' | 'status'>, userId?: number | null) {
  return userId != null && poll.creatorId === userId && poll.status === 'draft';
}

export function isFixedSurveyItem(item: SurveyDraftItem) {
  return item.isAttentionCheck || item.isModuleItem === true;
}

export function hydrateSurveyDraft(response: SurveyDraftResponse) {
  return {
    title: response.poll.title,
    items: response.items.map((item) => ({ ...item, options: item.options ? [...item.options] : null, deleted: false })),
    verdict: response.verdict ?? response.poll.gatekeeperVerdict ?? null,
  };
}

export function validSurveyDraft(title: string, items: SurveyDraftItem[]) {
  const editable = items.filter((item) => !item.deleted && !isFixedSurveyItem(item));
  return title.trim().length >= 5 && title.trim().length <= 200 && editable.length > 0 && editable.every((item) => {
    const options = item.options?.map((option) => option.trim()).filter(Boolean) ?? [];
    return item.text.trim().length >= 5 && item.text.trim().length <= 500 && (
      item.itemType === 'open_text' || (options.length >= 2 && options.length <= 12)
    );
  });
}

export function surveyDraftPatch(title: string, items: SurveyDraftItem[]) {
  return {
    title: title.trim(),
    items: items.filter((item) => !item.deleted && !isFixedSurveyItem(item)).map((item) => ({
      id: item.id,
      text: item.text.trim(),
      ...(item.itemType === 'open_text' ? {} : { options: item.options?.map((option) => option.trim()).filter(Boolean) }),
    })),
    deleteItemIds: items.filter((item) => item.deleted && !isFixedSurveyItem(item)).map((item) => item.id),
  };
}
