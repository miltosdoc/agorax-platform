# AgoraX — Project Roadmap

**Last updated:** 2026-04-28 (Phase 6a complete)

---

## Completed

### Phase 1: Foundation (TS burndown, storage audit, proposal_votes)
- TypeScript errors → 0
- Storage method audit — all 79+ methods verified
- `proposal_votes` table wired
- Seed alignment with 8-state lifecycle
- Dead code removal

### Phase 2: Coherence Layer
- Sortition system — selection, scoring, timeout, replacement, completion
- Amendment system — TF-IDF + cosine similarity for deduplication
- LLM validation — auto-routing by score (<20 → author_review, 20-90 → sortition, >90 → voting)
- Job queue — 6 handlers registered, wired into server startup

### Phase 3: Core Systems
- Debate system — threaded discussions, upvote/downvote, per-user voting constraint
- Community system — autonomous/managed split, General community auto-enrollment
- Platform settings — stored as governance proposals
- Sortition UI — personal dashboard, body detail, selection ceremony page

### Phase 4: UI Coherence
- **AppShell** — unified layout with breadcrumbs, title/actions, Header/Footer/BottomNav
- **LifecycleStepper** — visual stepper for all 8 proposal states
- **Proposal Status Lib** — color/label/icon/next-state for every lifecycle state
- **Proposal Index** (`/proposals`) — filters (status/community/date), search, sort, pagination
- **Debate UI** — DebatePanel with threaded replies, voting, stats banner
- **Dashboard Split** — `/` = public landing page, `/home` = authenticated dashboard
- All pages migrated to AppShell layout

### Phase 5: Proposal Workspace & Voting
- **VotePanel** (363 LOC) — full voting component with progress bars, participation tracking, finalize
- **AmendmentsPanel** — status badges, duplicate grouping, community signal, submit form
- **SortitionPanel** — body status, member count, response rate, average score, deadline
- **NextActionPanel** — context-aware action panel based on proposal lifecycle state
- **Proposal Detail** — 5-tab workspace (Overview, Debate, Amendments, Sortition, Votes)
- **i18n** — 12 new keys (en/el): amendments.new, amendments.placeholder, amendments.submit,
  amendments.submitFailed, amendments.duplicateGroup, proposal.questionLabel

### Phase 6a: Platform Settings & Attendance Schema
- **Platform Settings Backend** — IStorage methods + API routes (GET/PATCH), admin-only
- **Platform Settings UI** — full admin settings page with 4 sections:
  - General (platform name, default community, participation thresholds)
  - Sortition (body size, scoring deadline, timeout)
  - LLM Validation (thresholds for auto-approve/reject)
  - Demo Mode toggle
- **Attendance Schema** — `sortitionAttendance` table with status tracking
  (invited/accepted/declined/no-show, scored, score, notes)
- **i18n** — 25+ keys in en.ts and el.ts
- **Community Badges** — already present in community-list.tsx (autonomous/managed)

---

## Remaining — Priority Order

### 1. Attendance Tracking Backend + UI
- **Status:** Schema exists, backend methods + API routes + UI needed
- **What's needed:** Storage methods for attendance CRUD, API endpoints, UI component for sortition body attendance overview
- **Why:** Critical for tracking citizen jury participation

### 2. Search & Discovery
- **Status:** Proposal index has basic search
- **What's needed:** Full-text search across proposals, debates, amendments. Community browsing page. "Trending" / "Most Debated" / "Needs Your Vote" sections

### 3. Mobile Responsiveness
- **Status:** BottomNav exists, basic responsive layout
- **What's needed:** Audit all pages on mobile viewport. Fix layout issues, touch targets, scroll behavior. Debate panel mobile optimization.

### 4. LLM Validation UI
- **Status:** Backend complete (OpenRouter free models, score-based routing)
- **What's needed:** Validation results display (score, category, reasoning). "Resubmit" flow for author_review proposals. Validation progress indicator during LLM processing.

### 5. Notifications System
- **Status:** `sortitionNotifications` table exists
- **What's needed:** In-app notification center. Proposal state change notifications. Sortition selection notifications. Debate reply notifications. Email notifications (optional, lower priority).

### 6. Performance & Caching
- **Status:** Not yet addressed
- **What's needed:** React Query or SWR for data fetching with caching. Infinite scroll for proposal index. Debounced search. Skeleton loaders.

