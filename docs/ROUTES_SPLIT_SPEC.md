# Routes Layer Refactoring — Detailed Spec

## Current State

`server/routes.ts`: 2,412 lines, 84 route handlers, 0 comments, 65 `any` types.

**Route categories identified:**
- Auth: ~8 routes (login, register, OAuth, session, logout)
- Users: ~6 routes (profile, settings, verification, delete)
- Communities: ~12 routes (CRUD, members, settings, merge, dashboard)
- Proposals: ~15 routes (CRUD, state transitions, LLM validation, support)
- Amendments: ~8 routes (create, review, signals, sortition input)
- Sortition: ~10 routes (body creation, scoring, synthesis, assignments)
- Voting: ~8 routes (cast vote, results, support/oppose, poll results)
- Debate: ~4 routes (threads, replies, votes, stats)
- Notifications: ~4 routes (list, mark read, sortition notifications)
- Platform: ~3 routes (settings, admin actions, democracy score)
- SEO: ~2 routes (social bot detection, OG image)
- Health: ~1 route (/health)

---

## Target Architecture

```
server/routes/
├── index.ts              # registerRoutes(app) — imports all domain routers
├── auth.ts               # Login, register, OAuth, session management
├── users.ts              # Profile, settings, verification, account deletion
├── communities.ts        # Community CRUD, members, settings, merge
├── proposals.ts          # Proposal CRUD, state transitions, LLM validation
├── amendments.ts         # Amendment creation, review, signals
├── sortition.ts          # Body creation, scoring, synthesis, assignments
├── voting.ts             # Proposal votes, poll votes, results
├── debate.ts             # Threads, replies, votes, stats
├── notifications.ts      # User notifications, sortition notifications
├── platform.ts           # Settings, admin actions, democracy score
├── seo.ts                # Social bot detection, OG image generation
└── health.ts             # Health check endpoint
```

---

## File-by-File Spec

### `routes/index.ts`

```typescript
/**
 * Route Registration
 *
 * Central entry point for all API routes.
 * Each domain router is imported and registered with Express.
 */

import type { Express } from 'express';
import { createServer, type Server } from 'http';
import { setupAuth } from '../auth';

// Domain routers
import { registerAuthRoutes } from './auth';
import { registerUserRoutes } from './users';
import { registerCommunityRoutes } from './communities';
import { registerProposalRoutes } from './proposals';
import { registerAmendmentRoutes } from './amendments';
import { registerSortitionRoutes } from './sortition';
import { registerVotingRoutes } from './voting';
import { registerDebateRoutes } from './debate';
import { registerNotificationRoutes } from './notifications';
import { registerPlatformRoutes } from './platform';
import { registerSeoRoutes } from './seo';
import { registerHealthRoutes } from './health';

/**
 * Register all API routes with the Express application.
 * @param app - Express application instance
 * @returns HTTP server instance
 */
export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication middleware
  setupAuth(app);

  // Register domain routers
  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerCommunityRoutes(app);
  registerProposalRoutes(app);
  registerAmendmentRoutes(app);
  registerSortitionRoutes(app);
  registerVotingRoutes(app);
  registerDebateRoutes(app);
  registerNotificationRoutes(app);
  registerPlatformRoutes(app);
  registerSeoRoutes(app);
  registerHealthRoutes(app);

  // Create and return HTTP server
  return createServer(app);
}
```

### `routes/auth.ts`

```typescript
/**
 * Authentication Routes
 *
 * Handles user authentication:
 * - Local login (email/password)
 * - Google OAuth
 * - Gov.gr verification
 * - Session management
 * - Demo mode bypass
 */

import type { Express } from 'express';
import { storage } from '../storage';
import { z } from 'zod';

// Login schema
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Register authentication routes.
 * @param app - Express application instance
 */
export function registerAuthRoutes(app: Express) {
  /**
   * POST /api/auth/login
   * @auth public
   * @body { email: string, password: string }
   * @returns { user: User, token: string }
   */
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      // ... authentication logic
    } catch (error) {
      // ... error handling
    }
  });

  // ... other auth routes
}
```

### `routes/users.ts`

```typescript
/**
 * User Routes
 *
 * Handles user profile and settings:
 * - Get/update profile
 * - Location verification
 * - Gov.gr verification
 * - Account deletion
 * - Activity tracking
 */

// Routes:
// - GET /api/users/me — Get current user profile
// - PUT /api/users/me — Update current user profile
// - POST /api/users/me/location — Verify user location
// - POST /api/users/me/verify-govgr — Gov.gr verification
// - DELETE /api/users/me — Delete account
// - GET /api/users/me/activity — Get user activity
```

