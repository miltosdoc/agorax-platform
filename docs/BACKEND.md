# AgoraX Backend Documentation

## Architecture Overview

AgoraX is a **deliberation democracy platform** built with:

- **Backend**: Express.js + TypeScript
- **ORM**: Drizzle ORM with PostgreSQL
- **Frontend**: React + TypeScript with i18n (Greek/English)
- **Authentication**: JWT + session-based (express-session + connect-pg-simple)
- **Deployment**: Docker Compose (PostgreSQL + Node.js)

### Directory Structure

```
server/
├── index.ts              # Entry point, Express app setup
├── auth.ts               # Authentication routes & middleware
├── routes.ts             # All API endpoints (2757 LOC)
├── storage.ts            # Data access layer (2868 LOC, 79+ methods)
├── db.ts                 # PostgreSQL connection pool
├── config.ts             # Environment configuration
├── update-poll-locations.ts  # Background location update utility
└── utils/
    ├── amendment-merger.ts       # Merge accepted amendments into proposal text
    ├── amendment-similarity.ts   # Jaccard similarity for duplicate detection
    ├── amendment-processor.ts    # Author review, rejection voting, community signals
    ├── ballot-client.ts          # Gov.gr ballot PDF validation
    ├── democracy-score.ts        # Community governance quality scoring
    ├── admin-action-logger.ts    # Audit trail for admin actions
    ├── geo-region-detector.ts    # Normalize geographic regions
    ├── job-queue.ts              # Async job processing
    ├── llm-validation.ts         # LLM-based proposal validation
    ├── notifications.ts          # Notification system
    ├── proposal-structuring.ts   # AI-assisted proposal formatting
    ├── reverse-geocoding.ts      # Nominatim reverse geocoding
    ├── sortition-timeout.ts      # Sortition body timeout handling
    ├── sortition.ts              # Random citizen jury selection
    └── location-validator.ts     # Validate GPS coordinates

shared/
├── schema.ts             # Drizzle ORM schema (981 LOC, 24 tables)
├── proposal-lifecycle.ts # Proposal state machine (67 LOC)
├── community-settings.ts # Community configuration sanitization
└── community-summary.ts  # Community summary builder
```

---

## Database Schema

### Core Tables (Legacy Poll System)

**users** — User accounts with authentication, location, and verification
- `id` (PK), `username` (unique), `password`, `name`, `email` (unique)
- `providerId`, `provider` — OAuth provider (Google, Facebook, Twitter)
- `latitude`, `longitude` — GPS coordinates (text)
- `locationConfirmed`, `locationVerified` — Location trust flags
- `isAdmin` — Admin role
- `deviceFingerprint`, `registrationIp`, `lastLoginIp`, `accountFlags` (JSONB)
- `accountStatus` — Account state (active, banned, pending)
- `govgrVerified`, `govgrVerifiedAt`, `govgrVoterHash` — Greek gov.gr verification

**polls** — Polls/votes (legacy system, being phased out)
- `id` (PK), `title`, `description`, `category`
- `creatorId` → users.id
- `startDate`, `endDate`, `isActive`, `allowExtension`
- `visibility`, `showResults`, `allowComments`, `requireVerification`
- `pollType` — singleChoice, multipleChoice, ordering, surveyPoll
- `locationScope` — global or geofenced
- `communityMode` — hides creator name
- Geofencing: `centerLat`, `centerLng`, `radiusKm`
- Location: `city`, `region`, `country`, `locationCity`, `locationRegion`, `locationCountry`
- `communityId` → communities.id (nullable)

**poll_options** — Poll answer options
- `id` (PK), `pollId` → polls.id, `text`, `order`

**votes** — User votes on poll options
- `id` (PK), `pollId` → polls.id, `userId` → users.id, `optionId` → poll_options.id
- `comment`, `createdAt`

**comments** — Poll comments
- `id` (PK), `pollId` → polls.id, `userId` → users.id, `text`, `createdAt`

**poll_notifications** — Community poll notifications
- `id` (PK), `userId` → users.id, `pollId` → polls.id, `read`, `createdAt`
- Unique constraint: (userId, pollId)

**account_activity** — Login/device tracking
- `id` (PK), `userId` → users.id, `deviceFingerprint`, `ipAddress`
- `action`, `userAgent`, `timestamp`

