import type { Community, Proposal } from './schema';

export type CommunityUserRole = 'founder' | 'admin' | 'member' | string | undefined;

export interface CommunitySummaryPermissions {
  canManageSettings: boolean;
}

export interface CommunityProposalSummary {
  id: number;
  question: string;
  status: string;
  authorId: number;
  authorLabel: string;
  createdAt: string;
}

export interface CommunitySummary {
  community: Community;
  memberCount: number;
  currentUserRole?: string;
  canManageSettings: boolean;
  proposals: CommunityProposalSummary[];
}

export interface CommunityDashboardMetrics {
  memberCount: number;
  proposalCount: number;
  activeProposalCount: number;
  decidedProposalCount: number;
}

export function getCommunitySummaryPermissions(role: CommunityUserRole): CommunitySummaryPermissions {
  return { canManageSettings: role === 'founder' || role === 'admin' };
}

export function getGovernanceTranslationKey(governanceModel?: string | null): string {
  switch (governanceModel) {
    case 'admin_team':
    case 'admin_founded':
      return 'community.governance_admin_team';
    case 'hybrid':
    case 'admin_guided':
      return 'community.governance_hybrid';
    case 'no_admin':
    default:
      return 'community.governance_no_admin';
  }
}

export function hasDemocracyScore(score: unknown): boolean {
  return score !== null && score !== undefined && score !== '' && Number.isFinite(Number(score));
}

export function getCommunityDashboardMetrics(input: {
  memberCount: number;
  proposals: Array<Pick<CommunityProposalSummary, 'status'>>;
}): CommunityDashboardMetrics {
  const activeStatuses = new Set(['draft', 'review', 'author_review', 'community_signal', 'sortition_synthesis', 'voting']);

  return {
    memberCount: input.memberCount,
    proposalCount: input.proposals.length,
    activeProposalCount: input.proposals.filter((proposal) => activeStatuses.has(proposal.status)).length,
    decidedProposalCount: input.proposals.filter((proposal) => proposal.status === 'decided').length,
  };
}

export function mapProposalToCommunitySummary(proposal: Pick<Proposal, 'id' | 'question' | 'status' | 'authorId' | 'createdAt'>): CommunityProposalSummary {
  return {
    id: proposal.id,
    question: proposal.question,
    status: proposal.status,
    authorId: proposal.authorId,
    authorLabel: `User #${proposal.authorId}`,
    createdAt: proposal.createdAt instanceof Date ? proposal.createdAt.toISOString() : String(proposal.createdAt),
  };
}

export function buildCommunitySummary(
  community: Community,
  proposals: Pick<Proposal, 'id' | 'question' | 'status' | 'authorId' | 'createdAt'>[],
  memberCount: number,
  currentUserRole?: string,
): CommunitySummary {
  const permissions = getCommunitySummaryPermissions(currentUserRole);
  const normalizedCommunity = {
    ...community,
    governanceModel: getGovernanceTranslationKey(community.governanceModel),
    democracyScore: hasDemocracyScore(community.democracyScore) ? community.democracyScore : null,
  };

  return {
    community: normalizedCommunity,
    memberCount,
    currentUserRole,
    canManageSettings: permissions.canManageSettings,
    proposals: proposals.map(mapProposalToCommunitySummary),
  };
}
