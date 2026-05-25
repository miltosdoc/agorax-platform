/**
 * Storage Types
 *
 * Central type definitions for the storage layer.
 * IStorage interface defines the contract that DatabaseStorage implements.
 */

import type {
  User, InsertUser, InsertAccountActivity, SelectAccountActivity,
  Community, InsertCommunity, CommunityMember,
  Proposal, InsertProposal, ProposalAmendment, InsertProposalAmendment,
  ProposalSupport, ProposalVote,
  SortitionBody, InsertSortitionBody, SortitionMember, SortitionAttendance,
  DebateArgument, InsertDebateArgument,
  Poll, InsertPoll, PollWithOptions, PollWithQuestions,
  Vote, InsertVote, RankingVote,
  PollQuestion, PollAnswer, PollUserResponse, InsertPollUserResponse,
  PollNotification,
  PlatformSetting,
  Comment, InsertComment
} from '../../shared/schema';

/**
 * Legacy IStorage interface for backward compatibility.
 * New code should use domain repositories directly.
 */
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByProviderId(providerId: string, provider: string): Promise<User | undefined>;
  getUserByVoterHash(voterHash: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(userId: number, updates: Partial<User>): Promise<User>;
  deleteUser(userId: number, deletePolls: boolean): Promise<boolean>;
  checkDuplicateAccounts(deviceFingerprint: string, ip: string): Promise<number>;
  createAccountActivity(activity: InsertAccountActivity): Promise<void>;
  updateUserLoginInfo(userId: number, data: { lastLoginIp: string }): Promise<User>;
  getUserAccountActivity(userId: number): Promise<SelectAccountActivity[]>;
  getAllUsersWithAccountInfo(filters?: { status?: string; search?: string }): Promise<User[]>;
  updateAccountStatus(userId: number, status: string): Promise<User>;

  // Community methods
  createCommunity(insertCommunity: InsertCommunity): Promise<Community>;
  getCommunity(id: number): Promise<Community | undefined>;
  getCommunities(userId?: number): Promise<Community[]>;
  updateCommunity(id: number, updates: Partial<Community>): Promise<Community>;
  deleteCommunity(id: number): Promise<boolean>;
  getCommunityMembers(communityId: number): Promise<CommunityMember[]>;
  addCommunityMember(communityId: number, userId: number, role?: string): Promise<CommunityMember>;
  removeCommunityMember(communityId: number, userId: number): Promise<boolean>;
  updateMemberRole(communityId: number, userId: number, role: string): Promise<CommunityMember>;
  isCommunityMember(communityId: number, userId: number): Promise<boolean>;
  getCommunityMemberRole(communityId: number, userId: number): Promise<string | undefined>;
  mergeCommunities(sourceId: number, targetId: number): Promise<Community>;
  getMergedCommunities(targetId: number): Promise<Community[]>;

  // Proposal methods
  createProposal(insertProposal: InsertProposal): Promise<Proposal>;
  getProposal(id: number): Promise<Proposal | undefined>;
  getProposals(communityId: number, filters?: { status?: string; category?: string }): Promise<Proposal[]>;
  updateProposal(id: number, updates: Partial<Proposal>): Promise<Proposal>;
  transitionProposalState(id: number, newState: string): Promise<Proposal>;
  getAllProposals(limit?: number): Promise<Proposal[]>;
  searchProposals(query: string, limit?: number): Promise<Proposal[]>;
  getProposalSupport(proposalId: number, userId?: number): Promise<any>;
  castProposalVote(proposalId: number, userId: number, choice: string): Promise<ProposalVote>;
  getUserProposalVote(proposalId: number, userId: number): Promise<ProposalVote | undefined>;
  getProposalVoteResults(proposalId: number): Promise<any>;

  // Amendment methods
  createAmendment(insertAmendment: InsertProposalAmendment): Promise<ProposalAmendment>;
  getAmendment(id: number): Promise<ProposalAmendment | undefined>;
  getAmendments(proposalId: number): Promise<ProposalAmendment[]>;
  updateAmendment(id: number, updates: Partial<ProposalAmendment>): Promise<ProposalAmendment>;
  countAmendmentsForProposal(proposalId: number): Promise<number>;

  // Sortition methods
  createSortitionBody(insertBody: InsertSortitionBody): Promise<SortitionBody>;
  getSortitionBody(id: number): Promise<SortitionBody | undefined>;
  getSortitionMembers(bodyId: number): Promise<SortitionMember[]>;
  addSortitionMember(bodyId: number, userId: number): Promise<SortitionMember>;
  removeSortitionMember(bodyId: number, userId: number): Promise<boolean>;
  updateSortitionMember(bodyId: number, userId: number, updates: Partial<SortitionMember>): Promise<SortitionMember>;
  completeSortitionBody(id: number): Promise<SortitionBody>;
  getAttendance(proposalId: number, memberId: number): Promise<SortitionAttendance | undefined>;
  upsertAttendance(proposalId: number, memberId: number, updates: Partial<SortitionAttendance>): Promise<SortitionAttendance>;
  bodyIdsForProposal(proposalId: number): Promise<number[]>;

  // Voting methods
  createPoll(poll: InsertPoll, options?: any): Promise<Poll>;
  getPolls(filters?: any): Promise<PollWithOptions[]>;
  getUserPolls(userId: number): Promise<PollWithOptions[]>;
  getParticipatedPolls(userId: number): Promise<PollWithOptions[]>;
  getPoll(id: number, userId?: number): Promise<PollWithOptions | undefined>;
  updatePoll(id: number, updates: Partial<Poll>): Promise<Poll>;
  extendPollDuration(id: number, newEndDate: Date): Promise<Poll>;
  deletePoll(id: number): Promise<boolean>;
  createSurveyPoll(poll: InsertPoll, questions: any[]): Promise<Poll>;
  getSurveyPoll(id: number, userId?: number): Promise<PollWithQuestions | undefined>;
  updateSurveyStructure(id: number, updates: Partial<Poll>, questions: any[]): Promise<Poll>;
  updateSurveyMetadata(id: number, updates: Partial<Poll>): Promise<Poll>;
  createSurveyResponse(responses: InsertPollUserResponse[]): Promise<PollUserResponse[]>;
  getSurveyResults(pollId: number): Promise<any>;
  hasUserRespondedToSurvey(pollId: number, userId: number): Promise<boolean>;
  hasAnyResponses(pollId: number): Promise<boolean>;
  createVote(vote: InsertVote | RankingVote): Promise<Vote>;
  hasUserVoted(pollId: number, userId: number): Promise<boolean>;
  getPollParticipantCount(pollId: number): Promise<number>;
  canEditVote(pollId: number, userId: number): Promise<boolean>;
  getPollResults(pollId: number): Promise<any[]>;

  // Debate methods
  createDebateArgument(insertArgument: InsertDebateArgument): Promise<DebateArgument>;
  getDebateArguments(proposalId: number): Promise<DebateArgument[]>;
  supportDebateArgument(argumentId: number, userId: number): Promise<DebateArgument>;
  opposeDebateArgument(argumentId: number, userId: number): Promise<DebateArgument>;

  // Notification methods
  getUserNotifications(userId: number): Promise<(PollNotification & { poll?: PollWithOptions })[]>;
  markNotificationAsRead(notificationId: number): Promise<PollNotification>;
  enrichPoll(poll: Poll, userId?: number): Promise<PollWithOptions>;

  // Platform methods
  getPlatformSettings(): Promise<PlatformSetting[]>;
  updatePlatformSetting(key: string, value: string, userId: number): Promise<PlatformSetting>;
  searchMembers(query: string, limit?: number): Promise<User[]>;
  searchCommunities(query: string, limit?: number): Promise<Community[]>;

  // Comment methods (temporary)
  createComment(comment: InsertComment): Promise<Comment>;
  getPollComments(pollId: number): Promise<Comment[]>;
}