**ballot_votes** — Gov.gr ballot votes (solemn declaration)
- `id` (PK), `pollId` → polls.id, `voterHash` (SHA256 of AFM + salt)
- `fileHash` (unique, SHA256 of PDF), `voteChoice`, `signerName`, `createdAt`
- Unique constraint: (pollId, voterHash)

**poll_questions** — Survey poll questions
- `id` (PK), `pollId` → polls.id, `text`, `questionType`
- `order`, `parentId` (self-ref), `parentAnswerId`, `required`

**poll_answers** — Survey poll answer options
- `id` (PK), `questionId` → poll_questions.id, `text`, `order`

**poll_user_responses** — Survey poll user responses
- `id` (PK), `pollId` → polls.id, `questionId` → poll_questions.id
- `userId` → users.id, `answerId` → poll_answers.id, `answerValue` (JSONB)

### Deliberation Democracy Tables

**communities** — Governance communities
- `id` (PK), `name`, `description`
- `type` — autonomous | managed
- `governanceModel` — no_admin | admin_team | hybrid
- `creatorId` → users.id
- Deliberation params:
  - `maxConcurrentVotes` (-1 = unlimited)
  - `minParticipationPct` (quorum threshold, 0-1)
  - `sortitionSize` (default 20), `sortitionMode` (absolute | percentage)
  - `sortitionResponseHours` (default 72)
- Amendment params:
  - `amendmentThreshold` (upvote ratio for rejected amendments, default 0.5)
  - `maxAmendmentsPerProposal` (-1 = unlimited)
- `requireGovgrVerification` — Require gov.gr for participation
- `democracyScore` — Computed governance quality metric

**community_members** — Community membership
- `id` (PK), `communityId` → communities.id, `userId` → users.id
- `role` — member | admin | founder
- `joinedAt`
- Unique constraint: (communityId, userId)

**proposals** — Deliberation proposals (Προβουλεύματα)
- `id` (PK), `communityId` → communities.id, `authorId` → users.id
- `question` (Το Ερώτημα), `solution` (Η Απάντηση/Λύση)
- `finalText` — Final text from sortition body (null until synthesis)
- `status` — Proposal lifecycle state (see Proposal Lifecycle section)
- LLM validation: `llmScore` (0-100), `llmFeedback`, `llmValidatedAt`, `llmValidationRound`
- Sortition: `sortitionAvgScore`, `sortitionRank`
- `category`, `createdAt`, `updatedAt`

**proposal_amendments** — Amendments to proposals (Αντιπροτάσεις & Βελτιώσεις)
- `id` (PK), `proposalId` → proposals.id, `authorId` → users.id
- `type` — improvement (βελτίωση) | counter_proposal (αντιπρόταση)
- `text` — Amendment content
- Author review: `authorDecision` (accepted | rejected | null), `authorReason`
- Community signal: `rejectionUpvotes`, `rejectionDownvotes`
- Legacy: `status` (pending | accepted | rejected | under_review), `authorVeto`
- `llmScore`, `createdAt`

**amendment_rejection_votes** — Community votes on rejected amendments
- `id` (PK), `amendmentId` → proposal_amendments.id, `userId` → users.id
- `vote` — +1 (disagree with rejection) or -1 (agree with rejection)
- Unique constraint: (amendmentId, userId)

**sortition_bodies** — Random citizen juries (Κληρωτά Σώματα)
- `id` (PK), `communityId` → communities.id
- `purpose` — validity_check | scoring | conflict_resolution | vote_promotion
- `proposalId` → proposals.id (nullable)
- `size` (target member count), `responseHours` (default 72)
- `status` — selecting | active | completed | timeout
- `selectedAt`, `completedAt`, `createdAt`

**sortition_members** — Sortition body membership
- `id` (PK), `bodyId` → sortition_bodies.id, `userId` → users.id
- `responded`, `score` (0-10 or 0-100), `scoredAt`
- Unique constraint: (bodyId, userId)

**debate_arguments** — For/against arguments (Διάλογος)
- `id` (PK), `proposalId` → proposals.id, `authorId` → users.id
- `side` — for | against
- `text`, `supportCount`, `oppositionCount`, `createdAt`

**proposal_support** — Proposal support/opposition (Συγκέντρωση Υποστήριξης)
- `id` (PK), `proposalId` → proposals.id, `userId` → users.id
- `type` — support | oppose
- Unique constraint: (proposalId, userId, type)

