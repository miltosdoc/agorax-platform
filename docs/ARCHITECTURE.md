# AgoraX Architecture Documentation

## Domain-Driven Architecture

The AgoraX backend follows a strict domain-driven design with clear module boundaries. Each domain owns its router, storage repository, and utility modules.

## Module Boundaries

```
server/
├── routers/          # HTTP layer (12 domain routers)
│   ├── proposals.ts      → storage/proposals.ts → utils/proposal-state-machine.ts
│   ├── amendments.ts     → storage/amendments.ts → utils/amendment-merger.ts
│   ├── sortition.ts      → storage/sortition.ts → utils/sortition.ts
│   ├── voting.ts         → storage/voting.ts → utils/ballot-client.ts
│   ├── debate.ts         → storage/debate.ts → utils/debate.ts
│   ├── communities.ts    → storage/communities.ts → utils/community-manager.ts
│   ├── users.ts          → storage/users.ts → utils/location-validator.ts
│   ├── notifications.ts  → storage/notifications.ts → utils/notifications.ts
│   ├── analytics.ts      → (no storage) → utils/democracy-score.ts
│   ├── platform.ts       → storage/platform.ts
│   ├── admin.ts          → (no storage) → utils/admin-action-logger.ts
│   └── ballot.ts         → (no storage) → utils/ballot-client.ts
├── storage/            # Data layer (9 domain repos + facade)
│   ├── proposals.ts      # Proposal CRUD + state transitions
│   ├── amendments.ts     # Amendment storage
│   ├── sortition.ts      # Jury selection & scoring
│   ├── voting.ts         # Polls, votes, ballots
│   ├── debate.ts         # Comments & threads
│   ├── communities.ts    # Community config & membership
│   ├── users.ts          # User profiles & auth
│   ├── notifications.ts  # Notification storage
│   ├── platform.ts       # Platform settings
│   └── legacy.ts         # Facade (backward compat during migration)
├── utils/              # Business logic (20 utility modules)
│   ├── proposal-state-machine.ts  # 8-state lifecycle enforcement
│   ├── amendment-merger.ts        # TF-IDF + cosine similarity
│   ├── sortition.ts               # Cryptographic random selection
│   ├── democracy-score.ts         # Community health metric
│   ├── ballot-client.ts           # PDF validation & SHA-256 dedup
│   ├── llm-validation.ts          # AI-powered proposal validation
│   ├── job-queue.ts               # Background job scheduler
│   └── ... (13 more)
└── index.ts            # Express app entry point
```

## Shared Infrastructure

The following modules are shared across all domains:

- **auth.ts**: JWT authentication middleware
- **storage.ts**: Legacy facade (temporary, for backward compatibility)
- **db.ts**: Drizzle ORM database connection
- **schema.ts**: Database schema definitions
- **types.ts**: TypeScript type definitions
- **job-queue.ts**: Background job scheduler
- **job-handlers.ts**: Job handler implementations
- **llm-validation.ts**: LLM-powered validation
- **osm-seed.ts**: OpenStreetMap data seeding

## Module Boundary Rules

1. **Each router imports only from its own storage repository**
2. **Each router imports only from its designated utility modules**
3. **Shared infrastructure modules are allowed for all domains**
4. **Cross-domain imports are prohibited** (enforced by `scripts/check-modularity.cjs`)

## Enforcing Boundaries

Run the modularity check:
```bash
node scripts/check-modularity.cjs
```

This script verifies that each domain router only imports from:
- Its own storage repository
- Its designated utility modules
- Shared infrastructure modules

## Migration Strategy

During the migration from the monolithic architecture:

1. **Phase 1**: Storage split (✓ Complete)
   - Split `storage.ts` (3,135 lines) into 9 domain repositories
   - Created legacy facade for backward compatibility

2. **Phase 2**: Routes split (✓ Complete)
   - Split `routes.ts` (2,412 lines) into 12 domain routers
   - Each router imports from its own storage repository

3. **Phase 3**: Documentation (✓ Complete)
   - API documentation
   - Architecture documentation
   - Module boundary enforcement

4. **Phase 4**: Tests (Pending)
   - E2E tests for proposal lifecycle
   - Unit tests for domain repositories
   - Integration tests for cross-domain workflows

5. **Phase 5**: Hardening (Pending)
   - Remove legacy facade
   - Enforce strict TypeScript config
   - Add CI/CD pipeline
   - Performance optimization

## Quality Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| routes.ts lines | 2,412 | 67 | 97% reduction |
| storage.ts lines | 3,135 | 455 (facade) | 85% reduction |
| Router files | 1 | 12 | 12x modularity |
| Storage files | 1 | 9 | 9x modularity |
| Avg router size | 2,412 | 166 | 93% reduction |
| Avg storage size | 3,135 | 156 | 95% reduction |

## Testing the Architecture

```bash
# Check TypeScript compilation
npx tsc --noEmit

# Check module boundaries
node scripts/check-modularity.cjs

# Run tests (when available)
npm test
```

## Future Work

- **Phase 4**: Add comprehensive test coverage
- **Phase 5**: Remove legacy facade and enforce strict domain boundaries
- **Phase 6**: Add GraphQL API layer
- **Phase 7**: Implement event sourcing for audit trail
