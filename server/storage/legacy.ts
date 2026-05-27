/**
 * DatabaseStorage Facade
 *
 * Backward-compatible wrapper that delegates to domain repositories.
 * Allows gradual migration — routes can continue importing from
 * storage/index.ts without changes until all are migrated.
 *
 * TODO: Remove this facade once all routes use domain repos directly.
 */

import { UserRepository } from './users';
import { CommunityRepository } from './communities';
import { ProposalRepository } from './proposals';
import { AmendmentRepository } from './amendments';
import { SortitionRepository } from './sortition';
import { VotingRepository } from './voting';
import { DebateRepository } from './debate';
import { NotificationRepository } from './notifications';
import { PlatformRepository } from './platform';

import type { IStorage } from './types';
// Session store setup is handled in server/auth.ts

// Re-export types for backward compatibility
export type { IStorage } from './types';

/**
 * Legacy DatabaseStorage class that delegates to domain repositories.
 * Maintains the original IStorage interface for backward compatibility.
 */
export class DatabaseStorage {

  private users = new UserRepository();
  private communities = new CommunityRepository();
  private proposals = new ProposalRepository();
  private amendments = new AmendmentRepository();
  private sortition = new SortitionRepository();
  private voting = new VotingRepository();
  private debate = new DebateRepository();
  private notifications = new NotificationRepository();
  private platform = new PlatformRepository();

  // Session store is initialized in auth.ts
  sessionStore: any = null;

  // ─── User Methods ───────────────────────────────────────────────────────

  async getUser(id: number) {
    return this.users.getUser(id);
  }

  async getUserByUsername(username: string) {
    return this.users.getUserByUsername(username);
  }

  async getUserByEmail(email: string) {
    return this.users.getUserByEmail(email);
  }

  async getUserByProviderId(providerId: string, provider: string) {
    return this.users.getUserByProviderId(providerId, provider);
  }

  async getUserByVoterHash(voterHash: string) {
    return this.users.getUserByVoterHash(voterHash);
  }

  async createUser(user: any) {
    return this.users.createUser(user);
  }

  async updateUser(userId: number, updates: any) {
    return this.users.updateUser(userId, updates);
  }

  async deleteUser(userId: number, deletePolls: boolean) {
    return this.users.deleteUser(userId, deletePolls);
  }

  async checkDuplicateAccounts(deviceFingerprint: string, ip: string) {
    return this.users.checkDuplicateAccounts(deviceFingerprint, ip);
  }

  async createAccountActivity(activity: any) {
    return this.users.createAccountActivity(activity);
  }

  async updateUserLoginInfo(userId: number, data: any) {
    return this.users.updateUserLoginInfo(userId, data);
  }

  async getUserAccountActivity(userId: number) {
    return this.users.getUserAccountActivity(userId);
  }

  async getAllUsersWithAccountInfo(filters?: any) {
    return this.users.getAllUsersWithAccountInfo(filters);
  }

  async recordConsent(args: { userId: number; consentVersion: string; consentTextHash: string; locale: string }) {
    return this.users.recordConsent(args);
  }

  async getActiveConsent(userId: number) {
    return this.users.getActiveConsent(userId);
  }

  async withdrawConsent(userId: number) {
    return this.users.withdrawConsent(userId);
  }

  async clearRequiresConsent(userId: number) {
    return this.users.clearRequiresConsent(userId);
  }

  async setRequiresConsent(userId: number, value: boolean) {
    return this.users.setRequiresConsent(userId, value);
  }

  async createErasureRequest(args: { userId: number; reason?: string }) {
    return this.users.createErasureRequest(args);
  }

  async getPendingErasureRequest(userId: number) {
    return this.users.getPendingErasureRequest(userId);
  }

  async exportUserData(userId: number) {
    return this.users.exportUserData(userId);
  }

  async listPendingErasureRequests() {
    return this.users.listPendingErasureRequests();
  }

  async getErasureRequest(id: number) {
    return this.users.getErasureRequest(id);
  }

  async processErasureRequest(args: { requestId: number; processedBy: number; notes?: string }) {
    return this.users.processErasureRequest(args);
  }

  async processDeferredErasuresForProposal(proposalId: number) {
    return this.users.processDeferredErasuresForProposal(proposalId);
  }

  async updateAccountStatus(userId: number, status: string) {
    return this.users.updateAccountStatus(userId, status);
  }

  // ─── Community Methods ────────────────────────────────────────────────────

  async createCommunity(insertCommunity: any) {
    return this.communities.createCommunity(insertCommunity);
  }

  async getCommunity(id: number) {
    return this.communities.getCommunity(id);
  }

  async getCommunities(userId?: number) {
    return this.communities.getCommunities(userId);
  }

