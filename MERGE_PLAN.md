# Deliberation Module → AgoraX Merge Plan

## Current State

### AgoraX (What We Have)
- **Stack:** Next.js/React frontend, Express backend, Drizzle ORM, PostgreSQL
- **Schema** (`shared/schema.ts` — 594 lines): `users`, `polls`, `poll_options`, `votes`, `comments`, `groups`, `group_members`, `poll_notifications`, `account_activity`, `ballot_votes`, `poll_questions`, `poll_answers`, `poll_user_responses`
- **Server** (`server/routes.ts` — 1,793 lines): Poll CRUD, survey polls, groups, notifications, analytics, ballot verification (Gov.gr PDF), geofencing, user management
- **Storage** (`server/storage.ts` — 2,615 lines): `IStorage` interface with methods for users, polls, votes, comments, groups, notifications, analytics, account activity
- **Frontend pages:** Home, Auth, Poll Details, My Polls, Poll Create/Extend, Survey Create, Profile, Groups, How It Works, FAQ, Terms, Privacy, Analytics, Admin Accounts
- **Routing:** Wouter-based SPA (`client/src/App.tsx`), TanStack Query for data fetching, i18n via `t()` helper

### Deliberation Module (What We Need)
Source docs: internal design archive — 30+ files covering the full deliberation workflow.

Key concepts from specs:
- **Κοινότητες (Communities):** Autonomous vs. managed, with governance parameters per community
- **Προβούλευμα (Proposal):** Question + solution(s), goes through validation → scoring → amendments → debate → vote
- **LLM Tiered Validation:** Score <20% → return to author, >90% → auto-approve, 20-90% → sortition body decides
- **Κληρωτά Σώματα (Sortition Bodies):** Random citizen selection for evaluation/scoring
- **Αντιπροτάσεις & Βελτιώσεις (Amendments):** Counter-proposals and improvements, author has veto
- **Διάλογος (Debate):** Structured arguments/counter-arguments between proposal authors
- **Παράμετροι Διαβούλευσης (Consultation Parameters):** Per-community settings for deliberation rules

---

## Phase 1: Schema — New Tables

### 1.1 Communities (`communities`)
**File:** `shared/schema.ts`

New table replacing/enhancing the current `groups` concept. Groups become a lightweight alias or are migrated.

```sql
communities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'autonomous',  -- 'autonomous' | 'managed'
  governance_model TEXT DEFAULT 'no_admin',  -- 'no_admin' | 'admin_team' | 'hybrid'
  creator_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Deliberation parameters (per-community config)
  max_concurrent_votes INTEGER DEFAULT -1,  -- -1 = unlimited
  min_participation_pct FLOAT DEFAULT 0,     -- minimum turnout for valid vote
  sortition_size INTEGER DEFAULT 20,        -- default sortition body size
  sortition_mode TEXT DEFAULT 'absolute',   -- 'absolute' | 'percentage'
  sortition_response_hours INTEGER DEFAULT 72,
  
  -- Verification settings
  require_govgr_verification BOOLEAN DEFAULT FALSE,
  
  -- Democracy score (computed, shows how democratic the community is)
  democracy_score FLOAT
)
```

New table for membership:
```sql
community_members (
  id SERIAL PRIMARY KEY,
  community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',  -- 'member' | 'admin' | 'founder'
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(community_id, user_id)
)
```

**Migration path:** Existing `groups` → map to `communities(type='managed')`. `group_members` → `community_members`. Keep `groups` table for backward compatibility during transition, deprecate later.

**Schema changes in `shared/schema.ts`:**
- Add `community_id` column to `users` (default global community) — or use `community_members` as the primary link
- Add `community_id` column to `polls` (replaces `group_id`)
- New tables: `communities`, `community_members`

### 1.2 Proposals (`proposals`)
**File:** `shared/schema.ts`

The core deliberation object — replaces the current "poll creation" flow for structured deliberation.

