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

/**
 * Label for how a community is governed, from its `type`.
 *
 * It used to read the stored governanceModel column, which nothing enforced
 * and which drifted from reality — managed communities announcing themselves
 * as having no administrators. Reading `type` cannot drift: it is the field
 * the permission checks use.
 */
export function getGovernanceTranslationKey(type?: string | null): string {
  return type === 'managed' ? 'community.governance_admin_team' : 'community.governance_no_admin';
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
    governanceModel: getGovernanceTranslationKey(community.type),
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