  async updateCommunity(id: number, updates: any) {
    return this.communities.updateCommunity(id, updates);
  }

  async deleteCommunity(id: number) {
    return this.communities.deleteCommunity(id);
  }

  async getCommunityMembers(communityId: number) {
    return this.communities.getCommunityMembers(communityId);
  }

  async addCommunityMember(communityId: number, userId: number, role?: string) {
    return this.communities.addCommunityMember(communityId, userId, role);
  }

  async removeCommunityMember(communityId: number, userId: number) {
    return this.communities.removeCommunityMember(communityId, userId);
  }

  async updateMemberRole(communityId: number, userId: number, role: string) {
    return this.communities.updateMemberRole(communityId, userId, role);
  }

  async isCommunityMember(communityId: number, userId: number) {
    return this.communities.isCommunityMember(communityId, userId);
  }

  async getCommunityMemberRole(communityId: number, userId: number) {
    return this.communities.getCommunityMemberRole(communityId, userId);
  }

  async mergeCommunities(sourceId: number, targetId: number) {
    return this.communities.mergeCommunities(sourceId, targetId);
  }

  async getMergedCommunities(targetId: number) {
    return this.communities.getMergedCommunities(targetId);
  }

  // ─── Proposal Methods ────────────────────────────────────────────────────

  async createProposal(insertProposal: any) {
    return this.proposals.createProposal(insertProposal);
  }

  async getProposal(id: number) {
    return this.proposals.getProposal(id);
  }

  async getProposals(communityId: number, filters?: any) {
    return this.proposals.getProposals(communityId, filters);
  }

  async updateProposal(id: number, updates: any) {
    return this.proposals.updateProposal(id, updates);
  }

  async transitionProposalState(id: number, newState: string) {
    return this.proposals.transitionProposalState(id, newState);
  }

  async getAllProposals(limit?: number) {
    return this.proposals.getAllProposals(limit);
  }

  async searchProposals(query: string, limit = 10) {
    return this.proposals.searchProposals(query, limit);
  }

  async getProposalSupport(proposalId: number, userId?: number) {
    return this.proposals.getProposalSupport(proposalId, userId);
  }

  async castProposalVote(proposalId: number, userId: number, choice: string) {
    return this.proposals.castProposalVote(proposalId, userId, choice);
  }

  async getUserProposalVote(proposalId: number, userId: number) {
    return this.proposals.getUserProposalVote(proposalId, userId);
  }

  async getProposalVoteResults(proposalId: number) {
    return this.proposals.getProposalVoteResults(proposalId);
  }

  // ─── Amendment Methods ───────────────────────────────────────────────────

  async createAmendment(insertAmendment: any) {
    return this.amendments.createAmendment(insertAmendment);
  }

  async getAmendment(id: number) {
    return this.amendments.getAmendment(id);
  }

  async getAmendments(proposalId: number) {
    return this.amendments.getAmendments(proposalId);
  }

  async updateAmendment(id: number, updates: any) {
    return this.amendments.updateAmendment(id, updates);
  }

  async countAmendmentsForProposal(proposalId: number) {
    return this.amendments.countAmendmentsForProposal(proposalId);
  }

  // ─── Sortition Methods ───────────────────────────────────────────────────

  async createSortitionBody(insertBody: any) {
    return this.sortition.createSortitionBody(insertBody);
  }

  async getSortitionBody(id: number) {
    return this.sortition.getSortitionBody(id);
  }

  async getSortitionMembers(bodyId: number) {
    return this.sortition.getSortitionMembers(bodyId);
  }

  async addSortitionMember(bodyId: number, userId: number) {
    return this.sortition.addSortitionMember(bodyId, userId);
  }

  async removeSortitionMember(bodyId: number, userId: number) {
    return this.sortition.removeSortitionMember(bodyId, userId);
  }

  async updateSortitionMember(bodyId: number, userId: number, updates: any) {
    return this.sortition.updateSortitionMember(bodyId, userId, updates);
  }

  async completeSortitionBody(id: number) {
    return this.sortition.completeSortitionBody(id);
  }

  async getAttendance(proposalId: number, memberId: number) {
    return this.sortition.getAttendance(proposalId, memberId);
  }

  async upsertAttendance(proposalId: number, memberId: number, updates: any) {
    return this.sortition.upsertAttendance(proposalId, memberId, updates);
  }

  async bodyIdsForProposal(proposalId: number) {
    return (this.sortition as any).bodyIdsForProposal(proposalId);
  }

  // ─── Voting/Poll Methods ─────────────────────────────────────────────────

  async createPoll(poll: any, options?: any) {
    return this.voting.createPoll(poll, options);
  }

  async getPolls(filters?: any) {
    return this.voting.getPolls(filters);
  }

  async getUserPolls(userId: number) {
    return this.voting.getUserPolls(userId);
  }

