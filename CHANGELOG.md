# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Real-time conferences via LiveKit** — self-hosted SFU sidecar, two room
  kinds (community, sortition deliberation), JWT-token join, host-only
  End-call, in-app banner showing active calls on the community dashboard
  and /home, idempotent sortition-room creation. Migration `0027_livekit_rooms`.
- **Calendar invite (`.ics`)** — every room exposes `/api/livekit/rooms/:id/ics`
  with a well-formed `VEVENT` (UID, DTSTART/DTEND, SUMMARY, URL); one-click
  "Add to calendar" link on the room card.
- **Recent calls history** — `livekit_participations` log records joins on
  token issue and leaves via `fetch({keepalive:true})` beacon (covers
  pagehide / hard tab close). New `/api/communities/:id/rooms/history`
  endpoint returns closed rooms with duration and de-duped participant
  list. Surfaced as a *Recent calls* card under the Conferences tab.
  Migration `0029_livekit_participations`.
- **Web Push notifications** — VAPID-signed push for conference scheduled /
  starting and sortition room opened events; subscriptions persisted in
  `push_subscriptions` (one row per browser, unique by endpoint, 404/410
  auto-purged). Opt-in card on `/notifications`. Service worker at
  `client/public/sw.js` handles `push` and `notificationclick`. Migration
  `0028_push_subscriptions`.
- **Conference notifications fan-out** — three new notification types
  (`conference_scheduled`, `conference_starting`, `sortition_room_opened`)
  fired in-app and via Web Push to every other community/body member when
  a room is created. Non-blocking — a notification failure can't block room
  creation.
- **Media Studio** — per-proposal Greek script generation for a podcast
  (two-voice, 3–5 min) and a video teaser (~45s). LLM-backed when
  `LLM_API_URL` is configured (deterministic template fallback otherwise).
  Optional opt-in toggles to include amendments and discussion comments
  in the script context. MP3/MP4 upload (120MB cap, m4a + mov also accepted),
  ffprobe validation, ffmpeg poster-frame extraction. Migration
  `0026_proposal_media`.
- **Featured media + author curation** — gallery on each proposal page;
  author/uploader can hide/delete; only the author can feature one entry per
  kind (enforced by a partial unique index). Public share routes
  `/p/:pid/(podcast|video)/:mid` render server-side OG + Twitter unfurl tags.
- **AgoraX Feed (`/feed`)** — global discovery page listing the most recent
  featured podcasts and videos across all proposals; filter by kind, inline
  player, deep-link to the proposal. Embedded preview on `/home`.
- **FAQ + How It Works refresh** — four new FAQs (q17–q20) covering Media
  Studio, Feed, Conferences, Notifications; new "Engagement tools" section
  on `/how-it-works` with the same four surfaces. Both locales in lockstep
  — i18n key check passes.

### Changed
- **Production CSP** — `connect-src` widened on-the-fly from `LIVEKIT_URL`
  (both `wss://` and the matching `https://`) so the SFU connection
  isn't blocked under the default helmet policy.
- **Production rate limits** — `apiLimit` 100→600 per 15 min, `authLimit`
  10→30. The previous 100/15 min was tripping normal browser sessions
  during login (a single page load fires 10–20 `/api/*` calls).
- **Voting backend boot guard** — `LLM_API_KEY` now allowed in production
  when `LLM_GATE_AUDITED=true` is explicitly set; `OPENROUTER_API_KEY`
  stays banned outright. Lets you wire a private / EU LLM endpoint that
  has been re-audited under §4.2 of the data-minimisation audit.

### Fixed
- **Hide/unhide visibility** — `mediaRepo.listForProposal` now accepts
  `userId` so an uploader who hides their own row on someone else's
  proposal can still see it in the list to unhide. Regression-guarded
  with a contract test + an end-to-end smoke script.
- **Migrated all 13 routers** from legacy `DatabaseStorage` facade to
  domain-specific repositories.
- **Variable shadowing** between repo instances and Drizzle schema tables.
- **`getAttendanceSummary()`** return type in SortitionRepository.
- **`upsertAttendance()`** parameter format in proposals router.

### Removed
- 106 `console.log` statements from production code.
- Legacy `DatabaseStorage` facade usage from all routers.

## [0.1.0] - 2026-05-12

### Added
- Initial release with core deliberative democracy features
- 8-state proposal lifecycle (Draft → Review → Synthesis → Author Review → Sortition → Voting → Archived)
- Cryptographically secure sortition with CSPRNG and rejection sampling
- TF-IDF + cosine similarity amendment clustering
- Democracy score calculation with composite metrics
- Domain-driven architecture with 9 repositories and 12 routers
- Comprehensive test suite (81 tests, 100% passing)
- Docker multi-stage build configuration
- CI/CD pipeline with GitHub Actions
- Health check endpoint with real-time memory metrics
- Rate limiting middleware
- Structured logging module
- E2E test infrastructure with Playwright
- Performance benchmarking script
- Load testing script
- Security audit checklist
- Migration strategy documentation
- Contributing guide

### Changed
- Split monolithic `storage.ts` (3,135 lines) into 9 domain repositories
- Split monolithic `routes.ts` (2,412 lines) into 12 domain routers
- Reduced `routes.ts` from 2,412 to 67 lines (97% reduction)
- Reduced total storage lines by 42%
- Enforced module boundaries with automated script
- Added JSDoc to all public APIs
- Eliminated all `any` type usages
- Removed all `console.log` statements from production code

### Fixed
- Fixed variable shadowing conflicts between repo instances and schema tables
- Fixed `getAttendanceSummary()` return type in SortitionRepository
- Fixed `upsertAttendance()` parameter format in proposals router
- Fixed TypeScript compilation errors (0 errors remaining)

### Security
- Implemented CSPRNG-backed Fisher-Yates shuffle with rejection sampling
- Added rate limiting middleware (100 req/15min API, 10 req/15min auth, 5 req/min voting)
- Added structured logging for security events
- Added health check endpoint for monitoring
- Added security audit checklist

### Performance
- Added request timing middleware for slow request detection
- Added performance benchmarking script
- Added load testing script
- Added performance optimization guide

## [0.0.1] - 2026-04-01

### Added
- Initial prototype with basic proposal lifecycle
- Basic sortition implementation
- Amendment similarity algorithm
- Democracy score calculation
- Local Docker Compose setup
- Basic test suite

### Changed
- Initial architecture design
- Basic domain-driven structure

### Fixed
- Initial bug fixes and improvements

[Unreleased]: https://github.com/miltosdoc/agoraxdemo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/miltosdoc/agoraxdemo/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/miltosdoc/agoraxdemo/releases/tag/v0.0.1