**proposal_votes** — Final ratification votes (Επικυρωτική Ψηφοφορία)
- `id` (PK), `proposalId` → proposals.id, `userId` → users.id
- `choice` — yes | no | abstain
- `weight` (default 1), `castAt`
- Unique constraint: (proposalId, userId)

**admin_actions** — Admin audit log
- `id` (PK), `userId` → users.id, `communityId` → communities.id (nullable)
- `actionType` — delete_comment | ban_user | override_sortition_timeout | manage_membership | moderate_proposal
- `targetId`, `details` (JSONB), `timestamp`

**jobs** — Async job queue
- `id` (PK, text), `type` — structure_proposal | send_notification | create_sortition | recalculate_score | cleanup_expired
- `payload` (JSONB), `status` — pending | processing | completed | failed
- `priority` — low | normal | high
- `result` (JSONB), `error`, `retryCount`, `maxRetries` (default 3)
- `createdAt`, `startedAt`, `completedAt`

**groups** — User groups (Ομάδες)
- `id` (PK), `name`, `creatorId` → users.id, `createdAt`

**group_members** — Group membership
- `id` (PK), `groupId` → groups.id, `userId` → users.id, `joinedAt`
- Unique constraint: (groupId, userId)

---

## Proposal Lifecycle State Machine

Defined in `shared/proposal-lifecycle.ts`.

### States

| State | Description |
|-------|-------------|
| `draft` | Under author revision |
| `review` | Being validated by LLM |
| `author_review` | Author reviewing amendments |
| `community_signal` | Community voting on rejected amendments |
| `sortition_synthesis` | Sortition body composing final text |
| `voting` | Final ratification vote in progress |
| `decided` | Decision reached (terminal) |
| `archived` | Closed without decision (terminal) |

### Valid Transitions

```
draft → review, archived
review → author_review, draft, archived
author_review → community_signal, archived
community_signal → sortition_synthesis, voting, archived
sortition_synthesis → voting, author_review, archived
voting → decided, archived
decided → (none — terminal)
archived → (none — terminal)
```

### Key Functions

- `canTransitionProposal(from, to)` — Check if transition is valid
- `getNextProposalStates(current)` — Get all valid next states
- `isTerminalProposalState(state)` — Check if state is terminal
- `assertProposalState(value)` — Validate and cast to ProposalState type

---

## API Endpoints

### Authentication (server/auth.ts)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Register new user |
| POST | `/api/auth/login` | — | Login (username/password) |
| POST | `/api/auth/logout` | ✓ | Logout |
| GET | `/api/auth/me` | ✓ | Get current user |
| POST | `/api/auth/google` | — | Google OAuth callback |
| POST | `/api/auth/facebook` | — | Facebook OAuth callback |
| POST | `/api/auth/twitter` | — | Twitter OAuth callback |

### Polls (Legacy System)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/polls` | — | List polls (with filters: status, category, sort, page, pageSize, location, search, communityId) |
| GET | `/api/polls/my` | ✓ | Get user's created polls |
| GET | `/api/polls/participated` | ✓ | Get polls user voted in |
| GET | `/api/polls/:id` | — | Get poll details |
| POST | `/api/polls` | ✓ | Create poll (supports singleChoice, multipleChoice, ordering) |
| PATCH | `/api/polls/:id` | ✓ | Update poll |
| DELETE | `/api/polls/:id` | ✓ | Delete poll |
| PATCH | `/api/polls/:id/community` | ✓ | Assign poll to community |
| PATCH | `/api/polls/:id/extend` | ✓ | Extend poll duration |
| POST | `/api/polls/:id/vote` | ✓ | Cast vote (supports ranking votes) |
| GET | `/api/polls/:id/results` | — | Get poll results |
| POST | `/api/polls/:id/comments` | ✓ | Add comment |
| GET | `/api/polls/:id/comments` | — | Get comments |

