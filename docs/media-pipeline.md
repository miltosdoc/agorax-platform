# Media pipeline — operator + contributor guide

The Media Studio lets a proposal be summarised as a Greek **podcast**
and a **short video teaser**. AgoraX writes the scripts; the user
produces the actual audio/video externally (NotebookLM, ElevenLabs,
Descript, anything); they upload the result back; the author picks
one of each as *Featured* and that's what surfaces in the global Feed
and on shareable social cards.

## End-to-end flow

```
                  ┌──────────────────────┐
                  │ /proposals/:id/Media │
                  └──────────┬───────────┘
                             │
   "Generate script"         ▼
   ─────────────────▶  POST /api/proposals/:id/scripts/(podcast|video)
                             │
                             │  loads: question, solution, community,
                             │         top for/against arguments,
                             │         (optional) amendments, threads
                             ▼
                  ┌──────────────────────┐
                  │ if LLM_API_URL set:  │     fallback when LLM
                  │   OpenAI-compatible  │ ◀── unavailable, env-less,
                  │   chat completion    │     or times out
                  │ else:                │
                  │   deterministic      │
                  │   Greek template     │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ Script text returned │  source: 'llm' | 'template'
                  │ in editable textarea │  (badge on the card)
                  └──────────┬───────────┘
                             │
   user copies, opens NotebookLM (or any tool), produces MP3/MP4
                             │
                             ▼
   "Upload"           POST /api/proposals/:id/media (multipart)
                             │
                             │  validation:
                             │   • kind ∈ {podcast, video}
                             │   • size ≤ 120 MB (per kind)
                             │   • ext  ∈ podcast: {.mp3, .m4a}
                             │            video: {.mp4, .mov}
                             │   • ffprobe: has audio (podcast) /
                             │              has video (video stream)
                             │   • ffmpeg: extract 1s poster frame
                             │            for videos → JPEG thumbnail
                             ▼
                  ┌──────────────────────┐
                  │ AGORAX_MEDIA_DIR/    │  default ./uploads/media
                  │   <proposalId>/      │
                  │     podcast-…<hash>  │
                  │     video-…<hash>    │
                  │     <thumb>.jpg      │
                  └──────────┬───────────┘
                             │
                             ▼
   ┌─────────────────────────┴─────────────────────────┐
   │   proposal_media row                              │
   │     kind, file_path, thumb_path, duration_s,      │
   │     mime, size_bytes, status='published'          │
   └─────────────────────────┬─────────────────────────┘
                             │
                             ▼
   Gallery on the proposal page.
   Author taps "Set as featured" on one podcast and one video.
   At-most-one per kind, enforced by partial unique index.

                             │
                             ▼
   Featured rows surface:
     • /feed                — global discovery
     • Proposal Overview    — under question/solution
     • /home dashboard      — Recent media section
     • /p/:pid/(podcast|video)/:mid   — public unfurl page
        ▲
        │  server-rendered OG + Twitter meta tags
        │  (Facebook / X / Threads / WhatsApp / Telegram)
```

## Script generation

Located in `server/utils/media-scripts.ts`. Loads the proposal context
with one optional knob each:

| Query param            | Effect                                                                |
|------------------------|-----------------------------------------------------------------------|
| `?include=amendments`  | Pulls top 4 amendments, author-accepted first then by community signal |
| `?include=threads`     | Pulls top 5 top-level discussion threads ranked by net upvotes         |
| `?include=amendments,threads` | Both                                                            |

The prompt asks for a specific structure:

* **Podcast** — voice A (presenter) + voice B (analyst); intro, question,
  proposed solution, supporting arguments, opposing arguments, optional
  amendments + comments sections, sum-up and call to action.
* **Teaser** — 5 scenes with `Πλάνο:` + `Αφήγηση:` lines: hook, the
  question, the proposal, two sides, CTA.

### LLM mode

When `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL` are all set, the script
goes through `server/utils/llm-client.ts` (a thin OpenAI-compatible
chat-completions wrapper). Reasoning-model behaviour matters here:

* Qwen 3.x and similar models can burn the entire token budget on
  internal chain-of-thought before emitting any content. The client
  passes `reasoning: { enabled: false }` to suppress that — verified
  against the xsilico endpoint, drops a 1-token "γεια" from 100→5
  tokens.
