# AgoraX API Documentation

## Architecture Overview

```
server/
├── routers/          # 12 domain routers (HTTP layer)
│   ├── proposals.ts      # Proposal lifecycle management
│   ├── amendments.ts     # Amendment submission & merging
│   ├── sortition.ts      # Citizen jury selection
│   ├── voting.ts         # Ballot casting & counting
│   ├── debate.ts         # Threaded discussion
│   ├── communities.ts    # Community governance
│   ├── users.ts          # Auth, profiles, gov.gr verification
│   ├── notifications.ts  # Push notifications
│   ├── analytics.ts      # Democracy score, participation metrics
│   ├── platform.ts       # Platform-wide settings
│   ├── ballot.ts         # PDF ballot upload & validation
│   └── admin.ts          # Admin actions & audit log
├── storage/            # 9 domain repositories + facade
│   ├── proposals.ts      # Proposal CRUD + state transitions
│   ├── amendments.ts     # Amendment storage
│   ├── sortition.ts      # Jury selection & scoring
│   ├── voting.ts         # Polls, votes, ballots
│   ├── debate.ts         # Comments & threads
│   ├── communities.ts    # Community config & membership
│   ├── users.ts          # User profiles & auth
│   ├── notifications.ts  # Notification storage
│   ├── platform.ts       # Platform settings
│   └── legacy.ts         # Facade (backward compat)
├── utils/              # 20 utility modules
│   ├── proposal-state-machine.ts  # 8-state lifecycle
│   ├── amendment-merger.ts        # TF-IDF + cosine similarity
│   ├── sortition.ts               # Cryptographic random selection
│   ├── democracy-score.ts         # Community health metric
│   └── ... (15 more)
└── index.ts            # Express app entry point
```

## Router Endpoints

### Proposals Router (`/api/proposals`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/proposals` | ✓ | List proposals (filterable by community, status) |
| GET | `/api/proposals/:id` | ✓ | Get proposal details |
| POST | `/api/proposals` | ✓ | Create new proposal |
| PUT | `/api/proposals/:id` | ✓ | Update proposal (author only) |
| DELETE | `/api/proposals/:id` | ✓ | Delete proposal (author/admin) |
| POST | `/api/proposals/:id/support` | ✓ | Support/oppose a proposal |
| GET | `/api/proposals/:id/support` | ✓ | Get support counts |
| POST | `/api/proposals/:id/transition` | ✓ | Transition proposal state |
| GET | `/api/proposals/:id/timeline` | ✓ | Get proposal state history |

### Amendments Router (`/api/amendments`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/amendments/:proposalId` | ✓ | List amendments for proposal |
| POST | `/api/amendments` | ✓ | Submit amendment |
| PUT | `/api/amendments/:id` | ✓ | Update amendment |
| DELETE | `/api/amendments/:id` | ✓ | Delete amendment |
| POST | `/api/amendments/:id/merge` | ✓ | Merge similar amendments |
| GET | `/api/amendments/:id/similarity` | ✓ | Get similarity groups |

### Sortition Router (`/api/sortition`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/sortition/:proposalId/select` | ✓ | Select citizen jury |
| GET | `/api/sortition/:proposalId/body` | ✓ | Get jury composition |
| POST | `/api/sortition/:proposalId/score` | ✓ | Submit jury score |
| GET | `/api/sortition/:proposalId/results` | ✓ | Get scoring results |
| GET | `/api/sortition/membership` | ✓ | Check if user is on jury |

### Voting Router (`/api/voting`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/voting/polls` | ✓ | Create poll |
| GET | `/api/voting/polls/:id` | ✓ | Get poll details |
| POST | `/api/voting/polls/:id/vote` | ✓ | Cast vote |
| GET | `/api/voting/polls/:id/results` | ✓ | Get poll results |
| GET | `/api/voting/user` | ✓ | Get user's votes |

### Debate Router (`/api/debate`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/debate/:proposalId` | ✓ | List debate comments |
| POST | `/api/debate/:proposalId` | ✓ | Add comment |
| PUT | `/api/debate/:id` | ✓ | Edit comment |
| DELETE | `/api/debate/:id` | ✓ | Delete comment |
| POST | `/api/debate/:id/reply` | ✓ | Reply to comment |

### Communities Router (`/api/communities`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/communities` | ✓ | List communities |
| GET | `/api/communities/:id` | ✓ | Get community details |
| POST | `/api/communities` | ✓ | Create community |
| PUT | `/api/communities/:id` | ✓ | Update community |
| POST | `/api/communities/:id/join` | ✓ | Join community |
| POST | `/api/communities/:id/leave` | ✓ | Leave community |
| GET | `/api/communities/:id/members` | ✓ | List members |
| PUT | `/api/communities/:id/members/:userId` | ✓ | Update member role |

### Users Router (`/api/users`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/users/register` | ✗ | Register new user |
| POST | `/api/users/login` | ✗ | Login (JWT) |
| GET | `/api/users/profile` | ✓ | Get user profile |
| PUT | `/api/users/profile` | ✓ | Update profile |
| POST | `/api/users/verify-govgr` | ✓ | Verify gov.gr identity |
| POST | `/api/users/verify-location` | ✓ | Verify location |

### Notifications Router (`/api/notifications`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/notifications` | ✓ | List user notifications |
| PUT | `/api/notifications/:id/read` | ✓ | Mark as read |
| DELETE | `/api/notifications/:id` | ✓ | Delete notification |

### Analytics Router (`/api/analytics`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/analytics/community/:id` | ✓ | Community analytics |
| GET | `/api/analytics/democracy-score/:id` | ✓ | Democracy score |
| GET | `/api/analytics/participation/:id` | ✓ | Participation metrics |

### Platform Router (`/api/platform`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/platform/settings` | ✓ | Get platform settings |
| PUT | `/api/platform/settings` | ✓ | Update settings (admin) |

### Admin Router (`/api/admin`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/actions` | ✓ | Audit log |
| POST | `/api/admin/ban` | ✓ | Ban user |
| POST | `/api/admin/unban` | ✓ | Unban user |
| GET | `/api/admin/stats` | ✓ | Platform statistics |

## Proposal Lifecycle (8 States)

```
draft → review → synthesis → author_review → voting → decided → archived
                                    ↓
                                 rejected
```

Transitions are enforced by `proposal-state-machine.ts` with mathematical validation at each step.

## Sortition Algorithm

1. **Eligibility**: 7-day minimum membership, not currently serving
2. **Random Selection**: `crypto.getRandomValues()` + Fisher-Yates shuffle
3. **Modulo Bias Prevention**: Rejection sampling (`limit = 256 - (256 % (n+1))`)
4. **Anti-Concentration**: Max 1 panel per user, temporal exclusion

## Amendment Similarity

- **TF-IDF**: `log((N+1)/(df+1)) + 1` (smoothed IDF)
- **Cosine Similarity**: `cos(θ) = (A·B) / (||A|| × ||B||)`
- **Counter-Proposal Detection**: Semantic analysis distinguishes improvements from counter-proposals
- **Author Veto**: Author retains veto power; rejected amendments trigger community vote

## Democracy Score (0-100)

Composite metric based on:
- Sortition usage frequency (+)
- Participation rate (+)
- Deliberation depth (+)
- Administrative intervention (-)
- Proposal completion rate (+)
