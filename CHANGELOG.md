# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Email address confirmation** — new registrations are mailed a confirmation
  link; the member can ask for another from `/notifications/settings`, capped
  per hour. `users.email_verified_at` records the fact and the admin accounts
  page shows a Verified / Not verified badge per account. **Nothing is gated
  on it** — every account predating this feature is unverified, and locking
  those people out would be a worse failure than an unconfirmed address. The
  token is pinned to the address it was issued for, so correcting a typo
  retires the old link rather than confirming the new address unread.
  `scripts/send-verification-backfill.ts` mails existing members once, paced
  and safe to re-run. Migration `0044_user_locale_and_email_verification`.
- **Per-member language** — `users.locale` is set from the interface language
  at registration and updated whenever the member uses the language switcher,
  so choosing a language once covers both the site and the email. Every
  template renders in Greek and English; accounts predating the column fall
  back to their consent locale, then to Greek.
- **Signed-out pages wear the platform's chrome** — password reset, forgot
  password, address confirmation and unsubscribe now share the login screen's
  masthead, wordmark, Beta badge, type and language switcher via
  `components/auth/AuthShell`. These pages are reached by clicking a link in
  an email, in a browser with no session — the exact moment a careful person
  asks whether the page is genuine, and a generic white card answers badly.
- **Self-service password reset by email** — a "Ξέχασα τον κωδικό μου;" link
  on the login form leads to `/forgot-password`, which answers identically
  whether or not the address has an account and mails a single-use link that
  expires in 30 minutes. Requesting a new link retires the previous one; the
  reset is rate-limited per IP and, more tightly, per address (counted as an
  HMAC, so the counter table is not a list of addresses). Completing a reset
  applies the shared password policy, drops every session for the account,
  signs nobody in, and sends a password-changed notice. The admin-issued link
  from `0040` still works for a member who has lost the address itself
  (`issued_by_id` NULL now means "the member asked"). Migration
  `0042_self_service_password_reset`.
- **Email notification preferences** — `/notifications/settings` gives every
  member a master switch plus one switch per category (new proposals in their
  communities; votes and polls; updates on proposals they follow). Categories
  live in a jsonb map (`0043_email_notification_prefs`), so a new one is an
  entry in `shared/email-categories.ts` and two locale strings, never a
  migration. Preferences are read at send time, not at enqueue time. Every
  optional email carries a settings link and a signed one-click unsubscribe
  whose token carries no user id and no address and authorises exactly one
  action. Security mail is not representable in the preference schema at all.
- **Email delivery** — Scaleway Transactional Email over SMTP via Nodemailer,
  behind a single service (`server/utils/email-service.ts`) that claims an
  idempotency row before every send. Five responsive, image-free templates
  with plain-text twins, in Greek and English, following the locale the member
  accepted the consent text in. With no SMTP credentials configured every send
  is a silent no-op — which is also what keeps the test suite off the wire.
  See [docs/email-setup.md](docs/email-setup.md).
- **Community Library** — per-community media tab (audio / video / documents)
  decoupled from proposals and the global feed; members upload, founder and
  admins pin items to the top; content respects the community's
  public/members-only visibility. New `community_media` table
  (migration `0035_community_media`), routes under
  `/api/communities/:id/media`, shared upload rules extracted to
  `server/utils/media-rules.ts`, Library tab on the community dashboard.
- **General community activated** — idempotent
  `scripts/create-general-community.ts` creates the single
  `is_general = true` community and backfills every existing user;
  Google-OAuth signups now auto-enroll too (previously only local
  registration did).
- **Explainer-video source material** — `docs/explainer/` carries a full
  Greek platform guide plus a 7-scene video production brief, ready as
  NotebookLM sources.

### Fixed
- **Sortition timeout sweep never ran** — the `sortition_timeout` job was
  registered but never enqueued, so a proposal whose jury never fully
  responded sat in `sortition_synthesis` forever. The queue now sweeps
  every 5 minutes and the admin complete route advances the proposal.
- **Poll piggyback-module poisoning** — panelists first touched while the
  question bank was empty were stored with an empty module assignment
  forever; assignments now self-heal and empty subsets are never persisted.
- **Members-only content leak via debate votes** — argument/thread vote
  endpoints now require community membership, matching authorship rules.
- **Production bundle required vite at runtime** — dev-only server code is
  now eliminated from the production build (`--define:process.env.NODE_ENV`),
  fixing the Jul 10 crash-loop class.
- **Anonymous-identity transfer UX** — either code format (raw identity
  code or Profile transfer bundle) is now accepted in either import field.
- **Dependencies** — removed unused `svg2img` chain and upgraded
  `drizzle-orm` to 0.45.2: `npm audit` reports zero vulnerabilities.
- **CI** — lockfile re-pinned for npm 10, workflow steps made real
  (`check:i18n` instead of unconfigured eslint, correct artifact paths);
  the pipeline is green end to end.
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

[Unreleased]: https://github.com/miltosdoc/agoraxdemocracy/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/miltosdoc/agoraxdemocracy/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/miltosdoc/agoraxdemocracy/releases/tag/v0.0.1
