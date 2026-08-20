# AgoraX Roadmap

Updated: 2026-06-03

**Current status:** Engagement Layer shipped. Proposal lifecycle, sortition, amendments, debate, communities, LLM validation are wired and the UI matches. On top of the deliberation pipeline, four engagement surfaces are now live: real-time conferences (LiveKit), per-proposal media production (script gen + upload), a global Feed for discovery, and in-app + Web Push notifications. **Next bottlenecks:** binding-vote crypto (Phase 6 of the SDK plan), production TURN for conferences behind strict NATs, and a pilot host.

---

## What Works (Backend)

- ✅ Proposal lifecycle (8 states: draft → review → author_review → community_signal → sortition_synthesis → voting → decided/archived)
- ✅ Sortition system — selection, scoring, synthesis, timeout handling, notifications
- ✅ Amendment system — TF-IDF + cosine similarity dedup, author review, community signal
- ✅ LLM validation — OpenRouter/NVIDIA Nemotron free tier, tiered scoring (<20 return, 20-90 sortition, >90 auto-approve)
- ✅ Debate system — threaded discussion with voting, gated to deliberation states
- ✅ Community system — autonomous/managed types, General community, platform settings as proposals
- ✅ Job queue — 6 handlers registered, sortition timeout wired
- ✅ Amendment merger — accepted amendments merged into proposal text, counter-proposals as competing options
- ✅ Security baseline — helmet, cookie hardening, body limits, demo mode blast door

## What's Broken (UI)

