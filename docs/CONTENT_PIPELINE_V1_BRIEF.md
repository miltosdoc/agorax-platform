# AgoraX Content Pipeline — v1 Integration Brief

You are integrating an automated content-generation pipeline into AgoraX. It produces a short
podcast + short video for each of three episodes in a proposal's lifecycle, and publishes them
to AgoraX's social channels. Read this entire brief before doing anything.

## CRITICAL: Phase 0 — Discover, do not assume (NO CODE YET)

Before writing a single line, investigate the repo and report back to me. Do not proceed to
Phase 1 until I confirm. Produce a short written report covering:

1. `shared/proposal-lifecycle.ts` — the exact eight states, the canonical transition list, how
   transitions are represented, and where transitions are validated/executed at the API layer.
   I need to know the precise hook points for these three transitions:
     - community_signal → sortition_synthesis   (Episode 1 trigger)
     - sortition_synthesis → voting             (Episode 2 trigger)
     - voting → decided                         (Episode 3 trigger)
   Also report how the "fast-path" (high LLM score skipping states) is implemented — which
   states it can skip, and how that is recorded.

2. The domain module pattern — confirm the "one router + one repository per domain" structure
   and read `scripts/check-modularity.cjs` to extract the EXACT module-boundary rules. Tell me
   what a new `content` domain must and must not import to pass the modularity check.

3. Existing async/job infrastructure — is there already a queue, worker, or background-job
   pattern in the repo (search server/ for queue/worker/cron/job)? If yes, report the pattern.
   If no, report what's available (the README implies PostgreSQL + Drizzle; confirm Redis).

4. Data availability per episode — for each transition confirm exactly which records exist
   in the DB at that moment AND their per-claim provenance. For each field, give the Drizzle
   table/column.
     - Ep1: current proposal text; accepted amendments; community_signal outcomes.
     - Ep3: election result, tally, verification endpoint (/api/proposals/:id/election/verify).
     - Ep2 — THE MAKE-OR-BREAK CHECK. Report the exact Drizzle schema for:
         · sortition_scores
         · sortition_revisions
         · community_signal outcomes (how rejections/overrides are recorded)
         · amendments (adjudication status per amendment)
       Specifically answer: is provenance stored PER-AMENDMENT / PER-CLAIM, or is it
       AGGREGATED per-proposal? Episode 2 grounding REQUIRES that each claim in the
       deliberation report can be traced to an individual record (one amendment, one
       sortition score, one override). If this data is aggregated and the per-claim link is
       lost, Episode 2's strict-grounding guarantee is architecturally impossible — STOP and
       report this as a hard blocker. Do not design around it; I must resolve it first.

5. Existing LLM integration — the README says proposals are scored by an LLM at the `review`
   state. Report how the LLM is called (provider, where the client lives, env vars) so the
   content pipeline reuses it rather than adding a parallel integration.

6. i18n — report how the el/en translation-key parity check (`npm run check:i18n`) works, since
   generated content is bilingual and must not break it.

7. Bilingual content layer — confirm: `npm run check:i18n` validates STATIC UI translation
   keys in en.ts/el.ts only. It does NOT and must NOT govern dynamically generated content.
   Generated scripts are produced as two independent artifacts (lang:"el" and lang:"en") from
   the same source records. Confirm the static-key system and the dynamic-content layer are
   cleanly separable, and that adding generated content does not touch the i18n key check.

STOP after this report and wait for my confirmation.

## Architecture (build in Phase 1+ after I confirm)

New domain `content`, respecting the module boundary. The pipeline is ONE shared script per
episode, rendered to TWO targets (audio + video), then published. Do not build two parallel
pipelines.

    lifecycle transition fires
        → enqueue ContentJob(proposal_id, episode, transition)
        → ASSEMBLE script (structured JSON, see below) from REAL lifecycle records
        → [audio render] ‖ [video render]   (parallel, off the same script)
        → publish to platforms
        → record artifact, linked to proposal_id + episode + transition

### The shared script artifact (the contract between stages)

Structured JSON, never free prose. Every content-bearing segment MUST carry a source_ref
pointing to a real DB record (amendment_id, sortition_id, election tally, etc.). A segment with
no source_ref is a bug, not a stylistic choice. Shape:

    {
      "episode": 1 | 2 | 3,
      "proposal_id": "...",
      "lang": "el" | "en",          // generate both; see i18n note
      "speakers": [{ "id": "host_a", "voice": "..." }, { "id": "host_b", "voice": "..." }],
      "segments": [
        {
          "speaker": "host_a",
          "text": "...",
          "source_ref": "amendment:UUID" | "sortition:UUID" | "election:tally" | null,
          "visual": { "type": "title|datalist|tally|quote", "content": ... }
        }
      ]
    }

### Episode semantics — these are NOT interchangeable. Build them as distinct generators.

- Episode 1 (community_signal → sortition_synthesis): "the matured proposal."
  Content = the proposal AS SHAPED BY the community (post-amendment), plus the strongest
  counter-position drawn from rejected/contested amendments. Format is explicitly two-sided,
  not a sales pitch. Approval gate: AUTHOR approves before publish. The author may approve or
  reject the whole piece but MAY NOT edit the counter-position text — surface that as read-only.
  UI requirement: the counter-position must render as visually distinct, READ-ONLY in the
  author's approval view — clearly not an editable field — to prevent edit attempts and the
  resulting support burden.