### `routes/communities.ts`

```typescript
/**
 * Community Routes
 *
 * Handles community management:
 * - Create, read, update communities
 * - Member management (add, remove, list)
 * - Community settings and governance
 * - Community dashboard and statistics
 * - Community merging
 */

// Routes:
// - GET /api/communities — List all communities
// - POST /api/communities — Create new community
// - GET /api/communities/:id — Get community details
// - PUT /api/communities/:id — Update community
// - GET /api/communities/:id/members — List members
// - POST /api/communities/:id/members — Add member
// - DELETE /api/communities/:id/members/:userId — Remove member
// - GET /api/communities/:id/settings — Get settings
// - PUT /api/communities/:id/settings — Update settings
// - GET /api/communities/:id/dashboard — Community dashboard
// - POST /api/communities/:id/merge — Merge with another community
// - GET /api/communities/:id/score — Democracy score
```

### `routes/proposals.ts`

```typescript
/**
 * Proposal Routes
 *
 * Handles proposal lifecycle:
 * - Create, read, update proposals
 * - State transitions (with validation)
 * - LLM validation and scoring
 * - Support/oppose voting
 * - Category management
 */

// Routes:
// - GET /api/proposals — List proposals (with filters)
// - POST /api/proposals — Create new proposal
// - GET /api/proposals/:id — Get proposal details
// - PUT /api/proposals/:id — Update proposal (draft only)
// - POST /api/proposals/:id/transition — Transition state
// - POST /api/proposals/:id/validate — Trigger LLM validation
// - GET /api/proposals/:id/validation — Get validation result
// - POST /api/proposals/:id/support — Cast support/oppose vote
// - GET /api/proposals/:id/support — Get support counts
// - POST /api/proposals/:id/final-text — Save final text (sortition)
// - GET /api/proposals/:id/category — Get category
// - PUT /api/proposals/:id/category — Update category
```

### `routes/amendments.ts`

```typescript
/**
 * Amendment Routes
 *
 * Handles amendment workflow:
 * - Create amendments on proposals
 * - Author review (accept/reject)
 * - Community signal (rejection votes)
 * - Signal calculation and flagging
 * - Sortition input preparation
 */

// Routes:
// - GET /api/proposals/:id/amendments — List amendments
// - POST /api/proposals/:id/amendments — Create amendment
// - POST /api/amendments/:id/review — Author review
// - POST /api/amendments/:id/rejection-vote — Community signal
// - GET /api/proposals/:id/amendments/signals — Calculate signals
// - GET /api/proposals/:id/sortition-input — Prepare sortition input
// - POST /api/proposals/:id/amendments/dedup — Find duplicates
// - GET /api/proposals/:id/amendments/merged — Get merged proposal
```

### `routes/sortition.ts`

```typescript
/**
 * Sortition Routes
 *
 * Handles sortition body lifecycle:
 * - Create sortition bodies (random selection)
 * - Member management and eligibility
 * - Score submission and synthesis
 * - Timeout handling and replacement
 * - Assignment tracking
 */

// Routes:
// - POST /api/communities/:id/sortition — Create sortition body
// - GET /api/communities/:id/sortition/preview — Preview selection
// - GET /api/communities/:id/sortition — List all bodies
// - GET /api/sortition/:bodyId — Get body details
// - POST /api/sortition/:bodyId/complete — Complete body
// - POST /api/sortition/:bodyId/synthesize — Aggregate scores
// - GET /api/sortition/assignments/:id — Get assignment details
// - POST /api/sortition/assignments/:id/score — Submit score
// - GET /api/sortition/:bodyId/members — List members
// - GET /api/sortition/:bodyId/attendance — Get attendance
```

### `routes/voting.ts`

```typescript
/**
 * Voting Routes
 *
 * Handles voting operations:
 * - Proposal support/oppose votes
 * - Poll voting (yes/no, ranking, multiple choice, survey)
 * - Vote results and statistics
 * - User response tracking
 */

// Routes:
// - POST /api/proposals/:id/vote — Cast proposal vote
// - GET /api/proposals/:id/votes — Get vote results
// - POST /api/polls/:id/vote — Cast poll vote
// - GET /api/polls/:id/results — Get poll results
// - GET /api/polls/:id/user-response — Get user response
// - POST /api/polls/:id/survey — Submit survey response
// - GET /api/users/:id/responses — Get user voting history
// - DELETE /api/polls/:id/votes/:voteId — Remove vote (if allowed)
```

### `routes/debate.ts`