- ❌ `/proposals` — no index page (404)
- ❌ Proposal cards show blank titles
- ❌ `/communities` — missing app shell (no header/footer)
- ❌ `/proposals/:id` — missing app shell, tabs don't switch reliably
- ❌ Proposal detail status and default tab disagree (sortition_synthesis opens Vote tab)
- ❌ Multiple redundant Submit Proposal CTAs
- ❌ No debate UI (backend exists, frontend doesn't)
- ❌ No community type display (autonomous vs managed)
- ❌ No platform settings UI
- ❌ Proposal creation doesn't require community selection
- ❌ No lifecycle stepper on proposal detail
- ❌ No authenticated dashboard — `/` and `/home` are the same page

---

## Phase 6 — Engagement Layer ✅ DONE

Shipped: 2026-06.

The four surfaces built on top of the deliberation pipeline:

- [x] **Real-time conferences (LiveKit)** — self-hosted SFU sidecar; two
      room kinds (community, sortition deliberation); host-only End-call;
      `.ics` calendar invite; in-app banner showing active calls on the
      community dashboard and `/home`; idempotent sortition-room creation.
- [x] **Recent calls history** — `livekit_participations` log + leave beacon
      (`fetch({keepalive:true})` survives `pagehide`); per-room duration +
      de-duped participant list under the Conferences tab.
- [x] **Media Studio** — per-proposal Greek script generation for a podcast
      (two-voice, 3–5 min) and a video teaser (~45 s). LLM-backed when
      `LLM_API_URL` is set, deterministic template fallback otherwise.
      Optional toggles for amendments + discussion-comment context.
      MP3/MP4 upload, ffprobe validation, ffmpeg poster-frame extraction.
- [x] **Featured media + share routes** — gallery on each proposal page;
      author features one entry per kind (partial unique index);
      `/p/:pid/(podcast|video)/:mid` renders OG + Twitter unfurl tags.
- [x] **AgoraX Feed (`/feed`)** — global discovery surface; filters,
      inline player, embedded preview on `/home`.
- [x] **In-app + Web Push notifications** — VAPID-signed push for room
      events; service worker; opt-in card on `/notifications`; in-app
      bell carries the same three new types (conference_scheduled,
      conference_starting, sortition_room_opened).
- [x] **FAQ + How It Works** — refreshed (q17–q20 + "Engagement tools"
      section), both locales in lockstep.

**Not done (deliberate):** Egress recording — recording_enabled is a
data-model flag but not wired to a livekit-egress worker. Voice + faces
is Art. 9 personal data, so recording ships with a consent surface or it
doesn't ship. Auto-close of sortition rooms when the parent body
completes is also out of scope for this cut — easy to add to
`server/utils/sortition-timeout.ts` when the next pilot needs it.

---

## Phase 0 — Stabilization ✅ DONE

- [x] Security hardening (helmet, cookies, body limits, demo mode)
- [x] Error handler fix
- [x] Response-body logging removed
- [x] i18n key scanner
- [x] Docker smoke tests

---

## Phase 1 — The Spine (Backend Core)

**Status:** Mostly done. Two critical gaps remain.

### 1.1 Real `proposal_votes` table — FINAL RATIFICATION

**Priority: CRITICAL** — Without this, voting is fake.

Today "support" during deliberation and "ratify" at the end share `proposal_support`. Need a dedicated table:

- `proposal_votes(id, proposal_id, user_id, choice, cast_at, weight)` with `unique(proposal_id, user_id)`
- Storage: `castProposalVote`, `getProposalVoteResults`, `hasUserVotedOnProposal`
- Routes: `POST /api/proposals/:id/vote`, `GET /api/proposals/:id/vote-results`, `POST /api/proposals/:id/finalize`
- Finalize computes participation %, checks community `min_participation_pct`, transitions `voting → decided` (or `voting → archived` on quorum fail)
- Wire proposal-detail Vote tab to the new table, not `proposal_support`

### 1.2 TypeScript burndown

**Status:** TS compiles clean for new code. Pre-existing errors in node_modules (drizzle-orm types) and `@shared/` path aliases (handled by Vite at runtime) are acceptable for now.

### 1.3 Seed alignment

- [ ] Update `seed-demo.ts` to use canonical 8-state lifecycle
- [ ] Seed demo proposals across multiple states so dashboard has interesting data
- [ ] Seed General community + platform settings (done in Phase 3, verify)

---

## Phase 2 — UI Coherence

**Status:** This is the immediate priority. Backend is ready; UI is not.

### 2.1 AppShell + Status System

**Single change, two parts.** Build `<AppShell>` with header/footer/bottom-nav (props: `title`, `breadcrumb`, `actions`). Build `proposal-status.ts` central map: `state → { color, icon, greekLabel, nextAction }`. Build `<LifecycleStepper proposal>` reading from that map.

Apply to: `/communities`, `/proposals`, `/proposals/:id`, `/profile`, `/home`.

### 2.2 Proposal Index Page

- [ ] Create `/proposals` index page
- [ ] List proposals with status badges, community, author, date
- [ ] Filter by community, status, author
- [ ] Search by question text

### 2.3 Proposal Detail as Workspace

Replace tabs with a single-page workspace:
- Lifecycle stepper at top
- Sticky "next action" panel on mobile when action is required
- Sections in lifecycle order: amendments → debate → vote tally → final text
- Default tab derived from proposal status (not hardcoded)

### 2.4 Dashboard Split

- [ ] `/` = public landing page (hero, how it works, CTA)
- [ ] `/home` = authenticated workspace answering: "what do I need to do right now?"
- [ ] Sections: pending actions, active proposals, open votes, sortition assignments, recent decisions
- [ ] No hero banner on `/home`. Honest empty state.

### 2.5 Debate UI

Backend exists (`debate_threads`, `debate_votes`, routes). Frontend missing.

- [ ] Debate tab/section on proposal detail page
- [ ] Thread list with nested replies, upvote/downvote
- [ ] Create thread + reply forms
- [ ] Gated to deliberation states (amendments, author_review, sortition)
- [ ] Thread stats (total threads, top contributors)

### 2.6 Community Dashboard

- [ ] Show community type (autonomous/managed) with badge
- [ ] Show member count, proposal count, governance settings
- [ ] Admin panel for managed communities (add/remove members, change settings)
- [ ] Transition proposal (autonomous → managed, managed → autonomous)

### 2.7 Platform Settings UI

- [ ] Settings page showing current platform defaults
- [ ] Link to governance proposals that can change them
- [ ] Display: participation threshold, sortition size, validation model, amendment threshold

### 2.8 Proposal Creation

- [ ] Require community selection (no default to community 1)
- [ ] Show community dropdown with search
- [ ] Show community governance settings preview

---

## Phase 3 — Architecture Cleanup

**Prerequisite:** Phase 2 UI coherence must be done first — splitting routes while UI is broken generates merge nightmares.

### 3.1 Split `routes.ts` by domain

- `routes/auth.ts`, `routes/proposals.ts`, `routes/communities.ts`, `routes/sortition.ts`, `routes/amendments.ts`, `routes/debate.ts`, `routes/ballot.ts`, `routes/admin.ts`

### 3.2 Split `storage.ts` into repositories

Along same domain lines. Keep `IStorage` union type for now.

### 3.3 Observability

- `pino` structured logger
- Request ID middleware
- Redaction config for sensitive data
- Replace remaining `console.error`

### 3.4 API DTOs

- Define DTOs for frontend/API boundaries
- Stop leaking raw DB rows to the client
- Add response validation for high-risk routes

---

## Phase 4 — Pilot Readiness

### 4.1 The One Happy Path

End-to-end Playwright test: register → join community → submit proposal → full lifecycle → ratification vote → resolved. Runs on every CI build. If red, nothing ships.

### 4.2 Notifications Wired

- Sortition/proposal lifecycle notifications fire on actual events
- Deadline reminders run on a scheduler
- Without this, the platform is dead between visits

### 4.3 CI/CD

- GitHub Actions: build, i18n check, unit tests, Docker build, Playwright
- Deploy workflow for staging

### 4.4 Legal

- Greek lawyer opinion on (a) outcome legitimacy, (b) AFM-hash retention, (c) liability for verification false positives/negatives
- DPIA/GDPR for political opinion data

### 4.5 Pick the Pilot

One community of <500 people. Not a municipality. Better: university student association, co-op, internal party deliberation, neighborhood council. Need a champion inside who reports UX failures.

---

## Phase 5 — Pilot

Run one binding-enough proposal through the full lifecycle. Instrument everything. Expect 20 bugs the test suite missed. Fix, run a second proposal. After two clean runs, the product exists.

---

## Defer / Kill

- **LLM tiered validation** — marquee feature in README, not on critical path. Ship pilot without real LLM if needed (mock works).
- **More languages** — Greek + English is enough for pilot.
- **More poll types, proposal types** — surface area multiplier. Wait.
- **Mobile-native apps** — PWA + responsive is enough.
- **Map/location features** beyond current OSM seed — most pilot communities will be created by hand.

---

## Parallel External Dependencies — Start Now

- Legal opinion on Gov.gr ballot pipeline
- Identify pilot community + internal champion
- Decide: pilot outcomes advisory or binding? If advisory, drop "verified ballot" framing for v1 and use Gov.gr only for identity verification. Cleaner pitch, far less legal risk.

---

## Immediate Next Steps (This Week)

1. **`proposal_votes` table** — the single highest-value technical change. Without it, voting is fake.
2. **AppShell + lifecycle stepper** — makes every page feel coherent
3. **Proposal index page** — `/proposals` should work
4. **Debate UI** — backend exists, just needs frontend
5. **Dashboard split** — `/` public, `/home` authenticated workspace