- Episode 2 (sortition_synthesis → voting): "the deliberation report." HIGHEST RISK.
  Content = adjudicated amendments + how community_signal voted on author rejections + how the
  sortition jury scored/revised. The LLM is a RENDERER of these records, NOT an author of
  opinion. STRICT grounding: every segment.text must derive from a record referenced in
  source_ref. After script generation, run a grounding-validation pass that REJECTS the script
  if any content-bearing segment lacks a valid, resolvable source_ref. Do not render an
  ungrounded Episode 2. Approval gate: NOT the author. For v1, gate = strict-grounding-pass +
  hold for my manual review (leave a clean TODO seam where a sortition-jury approval step will
  later slot in).
  FAST-PATH HANDLING (mandatory): if the proposal reached voting via fast-path and skipped
  deliberation states, there is NO deliberation to report. In that case DO NOT fabricate one.
  Either skip Episode 2 entirely, or generate a factual notice ("this proposal was fast-tracked
  on quality score; no contested deliberation occurred"). Never produce a "deliberation report"
  for deliberation that didn't happen.

- Episode 3 (voting → decided): "the verified decision." Build this FIRST (it's the spine).
  Content = result + tally + a prominent reference to the public verification URL. This is a
  TEMPLATE, not LLM generation — fill real numbers into fixed bilingual copy. Zero editorial.
  Approval gate: none. The video MUST display the real tally and the verify link, because
  AgoraX's whole premise is "anyone can re-verify the count" — the content layer inherits that.

### Render stages (abstract both behind interfaces — these vendors will change)

- `TTSProvider` → first impl: **OpenAI TTS (v1/v2)**. AgoraX is a democracy platform — its core
  content is political/civic discourse. ElevenLabs, Gemini, and many commercial providers BLOCK
  political content by default. OpenAI TTS allows civic/political speech (prohibits hate speech/
  violence, not deliberation). Greek quality is good. Multi-speaker via separate calls + ffmpeg
  mix. Keep Google Cloud TTS as a documented alternative if Greek quality is the priority.
  Keep ElevenLabs as a documented option ONLY for non-sensitive, non-political content (e.g.,
  platform tutorials, onboarding). Do NOT use ElevenLabs for proposal deliberation content — it
  will be blocked.

- `VideoRenderer` → templated, NOT generative. Phase 0 must EVALUATE three paths and recommend
  the SIMPLEST that yields TikTok-acceptable output for data cards (title, tally bars, verify-URL):
    (a) ffmpeg (drawtext/overlay/filter_complex) — likely sufficient for v1's templated cards,
        lightest infra, no extra service. Default to this unless output quality is inadequate.
    (b) Creatomate — managed API, pay-per-render, no infra.
    (c) Remotion — React-based, MOST powerful but a SEPARATE Node service with a Puppeteer/
        Chrome render dependency; likely over-provisioned for v1 title cards. Choose only if
        (a) and (b) can't meet the visual bar.
  Complexity must justify itself. Do NOT stand up a Chrome-in-Docker render service for three
  title cards if ffmpeg suffices.

### PublishProvider (abstract behind one interface)

Implement Telegram FIRST (simplest, most forgiving), prove the full chain to a real post, then
add YouTube, Facebook, TikTok. TikTok last — strictest review. One PublishProvider interface,
one impl per platform, channel config in env/DB not hardcoded.

## Build order (respect this even within "full v1")

1. Phase 0 report (above) → wait for me.
2. content domain scaffold: ContentJob model + migration, job queue/worker, the two render
   interfaces + the publish interface (no real impls yet, stubs that write a file).
3. EPISODE 3 end-to-end on stubs → then real TTS → real video render → real Telegram publish.
   This proves the entire spine on the safest episode. Show me a real published Telegram post
   before continuing.
4. Episode 1 (with author approval gate).
5. Episode 2 LAST (grounding-validation pass + fast-path handling + manual-review gate).
6. Remaining publish platforms (YouTube → Facebook → TikTok).

## Hard constraints

- Pass npx tsc --noEmit, npm test, npm run check:i18n, node scripts/check-modularity.cjs
  before declaring any phase done.
- The deliberation layer must stay independent of the voting backend (per the architecture guide)
  — content reads election RESULTS via the existing public election interface, it does not
  reach into voting internals.
- Secrets (TTS keys, platform tokens) via env, never committed. Add to .env.example.
- Every generated artifact row links to proposal_id + episode + transition for auditability.
- Open a draft PR per phase; do not squash all phases into one diff.

## What NOT to do

- Do not invent lifecycle states, transitions, or DB columns. If Phase 0 shows a gap, STOP and
  tell me.
- Do not let Episode 2 emit any claim without a resolvable source_ref.
- Do not use generative video for episode content.
- Do not give the author edit control over Episode 2, or over Episode 1's counter-position.
- Do not hardcode social channel IDs or the LLM/TTS provider choice.

Begin with Phase 0. Report back. Write no code until I confirm.