```typescript
/**
 * Debate Routes
 *
 * Handles debate threads:
 * - Create threads on proposals
 * - Reply to threads (nested)
 * - Vote on arguments (up/down)
 * - Get threads sorted by score
 */

// Routes:
// - POST /api/proposals/:id/debate — Create debate thread
// - GET /api/proposals/:id/debate — List threads
// - POST /api/debate/:id/reply — Reply to thread
// - POST /api/debate/:id/vote — Vote on argument
// - GET /api/proposals/:id/debate/stats — Get debate statistics
```

### `routes/notifications.ts`

```typescript
/**
 * Notification Routes
 *
 * Handles user notifications:
 * - Create notifications (system-generated)
 * - Get unread notifications
 * - Mark as read (single or bulk)
 * - Sortition-specific notifications
 */

// Routes:
// - GET /api/notifications — Get user notifications
// - POST /api/notifications/:id/read — Mark as read
// - POST /api/notifications/read-all — Mark all as read
// - GET /api/sortition-notifications — Get sortition notifications
// - POST /api/sortition-notifications/:id/read — Mark sortition as read
// - POST /api/sortition-notifications/read-all — Mark all sortition as read
```

### `routes/platform.ts`

```typescript
/**
 * Platform Routes
 *
 * Handles platform-wide operations:
 * - Platform settings (key/value)
 * - Admin action logging
 * - Democracy score calculation
 * - Usage statistics and trends
 */

// Routes:
// - GET /api/platform/settings — Get platform settings
// - PUT /api/platform/settings — Update platform settings
// - GET /api/platform/admin-actions — Get admin actions log
// - GET /api/communities/:id/score — Calculate democracy score
// - GET /api/communities/:id/trends — Get activity trends
// - GET /api/communities/:id/usage — Get usage patterns
```

### `routes/seo.ts`

```typescript
/**
 * SEO Routes
 *
 * Handles social media integration:
 * - Social bot detection and preview generation
 * - Open Graph image generation
 * - Meta tag optimization
 */

// Routes:
// - GET /polls/:id — Social bot detection (returns OG HTML)
// - GET /api/og-image/:id — Generate OG image
```

### `routes/health.ts`

```typescript
/**
 * Health Check Routes
 *
 * Handles system health monitoring:
 * - Basic health check
 * - Dependency status (DB, ballot service)
 * - Performance metrics
 */

// Routes:
// - GET /health — Basic health check
// - GET /api/health — Detailed health check with dependencies
```

---

## Route Handler Pattern

Every route handler follows this pattern:

```typescript
/**
 * GET /api/proposals/:id
 * @auth required
 * @description Get proposal details by ID
 * @param id - Proposal ID from URL parameter
 * @returns Proposal object with author and community info
 */
app.get('/api/proposals/:id', async (req, res) => {
  try {
    const proposalId = parseInt(req.params.id, 10);
    if (isNaN(proposalId)) {
      return res.status(400).json({ error: 'Invalid proposal ID' });
    }

    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    res.json(proposal);
  } catch (error) {
    console.error(`Error in GET /api/proposals/:id: ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**Key requirements:**
1. JSDoc comment with method, path, auth requirement, description, params, returns
2. Input validation (Zod schemas for request body)
3. Proper error handling (try/catch with meaningful error messages)
4. Consistent response format (`res.json()` for success, `res.status().json()` for errors)
5. No `any` types — use proper TypeScript types or Zod schemas

---

## Migration Steps

### Step 1: Create Route Files
1. Create `server/routes/` directory
2. Create each domain route file with its handlers
3. Each file exports a `registerXxxRoutes(app)` function
4. Add JSDoc to every route handler

### Step 2: Create Index File
1. Create `routes/index.ts` with `registerRoutes()` function
2. Import and call all domain routers
3. Keep `setupAuth(app)` call at the beginning

### Step 3: Replace Monolith
1. Delete `server/routes.ts`
2. Update `server/index.ts` to import from `./routes/index`
3. Verify: `npx tsc --noEmit` passes

### Step 4: Clean Up
1. Remove `any` types (replace with proper types or Zod schemas)
2. Remove `console.log` statements (replace with structured logging)
3. Add consistent error handling pattern
4. Verify all routes work (manual testing + E2E tests)

---

## Quality Checklist per File

- [ ] JSDoc on every route handler
- [ ] Module-level comment explaining responsibility
- [ ] Zero `any` types
- [ ] Zero `console.log` statements
- [ ] Consistent error handling (try/catch with structured errors)
- [ ] Input validation (Zod schemas for request body)
- [ ] File < 400 lines
- [ ] Integration tests covering all routes
