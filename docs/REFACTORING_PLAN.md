# AgoraX Refactoring Plan

**Goal:** Transform the monolithic codebase into a domain-driven, maintainable, production-ready architecture.

**Current State:**
- `storage.ts`: 3,135 lines, 96 methods, 0 comments, 38 console.logs
- `routes.ts`: 2,412 lines, 84 routes, 0 comments, 65 `any` types
- 12 integration tests, 0 E2E tests
- No CI/CD, no Drizzle migrations, no structured logging

---

## Phase 1: Storage Layer Split (Week 1-2)

**Problem:** `storage.ts` is a god class with 96 methods covering 7+ domains.

**Target Structure:**

```
server/storage/
├── index.ts              # IStorage interface (unified, backward-compatible)
├── users.ts              # getUser, createUser, updateUser, deleteUser
├── communities.ts        # getCommunity, createCommunity, getMembers, addMember
├── proposals.ts          # getProposal, createProposal, transitionState, getProposals
├── amendments.ts         # getAmendments, createAmendment, authorReview, rejectionVote
├── sortition.ts          # createBody, getMembers, submitScore, synthesize
├── voting.ts             # castVote, getResults, getSupport, getPollResults
├── debate.ts             # createThread, reply, vote, getThreads
├── notifications.ts      # createNotification, getUnread, markRead
├── platform.ts           # getSettings, updateSetting, getAdminActions
└── legacy.ts             # DatabaseStorage adapter (delegates to domain repos)
```

**Migration Strategy:**
1. Create domain repositories first (each implements a subset of IStorage)
2. Keep `DatabaseStorage` as a facade that delegates to domain repos
3. Routes continue importing from `storage/index.ts` — zero breaking changes
4. Once all routes use domain repos directly, remove the facade

**Quality Gates:**
- Each file < 300 lines
- Every method has a JSDoc comment
- Zero console.logs
- Zero `any` types
- Each repo has its own test file

---

## Phase 2: Routes Split (Week 2-3)

**Problem:** `routes.ts` is 2,412 lines with 84 route handlers in one file.

**Target Structure:**

```
server/routes/
├── index.ts              # registerRoutes() — imports all domain routers
├── auth.ts               # login, register, OAuth, session
├── users.ts              # profile, settings, verification
├── communities.ts        # CRUD, members, settings, merge
├── proposals.ts          # CRUD, state transitions, LLM validation
├── amendments.ts         # create, review, signals, sortition input
├── sortition.ts          # body creation, scoring, synthesis
├── voting.ts             # cast vote, results, support/oppose
├── debate.ts             # threads, replies, votes
├── notifications.ts      # list, mark read, sortition notifications
├── platform.ts           # settings, admin actions, democracy score
├── seo.ts                # social bot detection, OG image generation
└── health.ts             # /health, /api/health endpoints
```

**Pattern per file:**

```typescript
// server/routes/proposals.ts
import type { Router } from 'express';
import { storage } from '../storage';
import { z } from 'zod';

export function registerProposalRoutes(router: Router) {
  router.get('/api/proposals', async (req, res) => { /* ... */ });
  router.get('/api/proposals/:id', async (req, res) => { /* ... */ });
  // ...
}
```

**Migration Strategy:**
1. Extract each domain's routes into its own file
2. `routes/index.ts` imports and calls each `registerXxxRoutes(router)`
3. Remove the monolithic `registerRoutes()` function
4. Add JSDoc to every route handler

**Quality Gates:**
- Each file < 400 lines
- Every route has a JSDoc comment describing purpose, auth requirement, and response shape
- Zero `any` types (replace with proper Zod schemas or typed interfaces)
- Consistent error handling pattern (try/catch with structured error responses)

---

## Phase 3: Documentation (Week 3-4)

**Problem:** Zero comments in the two largest files. No API documentation.

**Deliverables:**

### 3.1 Code Documentation
- JSDoc on every public function in storage/ and routes/
- Module-level comments explaining each file's responsibility
- Complex algorithms (sortition, TF-IDF, democracy score) get detailed comments

