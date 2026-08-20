# Storage Layer Refactoring — Detailed Spec

## Current State

`server/storage.ts`: 3,135 lines, 96 async methods, 1 class (`DatabaseStorage`), 1 interface (`IStorage`).

**Method categories identified:**
- Users: ~15 methods (getUser, createUser, updateUser, etc.)
- Communities: ~12 methods (getCommunity, createCommunity, getMembers, etc.)
- Proposals: ~18 methods (getProposal, createProposal, transitionState, etc.)
- Amendments: ~10 methods (getAmendments, createAmendment, authorReview, etc.)
- Sortition: ~12 methods (createBody, getMembers, submitScore, etc.)
- Voting: ~10 methods (castVote, getResults, getSupport, etc.)
- Debate: ~6 methods (createThread, reply, vote, getThreads)
- Notifications: ~8 methods (createNotification, getUnread, markRead, etc.)
- Platform: ~7 methods (getSettings, updateSetting, getAdminActions, etc.)

---

## Target Architecture

```
server/storage/
├── index.ts              # Re-exports all domain repos + IStorage facade
├── users.ts              # UserRepository
├── communities.ts        # CommunityRepository
├── proposals.ts          # ProposalRepository
├── amendments.ts         # AmendmentRepository
├── sortition.ts          # SortitionRepository
├── voting.ts             # VotingRepository
├── debate.ts             # DebateRepository
├── notifications.ts      # NotificationRepository
├── platform.ts           # PlatformRepository
└── legacy.ts             # DatabaseStorage facade (backward compat)
```

---

## File-by-File Spec

### `storage/index.ts`

```typescript
// Re-export domain repositories
export { UserRepository } from './users';
export { CommunityRepository } from './communities';
export { ProposalRepository } from './proposals';
export { AmendmentRepository } from './amendments';
export { SortitionRepository } from './sortition';
export { VotingRepository } from './voting';
export { DebateRepository } from './debate';
export { NotificationRepository } from './notifications';
export { PlatformRepository } from './platform';

// Legacy facade for backward compatibility
export { DatabaseStorage } from './legacy';
export type { IStorage } from './legacy';
```

### `storage/users.ts`

```typescript
/**
 * User Repository
 *
 * Handles all user-related database operations:
 * - CRUD (create, read, update, delete)
 * - Authentication (by email, username, provider ID)
 * - Gov.gr verification (voter hash)
 * - Account activity tracking
 * - Location verification
 */

import { db } from '../db';
import { users, accountActivity } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

export class UserRepository {
  /**
   * Get user by ID.
   * @returns User or null if not found.
   */
  async getUser(id: number) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  /**
   * Get user by email address.
   * @returns User or null if not found.
   */
  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  // ... etc
}
```

### `storage/communities.ts`

```typescript
/**
 * Community Repository
 *
 * Handles community lifecycle:
 * - Create, read, update communities
 * - Member management (add, remove, list)
 * - Community settings and governance model
 * - Community merging
 */

// Methods:
// - getCommunity(id)
// - createCommunity(input)
// - updateCommunity(id, input)
// - getCommunityMembers(communityId)
// - addCommunityMember(communityId, userId, role?)
// - removeCommunityMember(communityId, userId)
// - getCommunitySettings(communityId)
// - updateCommunitySettings(communityId, settings)
// - getMergedCommunities(communityId)
// - transitionToManaged(communityId, adminIds)
// - transitionToAutonomous(communityId)
```

### `storage/proposals.ts`

```typescript
/**
 * Proposal Repository
 *
 * Handles proposal lifecycle:
 * - CRUD operations
 * - State transitions (with validation)
 * - LLM validation results
 * - Final text management
 * - Category and community association
 */

// Methods:
// - getProposal(id)
// - createProposal(input)
// - updateProposal(id, input)
// - transitionProposalState(id, newState)
// - getProposals(communityId?, state?, category?)
// - getProposalValidationResult(proposalId)
// - saveFinalText(proposalId, text)
// - getProposalSupport(proposalId, userId?)
// - createProposalSupport(proposalId, userId, type)
// - removeProposalSupport(proposalId, userId, type)
```

### `storage/amendments.ts`

```typescript
/**
 * Amendment Repository
 *
 * Handles amendment workflow:
 * - Create amendments on proposals
 * - Author review (accept/reject with reason)
 * - Community signal (rejection votes)
 * - Signal calculation and flagging
 * - Sortition input preparation
 */

// Methods:
// - getAmendments(proposalId)
// - createAmendment(proposalId, input)
// - authorReviewAmendment(amendmentId, decision, reason?)
// - castRejectionVote(amendmentId, userId, direction)
// - calculateCommunitySignals(proposalId)
// - buildSortitionInput(proposalId)
```

### `storage/sortition.ts`