### Surveys

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/surveys` | ✓ | Create survey poll |
| GET | `/api/surveys/:id` | — | Get survey details |
| POST | `/api/surveys/:id/respond` | ✓ | Submit survey response |
| GET | `/api/surveys/:id/results` | — | Get survey results |
| PATCH | `/api/surveys/:id` | ✓ | Update survey structure/metadata |

### User Profile

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PATCH | `/api/user/verify-location` | ✓ | Verify user location |
| PATCH | `/api/user/location` | ✓ | Update user location |
| POST | `/api/user/verify-govgr` | ✓ | Verify gov.gr identity (upload PDF) |

### Gov.gr Ballot Voting

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/ballot/token` | ✓ | Get ballot signing token |
| GET | `/api/ballot/instructions` | ✓ | Get ballot signing instructions |
| POST | `/api/ballot/validate` | ✓ | Validate ballot PDF upload |
| GET | `/api/ballot/stats/:pollId` | — | Get ballot voting stats |
| GET | `/api/ballot/health` | — | Ballot system health check |

### Communities

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/communities` | — | List all communities |
| POST | `/api/communities` | ✓ | Create community |
| GET | `/api/communities/:id` | — | Get community details |
| GET | `/api/communities/:id/summary` | — | Get community summary (with member count, proposal count, etc.) |
| PATCH | `/api/communities/:id` | ✓ | Update community settings |
| GET | `/api/communities/:id/members` | — | List community members |
| POST | `/api/communities/:id/members` | ✓ | Add member |
| DELETE | `/api/communities/:id/members` | ✓ | Remove member |
| GET | `/api/communities/:id/democracy-score` | — | Get democracy score |

### Proposals

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/proposals` | — | List all proposals |
| GET | `/api/communities/:communityId/proposals` | — | List proposals for community |
| POST | `/api/communities/:communityId/proposals` | ✓ | Create proposal |
| GET | `/api/proposals/:id` | — | Get proposal details |
| PATCH | `/api/proposals/:id` | ✓ | Update proposal |
| POST | `/api/proposals/:id/submit` | ✓ | Submit proposal for review (draft → review) |
| POST | `/api/proposals/:id/transition` | ✓ | Transition proposal state |
| POST | `/api/proposals/:id/finalize` | ✓ | Finalize proposal (voting → decided) |

### Amendments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/proposals/:id/amendments` | — | List amendments |
| POST | `/api/proposals/:id/amendments` | ✓ | Create amendment |
| POST | `/api/amendments/:id/review` | ✓ | Author review (accept/reject) |
| POST | `/api/amendments/:id/rejection-vote` | ✓ | Vote on rejected amendment |
| GET | `/api/proposals/:id/amendments/duplicates` | — | Find duplicate amendments |
| GET | `/api/proposals/:id/amendments/signals` | — | Get community signals for amendments |

### Debate Arguments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/proposals/:id/arguments` | — | List debate arguments |
| POST | `/api/proposals/:id/arguments` | ✓ | Create argument (for/against) |
| POST | `/api/arguments/:id/support` | ✓ | Support argument |
| POST | `/api/arguments/:id/oppose` | ✓ | Oppose argument |

### Proposal Support

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/proposals/:id/support` | ✓ | Support/oppose proposal |
| GET | `/api/proposals/:id/support` | — | Get support/oppose counts |

### Proposal Voting (Final Ratification)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/proposals/:id/vote` | ✓ | Cast final vote (yes/no/abstain) |
| GET | `/api/proposals/:id/vote-results` | — | Get vote results with quorum check |

### Sortition Bodies

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/communities/:id/sortition` | ✓ | Create sortition body |
| GET | `/api/communities/:id/sortition/preview` | ✓ | Preview sortition candidates |
| GET | `/api/communities/:id/sortition` | ✓ | List sortition bodies for community |
| GET | `/api/sortition/:bodyId` | ✓ | Get sortition body details |
| POST | `/api/sortition/:bodyId/complete` | ✓ | Mark sortition body as completed |
| GET | `/api/sortition/assignments/:id` | ✓ | Get sortition assignment for user |
| POST | `/api/sortition/assignments/:id/score` | ✓ | Submit sortition score |
| POST | `/api/sortition/:bodyId/synthesize` | ✓ | Synthesize final text from sortition |

### Sortition Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/sortition-notifications` | ✓ | List sortition notifications |
| GET | `/api/sortition-notifications/unread-count` | ✓ | Get unread count |
| POST | `/api/sortition-notifications/:id/read` | ✓ | Mark as read |
| POST | `/api/sortition-notifications/mark-all-read` | ✓ | Mark all as read |

### Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/notifications` | ✓ | Get user notifications |
| POST | `/api/notifications/:id/read` | ✓ | Mark notification as read |
| GET | `/api/notifications/unread/count` | ✓ | Get unread count |
| GET | `/api/notification-preferences` | ✓ | Get notification preferences |
| PATCH | `/api/notification-preferences` | ✓ | Update notification preferences |

### Analytics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/analytics/overview` | — | Analytics overview (users, polls, votes, comments) |
| GET | `/api/analytics/poll-popularity` | — | Poll popularity stats |
| GET | `/api/analytics/activity-trends` | — | Activity trends over time |
| GET | `/api/analytics/usage-patterns` | — | Hourly/daily usage patterns |

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/accounts` | Admin | List all users |
| GET | `/api/admin/accounts/:userId/activity` | Admin | Get user activity log |
| POST | `/api/admin/accounts/:userId/ban` | Admin | Ban user |
| POST | `/api/admin/accounts/:userId/approve` | Admin | Approve user |
| POST | `/api/admin/update-poll-locations` | Admin | Update poll locations |

### Utility

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | — | Health check |
| GET | `/api/categories` | — | Get poll categories |
| GET | `/api/og-image/:id` | — | Generate Open Graph image for social sharing |

---

## Storage Layer Interface

The `IStorage` interface in `server/storage.ts` defines 79+ methods. `DatabaseStorage` implements all of them using Drizzle ORM.

### User Methods (10)

- `getUser(id)` — Get user by ID
- `getUserByUsername(username)` — Case-insensitive lookup
- `getUserByEmail(email)` — Case-insensitive lookup
- `getUserByProviderId(providerId, provider)` — OAuth provider lookup
- `getUserByVoterHash(voterHash)` — Gov.gr voter hash lookup
- `createUser(user)` — Create new user
- `updateUserLocation(userId, locationData)` — Update GPS coordinates
- `verifyUserLocation(userId, verified)` — Set location verification flag
- `updateUser(userId, updates)` — General user update
- `deleteUser(userId, deletePolls)` — Delete user (cascades to polls optionally)

### Poll Methods (12)

- `createPoll(poll, options)` — Create poll with options (transactional)
- `getPolls(filters)` — List polls with pagination, search, location filters
- `getUserPolls(userId)` — Get polls created by user
- `getParticipatedPolls(userId)` — Get polls user voted in
- `getPoll(id, userId)` — Get poll with options and user vote status
- `updatePoll(id, updates)` — Update poll
- `extendPollDuration(id, newEndDate)` — Extend poll end date
- `deletePoll(id)` — Delete poll
- `createSurveyPoll(poll, questions, answers)` — Create survey poll (transactional)
- `getSurveyPoll(id, userId)` — Get survey with questions
- `updateSurveyStructure(id, updates, questions, answers)` — Update survey questions
- `updateSurveyMetadata(id, updates)` — Update survey metadata

### Vote Methods (5)

- `createVote(vote)` — Cast vote (supports ranking votes)
- `hasUserVoted(pollId, userId)` — Check if user voted
- `getPollResults(pollId)` — Get poll results with percentages
- `getPollParticipantCount(pollId)` — Get participant count
- `canEditVote(pollId, userId)` — Check if vote can be edited

### Comment Methods (2)

- `createComment(comment)` — Add comment
- `getPollComments(pollId)` — Get comments with user info

### Notification Methods (2)

- `getUserNotifications(userId)` — Get notifications with poll info
- `markNotificationAsRead(notificationId)` — Mark as read

### Analytics Methods (4)

- `getAnalyticsOverview()` — Total users, polls, votes, comments, active polls, popular categories
- `getPollPopularityStats()` — Top polls by votes/comments
- `getActivityTrends()` — Daily activity trends
- `getUsagePatterns()` — Hourly/daily activity patterns

### Device Fingerprinting (5)

- `checkDuplicateAccounts(fingerprint, ip)` — Detect duplicate accounts
- `createAccountActivity(activity)` — Log account activity
- `updateUserLoginInfo(userId, data)` — Update last login IP
- `getUserAccountActivity(userId)` — Get activity log
- `getAllUsersWithAccountInfo(filters)` — Admin user listing
- `updateAccountStatus(userId, status)` — Update account status

### Community Methods (9)

- `createCommunity(community)` — Create community
- `getCommunity(id)` — Get community
- `getCommunities(userId)` — List communities (optionally filtered by user)
- `updateCommunity(id, updates)` — Update community
- `deleteCommunity(id)` — Delete community
- `getCommunityMembers(communityId)` — List members
- `addCommunityMember(communityId, userId, role)` — Add member
- `removeCommunityMember(communityId, userId)` — Remove member
- `updateMemberRole(communityId, userId, role)` — Change role
- `isCommunityMember(communityId, userId)` — Check membership
- `getCommunityMemberRole(communityId, userId)` — Get member role

### Proposal Methods (4)

- `createProposal(proposal)` — Create proposal
- `getProposal(id)` — Get proposal
- `getProposals(communityId, filters)` — List proposals by community
- `updateProposal(id, updates)` — Update proposal

### Amendment Methods (4)

- `createAmendment(amendment)` — Create amendment
- `getAmendment(id)` — Get amendment
- `getAmendments(proposalId)` — List amendments
- `countAmendmentsForProposal(proposalId)` — Count amendments

### Sortition Methods (5)

- `createSortitionBody(body)` — Create sortition body
- `getSortitionBody(id)` — Get sortition body
- `getSortitionMembers(bodyId)` — List members
- `addSortitionMember(bodyId, userId)` — Add member
- `completeSortitionBody(id)` — Mark as completed

### Debate Methods (4)

- `createDebateArgument(argument)` — Create argument
- `getDebateArguments(proposalId)` — List arguments
- `supportDebateArgument(argumentId, userId)` — Support argument
- `opposeDebateArgument(argumentId, userId)` — Oppose argument

### Proposal Support (2)

- `createProposalSupport(proposalId, userId, type)` — Support/oppose proposal
- `getProposalSupport(proposalId, userId)` — Get support/oppose counts

### Proposal Vote Methods (3)

- `castProposalVote(proposalId, userId, choice)` — Cast final vote
- `getUserProposalVote(proposalId, userId)` — Get user's vote
- `getProposalVoteResults(proposalId)` — Get vote results with quorum check

### Session Store

- `sessionStore` — PostgreSQL-backed session store (connect-pg-simple)

---

## Utility Modules

### amendment-merger.ts

Merges accepted amendments into proposal text. Two responsibilities:
1. **Duplicate detection** — Uses Jaccard similarity to find overlapping amendments
2. **Text merging** — Appends accepted improvements to the solution text with type labels

Key functions:
- `findDuplicateAmendments(proposalId, threshold)` — Find duplicate groups
- `mergeAmendments(proposalId)` — Merge accepted amendments into proposal text
- `generateVotingText(merged)` — Generate voting text from merged proposal
- `saveMergedProposal(proposalId)` — Save merged text to database

### amendment-similarity.ts

Pure text-similarity helpers for amendment deduplication.

Key functions:
- `normalizeForSimilarity(text)` — Normalize Greek text (lowercase, remove diacritics, tokenize)
- `jaccardSimilarity(a, b)` — Jaccard similarity between two token sets
- `groupDuplicates(candidates, threshold)` — Group amendments exceeding similarity threshold
- `DEFAULT_SIMILARITY_THRESHOLD` — 0.7 (70% similarity)

### amendment-processor.ts

Handles the author review and community signal workflow for amendments.

Key functions:
- `authorReviewAmendment(amendmentId, decision, reason)` — Author accepts/rejects amendment
- `castRejectionVote(amendmentId, userId, vote)` — Community votes on rejected amendments
- `calculateCommunitySignals(proposalId)` — Calculate upvote/downvote ratios
- `buildSortitionInput(proposalId)` — Build input for sortition body
- `saveFinalText(proposalId, text)` — Save final text from sortition synthesis

### sortition.ts

Random citizen jury selection algorithm.

Key functions:
- `selectSortitionMembers(communityId, size, excludeUserIds)` — Random selection
- Uses community's `sortitionSize` and `sortitionMode` settings

### llm-validation.ts

LLM-based proposal validation using OpenRouter free models.

Key functions:
- `validateProposal(question, solution)` — Score proposal quality (0-100)
- Returns score + feedback text

### job-queue.ts

Async job processing system.

Job types:
- `structure_proposal` — AI-assisted proposal formatting
- `send_notification` — Send user notifications
- `create_sortition` — Create sortition body
- `recalculate_score` — Recalculate democracy score
- `cleanup_expired` — Clean up expired polls/sortitions

### democracy-score.ts

Computes a democracy quality score for communities based on governance model, participation, and transparency metrics.

### ballot-client.ts

Gov.gr ballot PDF validation and verification. Validates PDF signatures, extracts voter hash, prevents duplicate uploads.

### geo-region-detector.ts

Normalizes geographic region names for consistent filtering.

### reverse-geocoding.ts

Nominatim-based reverse geocoding for GPS coordinates. Returns city, region, country with hierarchical IDs.

### notifications.ts

Notification system for community events (new proposals, sortition assignments, etc.).

### proposal-structuring.ts

AI-assisted proposal formatting. Structures raw text into question + solution format.

### sortition-timeout.ts

Handles sortition body timeout detection and state transitions.

---

## Authentication Flow

### Session-Based Auth

Uses `express-session` with PostgreSQL-backed session store (`connect-pg-simple`).

1. User logs in via `/api/auth/login` (username/password)
2. Session created in PostgreSQL
3. Session cookie sent to client
4. `requireAuth` middleware validates session on protected routes
5. `requireAdmin` middleware additionally checks `isAdmin` flag

### OAuth Providers

- Google, Facebook, Twitter OAuth callbacks
- `providerId` + `provider` stored in users table
- `getUserByProviderId()` for OAuth login

### Gov.gr Verification

Greek government identity verification via solemn declaration PDF:

1. User uploads signed PDF to `/api/user/verify-govgr`
2. Server validates PDF signature
3. Extracts voter hash (SHA256 of AFM + salt)
4. Sets `govgrVerified = true`, stores `govgrVoterHash`
5. Verified users can participate in ballot voting

### Ballot Voting

For polls requiring solemn declaration:

1. User requests ballot token via `/api/ballot/token`
2. User signs PDF with Greek government certificate
3. User uploads signed PDF to `/api/ballot/validate`
4. Server validates signature, extracts voter hash
5. Vote recorded in `ballot_votes` table
6. Duplicate detection via `fileHash` (SHA256 of PDF)

---

## Configuration

Environment variables (from `server/config.ts`):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `SESSION_SECRET` | Session encryption secret | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | — |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | — |
| `FACEBOOK_CLIENT_ID` | Facebook OAuth client ID | — |
| `FACEBOOK_CLIENT_SECRET` | Facebook OAuth client secret | — |
| `TWITTER_CLIENT_ID` | Twitter OAuth client ID | — |
| `TWITTER_CLIENT_SECRET` | Twitter OAuth client secret | — |
| `NOMINATIM_URL` | Nominatim reverse geocoding URL | https://nominatim.openstreetmap.org |
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM validation | — |
| `DEMO_MODE` | Enable demo mode with dummy users | true |

### Demo Mode

When `DEMO_MODE=true`, the system creates dummy users with bcrypt hashes that accept any password:
- `dimitris`, `elena`, `giorgos`, `maria`, `kostas`

---

## Job Queue System

Jobs are stored in the `jobs` table and processed asynchronously.

### Job Types

1. **structure_proposal** — AI-assisted formatting of raw proposal text
2. **send_notification** — Send user notifications (community events, sortition assignments)
3. **create_sortition** — Create sortition body for proposal review
4. **recalculate_score** — Recalculate community democracy score
5. **cleanup_expired** — Clean up expired polls and sortition bodies

### Processing

Jobs are processed with retry logic (default 3 retries). Failed jobs store the error message. Priority levels: low, normal, high.

---

## Frontend Integration

The React frontend communicates with the backend via REST API. Key integration points:

- **i18n**: Greek/English language support with runtime locale switching
- **Proposal detail page**: Fetches proposal, amendments, debate arguments, support counts
- **Sortition UI**: Shows assigned sortition bodies, allows scoring
- **Community dashboard**: Shows proposals, members, democracy score
- **Poll creation**: Supports single choice, multiple choice, ranking, and survey types
- **Social sharing**: Open Graph image generation via `/api/og-image/:id`

---

## Testing

Tests are in `tests/` directory. Run with:

```bash
npm test
```

Key test areas:
- Amendment similarity scoring
- Amendment merging logic
- Proposal lifecycle transitions
- Storage layer methods
- Route handlers

---

## Deployment

Docker Compose setup with:
- PostgreSQL 15
- Node.js 20 application
- Reverse proxy (optional)

See `docker-compose.yml` for configuration.