* Timeout is 60 s for the podcast, 90 s for the in-DB path; on
  timeout / 5xx / empty content the call throws
  `LlmUnavailableError` and the caller falls back to the template.

### Template fallback

`server/utils/media-script-templates.ts` is the deterministic Greek
template. Pure functions, no I/O, fully unit-tested
(`tests/integration/media-scripts.test.ts`). Used when:

* `LLM_API_URL` env is missing (no key configured)
* The LLM call throws / times out
* The LLM returns an empty body

The fallback path renders the same data — including any opted-in
amendments and threads — into a plain script that's still
proposal-specific. The user sees the same UX with a `From template`
badge instead of `From LLM`.

## Upload validation

`server/routers/media.ts` enforces, in order:

1. `kind` in body → 400 if not `podcast` | `video`.
2. `file` part present → 400 if missing.
3. User is a community member of the proposal's community → 403.
4. Size ≤ 120 MB → 413.
5. Extension match → 415.
6. MIME probably-correct (audio/* for podcasts, video/* for videos,
   plus `application/octet-stream` permitted because some browsers
   send that) → 415.
7. After write, ffprobe — podcast must have an audio stream, video
   must have a video stream. Wrong-content rows are unlinked from
   disk and 415-rejected.
8. Duration is **only stored**, never enforced. The proposal author
   decides what length is appropriate.

File naming is `<kind>-<sha256(buf).slice(16)>-<rand4>.<ext>`. The
content hash means the URL is effectively immutable — the static
serve sends `Cache-Control: public, max-age=604800, immutable`.

## Gallery + curation

* List endpoint `GET /api/proposals/:id/media` returns published rows
  plus the viewer's own hidden rows (so uploaders can find their
  hidden entries to unhide them). Authors and admins see everything.
* `PATCH /api/proposals/:id/media/:mid` carries `{ isFeatured?, status? }`.
  * `isFeatured: true` requires `viewerIsAuthor` or admin.
  * `status: 'hidden'` allowed for uploaders too.
  * Setting `isFeatured: true` on row B inside a transaction un-features
    row A. The partial unique index
    `proposal_media_featured_unique (proposal_id, kind) WHERE is_featured`
    is the belt-and-braces guarantee.
* `DELETE /api/proposals/:id/media/:mid` requires author / uploader /
  admin. The file and its thumbnail are unlinked best-effort.

## Public share routes

`GET /p/:pid/(podcast|video)/:mid` is an unauthenticated server-rendered
HTML page with:

* `<title>` and an `<h1>` of the proposal question
* `<meta property="og:title|description|image|video|audio>` tags
* `<meta name="twitter:card|title|description|image>` tags
* Inline `<audio>` or `<video>` player
* "Διαβάστε όλη την πρόταση & ψηφίστε →" CTA back to the proposal

Tested against Facebook / X / Threads / WhatsApp / Telegram — each
generates the right card.

## Storage

```
AGORAX_MEDIA_DIR/        # default ./uploads/media
└── <proposal_id>/
    ├── podcast-<hash>.mp3
    ├── video-<hash>.mp4
    └── video-<hash>.jpg     # poster frame, 1 s into the video
```

`AGORAX_MEDIA_DIR` is configurable via env. The directory is mounted
into the container via the `uploads_data` volume in
`docker-compose.yml` so a container restart doesn't lose anything.

## Required system binaries

* `ffmpeg` — for the JPEG poster extraction (`-ss 1 -vframes 1`).
* `ffprobe` — for the validation pass (`format`, `duration`,
  per-stream `codec_type`).

Both ship in the same `ffmpeg` package on Debian / Ubuntu / Alpine.
The Dockerfile currently does **not** install them — when you deploy,
add:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
```

If they're missing at runtime, uploads still succeed (duration is left
null, no thumbnail) and the warning lands in `server.out`.

## What's out of scope

* No transcoding. Whatever the user uploads is what gets served. If
  someone uploads an MOV the player still picks it up — most browsers
  handle MP4-via-MOV containers fine, but if it ever becomes a real
  issue add a transcode job, don't second-guess the format here.
* No CDN. Local disk + nginx caching is sufficient for the pilot. A
  CDN would change the cache-busting story (currently relies on the
  immutable content-hash URL).
* No moderation queue. The author + uploader gates are the only
  filter. A flag-and-review workflow would be a separate feature.