### 3.2 API Documentation
- `docs/API.md` — comprehensive endpoint reference
- Format: Method, Path, Auth, Request, Response, Example
- Generated from route JSDoc where possible

### 3.3 Architecture Documentation
- `docs/ARCHITECTURE.md` — updated with new structure
- `docs/STATE_MACHINE.md` — visual diagram of proposal lifecycle
- `docs/DEPLOYMENT.md` — Docker, CI/CD, environment setup

### 3.4 Developer Guide
- `docs/DEVELOPMENT.md` — how to run locally, add features, run tests
- `docs/CONVENTIONS.md` — coding standards, naming, error handling patterns

---

## Phase 4: Testing (Week 4-5)

**Problem:** 12 integration tests, 0 E2E tests.

**Deliverables:**

### 4.1 Unit Tests
- Each domain repository gets unit tests
- Mock the database layer, test business logic
- Target: 80% coverage on storage/ and routes/

### 4.2 E2E Tests (Playwright)
- Install Playwright
- Test the full proposal lifecycle:
  1. Create proposal → LLM validation → author review
  2. Submit amendments → community signal → sortition
  3. Sortition scoring → final text → ratification vote
- Test community creation and settings
- Test auth flows (login, OAuth, demo mode)

### 4.3 CI/CD Pipeline
- GitHub Actions workflow:
  - `lint.yml` — ESLint + TypeScript check on PR
  - `test.yml` — Unit + integration tests on PR
  - `e2e.yml` — Playwright tests on merge to main
  - `build.yml` — Docker build on tag

---

## Phase 5: Production Hardening (Week 5-6)

**Problem:** No rate limiting (beyond login), no monitoring, no structured logging, no backups.

**Deliverables:**

### 5.1 Security
- Rate limiting on all API endpoints (not just login)
- CORS configuration for production domains
- Helmet.js for security headers
- Input validation on all routes (Zod schemas)
- Dependency audit (`npm audit`)

### 5.2 Observability
- Structured logging (pino or winston) with request IDs
- Health check endpoint with dependency status (DB, ballot service)
- Error tracking (Sentry or similar)
- Request metrics middleware (response time, error rate)

### 5.3 Data Protection
- Automated PostgreSQL backups (cron job, daily)
- Migration strategy (Drizzle migrations, currently empty)
- Database connection pooling configuration

### 5.4 Performance
- Response caching for read-heavy endpoints (communities list, proposal list)
- Database query optimization (N+1 detection)
- Static asset compression and CDN configuration

---

## Execution Order

```
Phase 1 (Storage) → Phase 2 (Routes) → Phase 3 (Docs) → Phase 4 (Tests) → Phase 5 (Hardening)
```

**Why this order:**
1. Storage split first — it's the foundation; routes depend on it
2. Routes split second — once storage is clean, routes become trivial to split
3. Docs third — document the new structure while it's fresh
4. Tests fourth — test the refactored code, not the monolith
5. Hardening last — production concerns on stable code

---

## Quality Metrics (Before → After)

| Metric | Before | Target |
|--------|--------|--------|
| storage.ts lines | 3,135 | <300 per file (8 files) |
| routes.ts lines | 2,412 | <400 per file (12 files) |
| Comments | 0 | JSDoc on all public APIs |
| `any` types | 65 | 0 |
| console.logs | 38 | 0 |
| Unit tests | 0 | 80% coverage |
| E2E tests | 0 | Full proposal lifecycle |
| CI/CD | none | GitHub Actions |
| Drizzle migrations | empty | Generated + applied |

---

## Risks & Mitigations

**Risk:** Breaking existing functionality during refactoring.
**Mitigation:** Keep the facade layer (legacy.ts) — routes don't change imports until the end.

**Risk:** Scope creep — "while we're at it, let's also..."
**Mitigation:** Strict phase boundaries. Each phase has a clear definition of done.

**Risk:** Drizzle migrations are empty — schema changes could break the DB.
**Mitigation:** Run `drizzle-kit generate` before any schema modification. Pipe SQL via Docker.

**Risk:** Frontend breaks if API response shapes change.
**Mitigation:** API response shapes stay identical — only internal structure changes.
