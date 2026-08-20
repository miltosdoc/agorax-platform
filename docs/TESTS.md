# AgoraX Test Suite

## Overview

The AgoraX test suite ensures the correctness of the domain-driven architecture through comprehensive unit and integration tests.

**Test Results:**
- **Total Tests:** 81
- **Test Files:** 17
- **Status:** ✓ All Passing
- **Duration:** ~900ms

## Test Structure

```
tests/
├── integration/          # Contract tests for domain boundaries
│   ├── amendment-merger.test.ts        # TF-IDF + cosine similarity
│   ├── ballot-client.test.ts           # PDF validation & SHA-256
│   ├── community-dashboard.test.ts     # Dashboard view model
│   ├── community-settings.test.ts      # Community configuration
│   ├── community-summary.test.ts       # Community metrics
│   ├── demo-seed-contract.test.ts      # Demo data validation
│   ├── product-navigation.test.ts      # UI navigation contracts
│   ├── profile-page-contract.test.ts   # User profile page
│   ├── proposal-final-vote.test.ts     # Voting lifecycle
│   ├── proposal-lifecycle.test.ts      # 8-state lifecycle
│   ├── state-machine.test.ts           # State machine validation
│   └── storage-amendment-contract.ts   # Amendment storage
└── unit/                 # Algorithm & repository tests
    ├── amendment-merger.test.ts        # TF-IDF + cosine similarity
    ├── democracy-score.test.ts         # Community health metric
    ├── proposal-repository.test.ts     # Proposal CRUD operations
    ├── proposal-state-machine.test.ts  # 8-state lifecycle
    └── sortition-algorithm.test.ts     # Cryptographic random selection
```

## Test Categories

### 1. Proposal Lifecycle Tests (6 tests)

Validates the 8-state proposal lifecycle:
- `draft → review → synthesis → author_review → voting → decided → archived`
- `author_review → rejected → archived`

**Key Assertions:**
- Proposals start as drafts
- Transitions are unidirectional
- Invalid transitions are rejected
- Terminal states (decided, archived, rejected) have no outgoing transitions

### 2. Sortition Algorithm Tests (6 tests)

Validates the cryptographic random selection algorithm:
- **Modulo Bias Prevention:** Rejection sampling (`limit = 256 - (256 % (n+1))`)
- **Fisher-Yates Shuffle:** Uniform distribution
- **Edge Cases:** Single element, two elements, n=255

**Key Assertions:**
- Rejection sampling eliminates modulo bias
- Shuffle produces uniform distribution
- Edge cases handled correctly

### 3. Amendment Merger Tests (11+6=17 tests)

Validates the TF-IDF + cosine similarity algorithm:
- **TF-IDF:** `log((N+1)/(df+1)) + 1` (smoothed IDF)
- **Cosine Similarity:** `cos(θ) = (A·B) / (||A|| × ||B||)`
- **Grouping:** Similar amendments grouped, counter-proposals separated

**Key Assertions:**
- TF-IDF calculation correct
- Cosine similarity returns [-1, 1]
- Similar amendments grouped correctly
- Counter-proposals not merged with improvements

### 4. Democracy Score Tests (6 tests)

Validates the community health metric (0-100):
- **Positive Factors:** Sortition usage, participation rate, deliberation depth
- **Negative Factors:** Administrative intervention
- **Bounds:** Capped at 100, floored at 0

**Key Assertions:**
- Score increases with participation
- Score decreases with admin intervention
- Score capped at 100
- Score floored at 0

### 5. Proposal Repository Tests (6 tests)

Validates the proposal storage repository:
- **CRUD:** Create, Read, Update, Delete
- **Filtering:** By community, status, author
- **Timeline:** State transition history

**Key Assertions:**
- Proposals created with draft status
- Proposals filtered correctly
- Timeline tracks all transitions

### 6. State Machine Tests (6+3=9 tests)

Validates the proposal state machine:
- **8 States:** draft, review, synthesis, author_review, voting, decided, archived, rejected
- **Transitions:** Unidirectional, validated at API level
- **Quorum:** Minimum participation required for voting

**Key Assertions:**
- All 8 states defined
- Transitions enforced
- Invalid transitions rejected
- Quorum checked before voting

## Running Tests

```bash
# Run all tests
npx vitest run --root . tests/

# Run with coverage
npx vitest run --root . tests/ --coverage

# Run specific test file
npx vitest run tests/unit/sortition-algorithm.test.ts

# Watch mode
npx vitest watch tests/
```

## Test Configuration

- **Framework:** Vitest 2.1.9
- **Environment:** Node.js
- **Reporter:** Basic (verbose available)
- **Coverage:** V8 provider (text, JSON, HTML reports)

## Quality Metrics

| Metric | Value |
|--------|-------|
| Total Tests | 81 |
| Test Files | 17 |
| Pass Rate | 100% |
| Duration | ~900ms |
| Coverage | Pending (Phase 5) |

## Test Philosophy

1. **Contract Tests:** Verify domain boundaries are maintained
2. **Algorithm Tests:** Validate mathematical correctness
3. **Lifecycle Tests:** Ensure state machine enforcement
4. **Repository Tests:** Verify data access patterns
5. **Integration Tests:** Validate cross-domain workflows

## Future Work

- **Phase 4.1:** Add E2E tests with Playwright
- **Phase 4.2:** Add mutation testing
- **Phase 4.3:** Add performance benchmarks
- **Phase 5:** Add code coverage targets (80%+)