  async getParticipatedPolls(userId: number) {
    return this.voting.getParticipatedPolls(userId);
  }

  async getPoll(id: number, userId?: number) {
    return this.voting.getPoll(id, userId);
  }

  async updatePoll(id: number, updates: any) {
    return this.voting.updatePoll(id, updates);
  }

  async extendPollDuration(id: number, newEndDate: Date) {
    return this.voting.extendPollDuration(id, newEndDate);
  }

  async deletePoll(id: number) {
    return this.voting.deletePoll(id);
  }

  async createSurveyPoll(poll: any, questions: any) {
    return this.voting.createSurveyPoll(poll, questions);
  }

  async getSurveyPoll(id: number, userId?: number) {
    return this.voting.getSurveyPoll(id, userId);
  }

  async updateSurveyStructure(id: number, updates: any, questions: any) {
    return this.voting.updateSurveyStructure(id, updates, questions);
  }

  async updateSurveyMetadata(id: number, updates: any) {
    return this.voting.updateSurveyMetadata(id, updates);
  }

  async createSurveyResponse(responses: any) {
    return this.voting.createSurveyResponse(responses);
  }

  async getSurveyResults(pollId: number) {
    return this.voting.getSurveyResults(pollId);
  }

  async hasUserRespondedToSurvey(pollId: number, userId: number) {
    return this.voting.hasUserRespondedToSurvey(pollId, userId);
  }

  async hasAnyResponses(pollId: number) {
    return this.voting.hasAnyResponses(pollId);
  }

  async createVote(vote: any) {
    return this.voting.createVote(vote);
  }

  async hasUserVoted(pollId: number, userId: number) {
    return this.voting.hasUserVoted(pollId, userId);
  }

  async getPollParticipantCount(pollId: number) {
    return this.voting.getPollParticipantCount(pollId);
  }

  async canEditVote(pollId: number, userId: number) {
    return this.voting.canEditVote(pollId, userId);
  }

  async getPollResults(pollId: number) {
    return this.voting.getPollResults(pollId);
  }

  // ─── Debate Methods ──────────────────────────────────────────────────────

  async createDebateArgument(insertArgument: any) {
    return this.debate.createDebateArgument(insertArgument);
  }

  async getDebateArguments(proposalId: number) {
    return this.debate.getDebateArguments(proposalId);
  }

  async supportDebateArgument(argumentId: number, userId: number) {
    return this.debate.supportDebateArgument(argumentId, userId);
  }

  async opposeDebateArgument(argumentId: number, userId: number) {
    return this.debate.opposeDebateArgument(argumentId, userId);
  }

  // ─── Notification Methods ────────────────────────────────────────────────

  async getUserNotifications(userId: number) {
    return this.notifications.getUserNotifications(userId);
  }

  async markNotificationAsRead(notificationId: number) {
    return this.notifications.markNotificationAsRead(notificationId);
  }

  async enrichPoll(poll: any, userId?: number) {
    return (this.notifications as any).enrichPoll(poll, userId);
  }

  // ─── Platform Methods ────────────────────────────────────────────────────

  async getPlatformSettings() {
    return this.platform.getPlatformSettings();
  }

  async updatePlatformSetting(key: string, value: string, userId: number) {
    return this.platform.updatePlatformSetting(key, value, userId);
  }

  async searchMembers(query: string, limit = 10) {
    return this.platform.searchMembers(query, limit);
  }

  async searchCommunities(query: string, limit = 10) {
    return this.platform.searchCommunities(query, limit);
  }

  // ─── Comment Methods (temporary - should move to a CommentsRepository) ───

  async createComment(comment: any) {
    // TODO: Move to a dedicated CommentsRepository
    throw new Error('createComment not yet migrated to domain repository');
  }

  async getPollComments(pollId: number) {
    // TODO: Move to a dedicated CommentsRepository
    throw new Error('getPollComments not yet migrated to domain repository');
  }


  // Analytics methods
  async getAnalyticsOverview(): Promise<any> {
    return {
      totalUsers: await (this.users as any).getUsers(),
      totalProposals: await this.proposals.getProposals(0),
      totalCommunities: await this.communities.getCommunities(),
    };
  }

  async getPollPopularityStats(): Promise<any> {
    return { polls: [], stats: {} };
  }

  async getActivityTrends(): Promise<any> {
    return { trends: [] };
  }

  async getUsagePatterns(): Promise<any> {
    return { patterns: [] };
  }

  async getAttendanceSummary(proposalId: number): Promise<any> {
    return { attended: 0, total: 0, rate: 0 };
  }

  async createProposalSupport(userId: number, proposalId: number): Promise<any> {
    return this.proposals.getProposalSupport(proposalId);
  }

}