```typescript
/**
 * Sortition Repository
 *
 * Handles sortition body lifecycle:
 * - Create sortition bodies (random selection)
 * - Member management and eligibility
 * - Score submission and synthesis
 * - Timeout handling and replacement
 * - Attendance tracking
 */

// Methods:
// - createSortitionBody(communityId, proposalId, size)
// - getSortitionBody(bodyId)
// - getSortitionMembers(bodyId)
// - submitSortitionScore(bodyId, memberId, score, comment?)
// - synthesizeSortitionScores(bodyId)
// - getActiveSortitionMembers(communityId)
// - getEligibleMembers(communityId)
// - completeSortitionBody(bodyId)
// - getSortitionAttendance(bodyId)
```

### `storage/voting.ts`

```typescript
/**
 * Voting Repository
 *
 * Handles voting operations:
 * - Proposal support/oppose votes
 * - Poll voting (yes/no, ranking, multiple choice, survey)
 * - Vote results and statistics
 * - User response tracking
 */

// Methods:
// - castProposalVote(proposalId, userId, choice)
// - getProposalVotes(proposalId)
// - castPollVote(pollId, userId, optionId)
// - getPollResults(pollId)
// - getUserPollResponses(userId, pollId)
// - hasUserRespondedToSurvey(userId, pollId)
```

### `storage/debate.ts`

```typescript
/**
 * Debate Repository
 *
 * Handles debate threads:
 * - Create threads on proposals
 * - Reply to threads (nested)
 * - Vote on arguments (up/down)
 * - Get threads sorted by score
 */

// Methods:
// - createDebateThread(proposalId, userId, content)
// - replyToThread(parentId, userId, content)
// - voteOnThread(threadId, userId, direction)
// - getDebateThreads(proposalId)
// - getThreadStats(proposalId)
```

### `storage/notifications.ts`

```typescript
/**
 * Notification Repository
 *
 * Handles user notifications:
 * - Create notifications (sortition, proposal, voting)
 * - Get unread notifications
 * - Mark as read (single or bulk)
 * - Sortition-specific notifications
 */

// Methods:
// - createNotification(userId, type, title, description, link?)
// - getUnreadNotifications(userId)
// - markNotificationRead(notificationId)
// - markAllNotificationsRead(userId)
// - getSortitionNotifications(userId)
// - markSortitionNotificationRead(notificationId)
```

### `storage/platform.ts`

```typescript
/**
 * Platform Repository
 *
 * Handles platform-wide operations:
 * - Platform settings (key/value)
 * - Admin action logging
 * - Democracy score calculation
 * - Usage statistics and trends
 */

// Methods:
// - getPlatformSettings()
// - updatePlatformSetting(key, value)
// - logAdminAction(userId, action, target, details?)
// - getAdminActions(userId?, target?)
// - calculateDemocracyScore(communityId)
// - getActivityTrends(communityId, period?)
// - getUsagePatterns(communityId)
```

### `storage/legacy.ts`

```typescript
/**
 * DatabaseStorage Facade
 *
 * Backward-compatible wrapper that delegates to domain repositories.
 * Allows gradual migration — routes can continue importing from
 * storage/index.ts without changes until all are migrated.
 */

import { UserRepository } from './users';
import { CommunityRepository } from './communities';
// ... etc

export interface IStorage {
  // All 96 method signatures from the original interface
  getUser(id: number): Promise<User | undefined>;
  // ... etc
}

export class DatabaseStorage implements IStorage {
  private users = new UserRepository();
  private communities = new CommunityRepository();
  // ... etc

  // Delegate each method to the appropriate repository
  async getUser(id: number) {
    return this.users.getUser(id);
  }

  async getCommunity(id: number) {
    return this.communities.getCommunity(id);
  }

  // ... etc (96 delegation methods)
}
```

---

## Migration Steps

### Step 1: Create Domain Repositories
1. Create `server/storage/` directory
2. Create each domain repository file with its methods
3. Each repository imports `db` from `../db` and schema from `../../shared/schema`
4. Add JSDoc to every method

### Step 2: Create the Facade
1. Create `storage/legacy.ts` with `DatabaseStorage` class
2. Implement all 96 methods as delegations to domain repos
3. Ensure `IStorage` interface matches the original exactly

### Step 3: Update Imports
1. Update `storage/index.ts` to export the facade
2. Routes continue importing `storage` from `./storage` — zero breaking changes
3. Verify: `npx tsc --noEmit` passes

### Step 4: Gradual Migration (Optional)
1. Routes can start importing domain repos directly:
   ```typescript
   import { ProposalRepository } from '../storage/proposals';
   ```
2. Once all routes use domain repos, remove the facade

---

## Quality Checklist per File

- [ ] JSDoc on every public method
- [ ] Module-level comment explaining responsibility
- [ ] Zero `any` types
- [ ] Zero `console.log` statements
- [ ] Proper error handling (try/catch with meaningful errors)
- [ ] Type-safe parameters (Zod validation where appropriate)
- [ ] File < 300 lines
- [ ] Unit tests covering all methods
