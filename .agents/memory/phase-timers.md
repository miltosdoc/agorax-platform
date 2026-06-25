---
name: Phase timer system
description: Countdown timers, configurable durations, and auto-advance for proposal lifecycle phases.
---

## Schema additions
- `communities` table: `authorReviewHours` (int, default 72), `communitySignalHours` (int, default 48), `votingHours` (int, default 168)
- `proposals` table: `phaseDeadline` (timestamp)

Both columns added via `ALTER TABLE` SQL (Drizzle push was not used).

## Backend flow
1. `server/utils/proposal-state-machine.ts` → `transitionProposal()` computes `phaseDeadline = now + N hours` when entering `author_review`, `community_signal`, or `voting`. Duration comes from the community's settings.
2. `server/utils/job-handlers.ts` → `phase_auto_advance` job handler queries proposals where `phaseDeadline < now` and calls the appropriate finalization function. A `setInterval` enqueues this job every 60 seconds inside `startJobQueue`.
3. Top-level `import { enqueueJob }` is required — `require('./job-queue')` inside the function fails because the file is ESM.

## Frontend
- `client/src/components/ui/PhaseCountdown.tsx` — reusable countdown component (hh:mm:ss, red when < 1 hour, shows "Έληξε" when expired).
- Used in: `amendment-author-review.tsx`, `amendment-community-signal.tsx`, `VotePanel.tsx` (receives `phaseDeadline` prop from `proposal-detail.tsx`).
- Community settings form (`community-settings.tsx`): phase duration section with three number inputs, mapped through `toForm()` and submitted via existing settings API.

## Key gotcha
`enqueueJob` must be imported at the top of `job-handlers.ts`, not via `require()` inside `startJobQueue`, because the module is ESM.