```sql
proposals (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  
  -- Core content (Προβούλευμα = question + solution)
  question TEXT NOT NULL,       -- Το Ερώτημα
  solution TEXT NOT NULL,       -- Η Απάντηση/Λύση
  
  -- State machine
  status TEXT NOT NULL DEFAULT 'submitted',
  -- 'submitted' → 'validating' → 'valid' | 'returned' | 'rejected'
  --   → 'scoring' → 'under_review' → 'amendments' → 'debate' → 'voting' → 'resolved'
  
  -- LLM validation
  llm_score FLOAT,              -- 0-100 score from LLM validation
  llm_feedback TEXT,            -- Explanation for low scores
  llm_validated_at TIMESTAMP,
  llm_validation_round INTEGER DEFAULT 1,  -- for appeals
  
  -- Sortition scoring
  sortition_avg_score FLOAT,    -- weighted avg from sortition body
  sortition_rank INTEGER,       -- rank among proposals in same cycle
  
  -- Metadata
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

### 1.3 Amendments (`proposal_amendments`)
**File:** `shared/schema.ts`

```sql
proposal_amendments (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  
  type TEXT NOT NULL,  -- 'improvement' (βελτίωση) | 'counter_proposal' (αντιπρόταση)
  
  -- Content
  text TEXT NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending',  -- 'pending' | 'accepted' | 'rejected' | 'under_review'
  author_veto BOOLEAN DEFAULT FALSE,  -- original author vetoed this amendment
  
  -- LLM validation
  llm_score FLOAT,
  
  created_at TIMESTAMP DEFAULT NOW()
)
```

### 1.4 Sortition Bodies (`sortition_bodies`)
**File:** `shared/schema.ts`

```sql
sortition_bodies (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id),
  purpose TEXT NOT NULL,  -- 'validity_check' | 'scoring' | 'conflict_resolution' | 'vote_promotion'
  proposal_id INTEGER REFERENCES proposals(id),  -- NULL if not tied to specific proposal
  
  size INTEGER NOT NULL,           -- target number of members
  response_hours INTEGER DEFAULT 72,
  
  status TEXT DEFAULT 'active',    -- 'selecting' | 'active' | 'completed' | 'timeout'
  
  selected_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
)
```

```sql
sortition_members (
  id SERIAL PRIMARY KEY,
  body_id INTEGER NOT NULL REFERENCES sortition_bodies(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  responded BOOLEAN DEFAULT FALSE,
  score FLOAT,                    -- individual score (0-10 or 0-100)
  scored_at TIMESTAMP,
  UNIQUE(body_id, user_id)
)
```

### 1.5 Debate Arguments (`debate_arguments`)
**File:** `shared/schema.ts`

```sql
debate_arguments (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES proposals(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  
  side TEXT NOT NULL,   -- 'for' | 'against' — for or against this specific proposal
  text TEXT NOT NULL,
  
  -- Support mechanism (likes/dislikes from consultation.md)
  support_count INTEGER DEFAULT 0,
  opposition_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW()
)
```

### 1.6 Proposal Votes (`proposal_votes`)
**File:** `shared/schema.ts`

Separate from `votes` (which are poll votes). These track likes/dislikes/support on proposals during deliberation.

```sql
proposal_support (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES proposals(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,  -- 'support' | 'oppose'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(proposal_id, user_id, type)
)
```

---

## Phase 2: Backend — Storage & Routes

### 2.1 Storage Layer (`server/storage.ts`)

Add to `IStorage` interface:

```typescript
// Community methods
createCommunity(community: InsertCommunity): Promise<Community>;
getCommunity(id: number): Promise<CommunityWithMembers | undefined>;
getUserCommunities(userId: number): Promise<CommunityWithMembers[]>;
addCommunityMember(communityId: number, userId: number, role?: string): Promise<CommunityMember>;

// Proposal methods
createProposal(proposal: InsertProposal): Promise<Proposal>;
getProposals(communityId: number, filters?: ProposalFilters): Promise<Proposal[]>;
getProposal(id: number): Promise<ProposalDetail | undefined>;
updateProposalStatus(id: number, status: string, updates?: Partial<Proposal>): Promise<Proposal>;

// LLM Validation
validateProposalWithLLM(proposalId: number): Promise<{ score: number; feedback: string }>;

// Sortition methods
createSortitionBody(params: CreateSortitionParams): Promise<SortitionBody>;
selectSortitionMembers(bodyId: number, communityId: number, size: number): Promise<void>;
submitSortitionScore(memberId: number, bodyId: number, score: number): Promise<void>;
completeSortitionBody(bodyId: number): Promise<{ avgScore: number; members: number }>;

// Amendment methods
createAmendment(amendment: InsertAmendment): Promise<ProposalAmendment>;
applyAmendment(proposalId: number, amendmentId: number): Promise<void>;
vetoAmendment(amendmentId: number): Promise<void>;

// Debate methods
createDebateArgument(argument: InsertDebateArgument): Promise<DebateArgument>;
getDebateArguments(proposalId: number): Promise<DebateArgument[]>;
```

### 2.2 API Routes (`server/routes.ts`)

New route groups:

**Communities:**
- `POST /api/communities` — create community
- `GET /api/communities` — list user's communities
- `GET /api/communities/:id` — community detail with members
- `PATCH /api/communities/:id` — update parameters
- `POST /api/communities/:id/members` — add member
- `DELETE /api/communities/:id/members/:userId` — remove member

**Proposals:**
- `POST /api/communities/:communityId/proposals` — submit proposal
- `GET /api/communities/:communityId/proposals` — list proposals
- `GET /api/proposals/:id` — proposal detail
- `PATCH /api/proposals/:id/status` — advance state machine (admin/system)

**LLM Validation:**
- `POST /api/proposals/:id/validate` — trigger LLM validation
- `POST /api/proposals/:id/appeal` — appeal LLM decision to sortition

**Sortition:**
- `POST /api/sortition/create` — create sortition body
- `POST /api/sortition/:bodyId/score` — submit score as selected member
- `GET /api/sortition/:bodyId/results` — get results

**Amendments:**
- `POST /api/proposals/:id/amendments` — submit amendment
- `PATCH /api/amendments/:id/apply` — accept amendment
- `PATCH /api/amendments/:id/veto` — author veto

**Debate:**
- `POST /api/proposals/:id/arguments` — submit argument
- `GET /api/proposals/:id/arguments` — list arguments

---

## Phase 3: LLM Validation Service

### 3.1 Implementation
New file: `server/utils/llm-validator.ts`

Logic from specs (`00_Πληρης_Τεκμηριωση.md`, lines 92-97):

```
Input: proposal.question + proposal.solution
Output: { score: 0-100, feedback: string }

Tiers:
  < 20% → status = 'returned', feedback sent to author for revision
  > 90% → status = 'valid', auto-advance to scoring phase
  20-90% → status = 'pending_sortition', create sortition body for human review

Author can appeal any decision → goes to sortition body regardless of score.
```

Prompt design (Greek language, evaluates):
- Relevance to community topic
- Absence of abusive/inappropriate content
- Clarity and coherence
- Defines a specific action/solution

Implementation options:
1. **Ollama local** (PHI-safe, uses existing maintainer infrastructure)
2. **External API** (OpenRouter, Anthropic — configurable per community)
3. **Configurable** via `communities.llm_provider` field

### 3.2 Integration Point
Called from `POST /api/communities/:communityId/proposals` route after proposal creation. Async — proposal status goes to 'validating', LLM runs in background, webhook/callback updates status.

---

## Phase 4: Frontend Pages

### 4.1 Community Dashboard (`/communities/:id`)
**New page:** `client/src/pages/community-dashboard.tsx`

Shows:
- Community info, type, governance model, democracy score
- Active deliberation cycles
- Proposal list (filtered by status)
- Active votes/polls
- Member count, sortition assignments for current user

### 4.2 Proposal Submission (`/communities/:id/proposals/new`)
**New page:** `client/src/pages/proposal-create.tsx`

Form fields:
- Ερώτημα (question) — textarea
- Απάντηση/Λύση (solution) — textarea
- Κατηγορία (category) — select
- Submit → triggers LLM validation → shows status

### 4.3 Proposal Detail (`/proposals/:id`)
**New page:** `client/src/pages/proposal-detail.tsx`

Shows:
- Proposal content, author, status badge
- Current stage in state machine (visual progress bar)
- LLM score + feedback (if validated)
- Sortition scores (if scored)
- Amendments list (accepted/pending/rejected)
- Debate arguments (for/against with support counts)
- Actions: submit amendment, add argument, request vote promotion

### 4.4 Sortition Scoring (`/sortition/:bodyId`)
**New page:** `client/src/pages/sortition-score.tsx`

For users selected in a sortition body:
- Shows the proposal(s) to evaluate
- Scoring interface (0-10 or yes/no depending on purpose)
- Deadline countdown
- Submit score

### 4.5 Navigation Updates
**File:** `client/src/App.tsx` — add new routes
**File:** `client/src/components/layout/bottom-nav.tsx` — add "Communities" tab

---

## Phase 5: State Machine & Workflow

### Proposal Lifecycle

```
submitted → validating → [LLM decision]
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼                 ▼
                 returned         valid          pending_sortition
                    │               │                     │
                    │               ▼                     ▼
                    │          scoring              sortition review
                    │               │                     │
                    │               ▼                     ▼
                    │         under_review ←────── completed (merged paths)
                    │               │
                    │               ▼
                    │           amendments
                    │               │
                    │               ▼
                    │            debate
                    │               │
                    │               ▼
                    │           voting → resolved
```

### State Machine Implementation
New file: `server/utils/proposal-state-machine.ts`

Functions:
- `canTransition(proposal, from, to)` — validates transitions
- `advanceProposal(proposalId, targetStatus)` — moves state, triggers side effects
- Side effects per transition:
  - `submitted → validating`: trigger LLM validation job
  - `validating → valid/scoring`: create sortition body for scoring
  - `under_review → amendments`: open amendment window
  - `amendments → debate`: open debate phase
  - `debate → voting`: create poll from proposal options

---

## Implementation Order

1. ~~**Schema changes** (`shared/schema.ts`) — all new tables + relations~~ ✅ DONE
2. ~~**Drizzle migration** (`drizzle-kit generate` + `migrate`)~~ ✅ DONE — `migrations/0000_daffy_invisible_woman.sql`
3. **Storage interface** (`server/storage.ts`) — add methods to IStorage + implement in PostgresStorage
4. **Backend routes** (`server/routes.ts`) — communities, proposals, sortition, amendments, debate
5. **LLM validator** (`server/utils/llm-validator.ts`) — tiered validation logic
6. **State machine** (`server/utils/proposal-state-machine.ts`) — proposal lifecycle
7. **Frontend pages** — community dashboard, proposal create/detail, sortition scoring
8. **Navigation & routing** — wire up new pages in App.tsx and bottom-nav

---

## Backward Compatibility

- Existing `groups` table stays functional during transition
- Existing `polls` continue to work independently of the proposal system
- New `communities` can reference existing polls via a migration that sets `polls.community_id = polls.group_id → mapped community`
- `group_id` on polls is deprecated but not removed until migration complete

---

## Open Questions (from the deliberation specs)

1. **Similar proposal merging:** AI vs. author communication? — Start with AI detection, author confirms
2. **Should scorers know about similar proposals?** — Yes, via smart search in sortition UI
3. **Like/dislike during live debate?** — Supported via `proposal_support` table
4. **Communities with <100 members?** — Minimum threshold configurable per community
5. **Vote or discussion-only mode?** — Configurable via community parameters
