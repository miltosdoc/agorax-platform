/**
 * Storage Layer - Domain-Driven Architecture
 *
 * This file re-exports the domain repositories and legacy facade.
 * New code should import domain repositories directly:
 *   import { userRepo, communityRepo } from './storage';
 *
 * Legacy code can continue using the facade:
 *   import { storage } from './storage';
 */

// Domain repositories (classes for testing)
export { UserRepository } from './storage/users';
export { CommunityRepository } from './storage/communities';
export { ProposalRepository } from './storage/proposals';
export { AmendmentRepository } from './storage/amendments';
export { SortitionRepository } from './storage/sortition';
export { VotingRepository } from './storage/voting';
export { DebateRepository } from './storage/debate';
export { NotificationRepository } from './storage/notifications';
export { PlatformRepository } from './storage/platform';
export { MediaRepository } from './storage/media';

// Pre-instantiated repository instances (for use in routers)
import { UserRepository } from './storage/users';
import { CommunityRepository } from './storage/communities';
import { ProposalRepository } from './storage/proposals';
import { AmendmentRepository } from './storage/amendments';
import { SortitionRepository } from './storage/sortition';
import { VotingRepository } from './storage/voting';
import { DebateRepository } from './storage/debate';
import { NotificationRepository } from './storage/notifications';
import { PlatformRepository } from './storage/platform';
import { MediaRepository } from './storage/media';

export const userRepo = new UserRepository();
export const communityRepo = new CommunityRepository();
export const proposalRepo = new ProposalRepository();
export const amendmentRepo = new AmendmentRepository();
export const sortitionRepo = new SortitionRepository();
export const votingRepo = new VotingRepository();
export const debateRepo = new DebateRepository();
export const notificationRepo = new NotificationRepository();
export const platformRepo = new PlatformRepository();
export const mediaRepo = new MediaRepository();

// Legacy facade (backward compatibility)
export { DatabaseStorage } from './storage/legacy';
export type { IStorage } from './storage/types';

// Legacy storage instance for backward compatibility
import { DatabaseStorage } from "./storage/legacy";
export const storage = new DatabaseStorage();
