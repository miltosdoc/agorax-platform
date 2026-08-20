import type { ProposalState } from '@shared/proposal-lifecycle';
import { PROPOSAL_STATES } from '@shared/proposal-lifecycle';

export interface StatusEntry {
  color: string;
  icon: string;
  greekLabel: string;
  englishLabel: string;
  nextAction: string;
}

export const STATUS_MAP: Record<ProposalState, StatusEntry> = {
  draft: {
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: '📝',
    greekLabel: 'Σχέδιο',
    englishLabel: 'Draft',
    nextAction: 'Submit for review',
  },
  review: {
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: '🔍',
    greekLabel: 'Εξέταση',
    englishLabel: 'Review',
    nextAction: 'Waiting for LLM validation',
  },
  author_review: {
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: '✏️',
    greekLabel: 'Ανάθεση Συγγραφέα',
    englishLabel: 'Author Review',
    nextAction: 'Review and revise',
  },
  community_signal: {
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: '📢',
    greekLabel: 'Διαβούλευση & Τροπολογίες',
    englishLabel: 'Deliberation & Amendments',
    nextAction: 'Vote on amendments',
  },
  final_review: {
    color: 'bg-teal-100 text-teal-800 border-teal-200',
    icon: '🤖',
    greekLabel: 'Τελικό Κείμενο',
    englishLabel: 'Final Text Review',
    nextAction: 'Author accepts the AI-merged text',
  },
  sortition_synthesis: {
    color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    icon: '🎲',
    greekLabel: 'Κλήρωση',
    englishLabel: 'Sortition',
    nextAction: 'Sortition body deliberating',
  },
  voting: {
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: '🗳️',
    greekLabel: 'Ψηφοφορία',
    englishLabel: 'Voting',
    nextAction: 'Cast your vote',
  },
  decided: {
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: '✅',
    greekLabel: 'Απόφαση',
    englishLabel: 'Decided',
    nextAction: 'View result',
  },
  archived: {
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: '📦',
    greekLabel: 'Αρχειοθετημένο',
    englishLabel: 'Archived',
    nextAction: '',
  },
};

export const ORDERED_STATES: ProposalState[] = [...PROPOSAL_STATES];

export function getStatusForProposal(proposal: { status: string }): StatusEntry {
  return STATUS_MAP[proposal.status as ProposalState] ?? STATUS_MAP.draft;
}

export function getStatusLabelForLocale(status: string, locale: 'el' | 'en'): string {
  const entry = STATUS_MAP[status as ProposalState];
  if (!entry) return status;
  return locale === 'el' ? entry.greekLabel : entry.englishLabel;
}
