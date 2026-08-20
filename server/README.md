# AgoraX Backend

Domain-driven Express.js backend for the AgoraX deliberative democracy platform.

## Architecture

The backend follows a strict domain-driven design with 11 independent domains:

| Domain | Router | Storage | Utils |
|--------|--------|---------|-------|
| Proposals | `routers/proposals.ts` | `storage/proposals.ts` | `proposal-state-machine.ts`, `proposal-structuring.ts` |
| Amendments | `routers/amendments.ts` | `storage/amendments.ts` | `amendment-merger.ts`, `amendment-similarity.ts` |
| Sortition | `routers/sortition.ts` | `storage/sortition.ts` | `sortition.ts`, `sortition-timeout.ts` |
| Voting | (part of proposals) | `storage/voting.ts` | `ballot-client.ts` |
| Debate | `routers/debate.ts` | `storage/debate.ts` | `debate.ts` |
| Communities | `routers/communities.ts` | `storage/communities.ts` | `community-manager.ts` |
| Users | `routers/users.ts` | `storage/users.ts` | `location-validator.ts`, `geo-region-detector.ts` |
| Notifications | `routers/notifications.ts` | `storage/notifications.ts` | `notifications.ts` |
| Analytics | `routers/analytics.ts` | (none) | `democracy-score.ts` |
| Platform | `routers/platform.ts` | `storage/platform.ts` | (none) |
| Admin | `routers/admin.ts` | (none) | `admin-action-logger.ts` |

## Getting Started

```bash
# Install dependencies
npm install

# Run database migrations
npx drizzle-kit push

# Start development server
npm run dev

# Run tests
npm test
```

## Module Boundaries

Each domain router can only import from:
- Its own storage repository
- Its designated utility modules
- Shared infrastructure (`auth.ts`, `db.ts`, `storage.ts`, etc.)

Enforce boundaries:
```bash
node scripts/check-modularity.cjs
```

## Proposal Lifecycle

Proposals traverse an 8-state lifecycle:

```
draft → review → synthesis → author_review → voting → decided → archived
                                    ↓
                                 rejected
```

Transitions are enforced by `proposal-state-machine.ts` with mathematical validation.

## Sortition Algorithm

1. **Eligibility**: 7-day minimum membership, not currently serving
2. **Random Selection**: `crypto.getRandomValues()` + Fisher-Yates shuffle
3. **Modulo Bias Prevention**: Rejection sampling
4. **Anti-Concentration**: Max 1 panel per user, temporal exclusion

## Amendment Similarity

- **TF-IDF**: `log((N+1)/(df+1)) + 1` (smoothed IDF)
- **Cosine Similarity**: `cos(θ) = (A·B) / (||A|| × ||B||)`
- **Counter-Proposal Detection**: Semantic analysis distinguishes improvements from counter-proposals

## Democracy Score

Composite metric (0-100) based on:
- Sortition usage frequency (+)
- Participation rate (+)
- Deliberation depth (+)
- Administrative intervention (-)
- Proposal completion rate (+)

## Testing

```bash
# Type check
npx tsc --noEmit

# Module boundaries
node scripts/check-modularity.cjs

# Run tests (when available)
npm test
```

## Documentation

- [API Documentation](docs/API.md)
- [Architecture Documentation](docs/ARCHITECTURE.md)
- [Refactoring Plan](docs/REFACTORING_PLAN.md)
- [Storage Split Spec](docs/STORAGE_SPLIT_SPEC.md)
- [Routes Split Spec](docs/ROUTES_SPLIT_SPEC.md)
