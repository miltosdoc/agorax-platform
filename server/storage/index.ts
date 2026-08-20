/**
 * Storage Layer
 *
 * Domain-specific repositories for all database operations.
 * Each repository handles a specific domain of the application.
 *
 * Exports both repository classes and pre-instantiated instances.
 */

// Domain repository classes (for testing/custom instantiation)
export { UserRepository } from './users';
export { CommunityRepository } from './communities';
export { ProposalRepository } from './proposals';
export { AmendmentRepository } from './amendments';
export { SortitionRepository } from './sortition';
export { VotingRepository } from './voting';
export { DebateRepository } from './debate';
export { NotificationRepository } from './notifications';
export { PlatformRepository } from './platform';

// Pre-instantiated repository instances for use in routers
import { UserRepository } from './users';
import { CommunityRepository } from './communities';
import { ProposalRepository } from './proposals';
import { AmendmentRepository } from './amendments';
import { SortitionRepository } from './sortition';
import { VotingRepository } from './voting';
import { DebateRepository } from './debate';
import { NotificationRepository } from './notifications';
import { PlatformRepository } from './platform';

export const users = new UserRepository();
export const communities = new CommunityRepository();
export const proposals = new ProposalRepository();
export const amendments = new AmendmentRepository();
export const sortition = new SortitionRepository();
export const voting = new VotingRepository();
export const debate = new DebateRepository();
export const notifications = new NotificationRepository();
export const platform = new PlatformRepository();

// Legacy facade for backward compatibility
export { DatabaseStorage } from './legacy';
export type { IStorage } from './types';