### 7. Vote Privacy — Client-Side Encryption
- **Status:** Not started — required before binding votes can run
- **Problem:** Both backends (hash-chain, electionguard) let the server host see plaintext votes. Hash-chain stores `userId + choice` in cleartext. ElectionGuard encrypts server-side — host sees plaintext briefly.
- **What's needed:**
  - **Client-side encryption** — ballot encrypted in the browser before it reaches the server. Server only ever handles ciphertext.
  - **Independent trustees** — guardian secret key shares distributed to off-server trustees, not stored in `eg_elections.dev_guardian_secrets`.
  - **SDK Phase 6** — per `docs/VERIFIABLE_VOTING_SDK_PLAN.md`, client-side encryption is the final phase.
- **Why:** Without this, the host can reconstruct "member X cast vote Y on proposal Z" — processing of political opinions linked to identifiable persons (Art. 9 special-category data). Binding votes on cleartext = GDPR liability.
- **Blocker:** GDPR §1 finding. Either implement this (Option A) or formally accept pseudonymity with residual risk (Option B) and don't run binding votes until fixed.

### 8. GDPR Formalization (Phase 8 — Compliance)
- **Status:** Planned — brief at `docs/compliance/GDPR_FORMALIZATION_BRIEF.md`
- **What's needed:**
  - **DPIA** (Data Protection Impact Assessment) — verify every control against codebase, cite file+symbol
  - **ROPA** (Record of Processing, Art. 30) — enumerate all processing activities
  - **Privacy Notice + Consent** (Art. 13 + Art. 9(2)(a)) — bilingual el/en
  - **Internal Policies** — access control, retention/deletion, breach response
- **Critical decision:** §1 vote-linkage — default `VOTING_BACKEND=hash-chain` stores cleartext votes linked to verified identity. Must resolve to Option A (architectural fix — unlinkable ballots) or Option B (pseudonymity honestly labelled with residual risk acceptance). Binding votes cannot run on cleartext without honest documentation.
- **Other tensions:** Right to erasure vs append-only hash-chain, AFM salted hash re-identifiability, LLM quality gate external data flow, LICENSE inconsistency (MIT vs CC-BY-NC-4.0)
- **Deliverables:** `docs/compliance/` directory with DPIA.md, ROPA.md, PRIVACY_NOTICE.md, CONSENT.md, INTERNAL_POLICIES.md, README.md
- **Why:** Processing political opinions = Article 9 special-category data. DPIA is legally required. Without it, the AMKE has no defensible position with HDPA.

### 9. Polish & Launch Prep
- **Status:** Future
- **What's needed:** Error boundaries, empty states, loading states everywhere. Accessibility audit (keyboard nav, ARIA labels, contrast). i18n completeness (all strings in both el/en). Docker Compose production config. Deployment documentation.

---

## Architecture Summary

**Backend:** Express.js + Drizzle ORM + PostgreSQL
- 25 tables, 82+ API endpoints, 81+ storage methods
- 8-state proposal lifecycle with state machine
- Job queue for async tasks (sortition timeout, LLM validation, notifications)
- TF-IDF amendment similarity, sortition algorithm, debate voting

**Frontend:** React + Vite + wouter + Tailwind + shadcn/ui
- AppShell layout system (all pages migrated)
- LifecycleStepper + proposal-status utilities
- i18n: Greek (el) + English (en)
- Auth: JWT-based with `useAuth()` hook

**Key Files:**
- `server/routes.ts` — API endpoints
- `server/storage.ts` — IStorage interface + 81+ methods
- `server/utils/proposal-state-machine.ts` — lifecycle transitions
- `server/utils/sortition.ts` — sortition algorithm
- `server/utils/amendment-similarity.ts` — TF-IDF + cosine
- `server/utils/debate.ts` — threaded debate logic
- `server/utils/community-manager.ts` — community CRUD
- `shared/schema.ts` — Drizzle schema (25 tables)
- `client/src/App.tsx` — route definitions
- `client/src/components/layout/AppShell.tsx` — unified layout
- `client/src/components/ui/LifecycleStepper.tsx` — proposal state visualization
- `client/src/lib/proposal-status.ts` — status utilities

---

## Score Thresholds

**LLM Validation:**
- `<20` → `author_review` (rejected, author must revise)
- `20-90` → `sortition` (needs citizen jury)
- `>90` → `voting` (auto-approved, goes straight to vote)

**Sortition Completion:**
- `≤33` → `author_review` (jury rejected)
- `34-100` → `voting` (jury approved)
- `null` → `archived` (timeout, no quorum)
