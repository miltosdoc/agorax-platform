# Polling Module — Open Digital Polling Platform

AgoraX's self-serve civic measurement tool: verified humans + LLM-compiled
questionnaires + radical methodological transparency. This documents the v1
implementation; the GDPR analysis lives in
[compliance/DPIA_POLLING.md](compliance/DPIA_POLLING.md).

## Two tiers — hard separation

| | Community | Certified |
|---|---|---|
| Authored by | any user, via the LLM Poll Compiler | platform methodologist (`POST /api/admin/surveys`) |
| Wording | LLM-generated one-offs + bank items | question-bank items (canonical, versioned) |
| Visual identity | amber «Κοινοτική · Ανεπίσημη» badge everywhere | «Πιστοποιημένη» badge |
| Published as findings | never | yes — the only tier that is |

No published horse-race levels in v1 by design — the sellable outputs are
longitudinal trends (`/surveys/trends`), within-panel comparisons, and
message/segment testing, which are robust to panel-selection bias.

## Anonymous panel

Enrollment mirrors anonymous voting (RFC 9474 blind signatures,
`shared/blind-sig.ts`):

1. `GET /api/panel/enroll/key` (authenticated) → enrollment public key
2. client blinds a fresh token; `POST /api/panel/enroll/sign` (authenticated)
   checks the **one-enrollment-per-user ledger** (`panel_enrollments`),
   records the polling-purpose consent, signs blind
3. client unblinds; `POST /api/panel/register` (**unauthenticated**,
   credentials omitted) creates the panelist keyed by `sha256(token)`,
   together with the demographic profile

The identity side knows *that* a user enrolled (and their acquisition
channel); it cannot know *which* panelist they became. The token lives in
the browser's localStorage (`agorax_panel_token_v1`) and is the bearer
credential (`X-Panel-Token`) for instruments and responses. All anonymous-
side tables are accessed through the `voteDb` connection (the `agorax_vote`
role that cannot read identity tables, where the storage split is applied).

**Device transfer**: because the server cannot link panelist↔user, it also
cannot sync the identity across devices. `/panel` on the enrolled device
reveals the identity code; `/panel` on a second device imports it
(validated against `/api/panel/me` before storing). The member carries the
secret themselves.

**Ops notes**: the anonymous routes (`/api/panel/register`,
`/api/panel/profile`, `/api/surveys/:id/respond`) are CSRF-exempt — they
deliberately carry no session, so there is none to protect — and excluded
from request logging (timing-correlation hygiene, same as blind-sign). The
cookieless client fetches send `ngrok-skip-browser-warning`, or ngrok's
free-tier interstitial would swallow them.

**Profile** (once at onboarding, annual refresh prompt): age band, gender,
NUTS-2 region, education, urbanity, 2023 past vote (recall-flagged), plus
calibration benchmarks with known ELSTAT values (smoking, household car,
household size). Vocabularies in `shared/polling.ts`.

**Recruitment source tags**: every panelist is permanently tagged
(organic / paid / referral / partner). Published (`cohort='published'`)
results use organic+paid only; partner cohorts exist solely in the
private `cohort='all'` computation.

## LLM Poll Compiler (`server/utils/poll-compiler.ts`)

Two **separate** model calls — the generator never grades its own homework:

1. **Generator**: NL intent → strict JSON (`compiledSurveySchema`, zod),
   with API-level JSON mode (`response_format: json_object`) on top of the
   schema validation. Hard rules in the system prompt: no leading/
   double-barreled questions, balanced likert scales, deliberate
   randomization flags, loaded-language ban. Schema failures get one
   repair round with the validator errors fed back — output is never
   silently patched.
2. **Adversarial reviewer**: attacks the generated survey (push-poll,
   leading, unbalanced scale…). A `block` verdict triggers a **neutral
   rewrite** (the objections go back to the generator with the previous
   draft as context) and a re-review. The compiler's job is to BUILD A
   DRAFT: remaining objections ship as visible flags on the preview and
   freeze into the methodology page — they never block the creator. Only
   the generator's own refusal of outright propaganda intent rejects
   (kept as `gatekeeper_flagged` rows for audit).

The draft is **fully editable** before fielding (`PATCH /api/surveys/:id`:
title, wording, options, item deletion; edits recorded as
`compilerMeta.creatorEdited`). An attention check is inserted
**mechanically** (canonical Greek wording, machine-checkable expected
answer) — never by the AI; it and the module items stay non-editable. With
no LLM configured the compiler falls back to a deterministic single-scale
build, recorded as `compilerMeta.generator='fallback'`.

## Question bank & piggyback module

- `question_bank`: canonical wording, `unique(code, version)`. Rows are
  immutable — a wording change is a **new version**, never an edit.
  Trackers are character-identical across waves by construction.
- `module_items`: the rotating piggyback pool (v1: 4 trackers + 2
  benchmarks, seeded by `scripts/seed-question-bank.ts`).
- Every poll carries the module **first**, fixed internal order, before the
  host topic is visible (order-effect control). Disclosed in the consent
  text and in the runner UI.
- **Planned missingness**: each respondent answers a deterministic subset
  (3 of 6): `sha256(panelistId:poolVersion:itemId)` ranks the pool;
  assignment is per-respondent (stable across polls → unbroken
  within-person time series, item assignment orthogonal to host topic) and
  materialized in `module_assignments` for audit.
- Module answers carry the host poll's `topicTag` (on the response row)
  for context-effect analysis.

## Survey engine & quality gate

Per-respondent instrument (`GET /api/surveys/:id/instrument`): option order
randomized by a per-response seed where the item allows it; «Δεν ξέρω/Δεν
απαντώ» options stay pinned last; answers are **canonical indexes**, so
marginals never need de-shuffling.

On submission (`POST /api/surveys/:id/respond`), server-side quality gate:

- **speeder** — server-measured duration < 1.5s × items (client timings are
  never trusted for this);
- **straight-liner** — ≥4 *fixed-order* scale items on the same index
  (randomized items are excluded: same canonical index there is a different
  screen position);
- **attention** — the mechanical check answered wrong.

Failed responses are stored but excluded from all marginals (the count is
reported in the methodology block) and earn no points.

**Democracy Points** are quality-gated: a passing response returns a
one-time claim code; `POST /api/surveys/:id/claim` (authenticated) burns it
and awards `survey_complete` (40 points, 20/30-day cap). The identity side
learns only "user X completed poll Y" — the same disclosure class as the
blind-sig vote issuance ledger.

## Weighting (`server/stats/raking.ts`)

Raking (IPF) on profile strata against ELSTAT-derived margins
(`server/stats/population-margins.ts` — **approximate, refine before any
certified output**). Hygiene: empty-cell margin collapse, weight trimming
to [0.3, 3], Kish effective n + design effect on every output. Past-vote
weighting is **opt-in per analysis** (recall-biased), never in the default.

Raw and weighted marginals are stored and displayed **together**, always
with n / effective n / design effect. Weighted output requires ≥30
completes (`MIN_WEIGHTED_N`); any display requires ≥5 (`K_ANONYMITY_FLOOR`).

Hybrid stats layer: set `STATS_SIDECAR_URL` to delegate weight computation
to the Python sidecar (`stats-sidecar/main.py`, stdlib-only, port 8077);
any sidecar failure falls back to the in-process TS engine. The sidecar is
the seam where MRP (Stan/brms) lands later — the input shape (one row per
respondent, clean categorical strata) is already MRP-friendly.

## Methodology auto-page

Frozen onto the poll row at close: n, quality exclusions, field dates,
cohort note, weighting method/variables/effective-n/design-effect/trimming,
exact question wording (host + module), compiler provenance, gatekeeper
verdict, piggyback disclosure. Rendered on the poll detail page — it is a
first-class feature, not an afterthought.

## Routes & pages

| | |
|---|---|
| `/surveys` | hub: live/closed/mine + panel CTA |
| `/surveys/new` | NL intent → compile → preview → field |
| `/surveys/:id` | detail, lifecycle actions, results (raw+weighted bars), methodology |
| `/surveys/:id/take` | mobile-first runner (module disclosure, per-item timing) |
| `/surveys/trends` | internal tracker trends, wave-over-wave (admin) |
| `/panel` | consent + profile + blind-signature enrollment |

## Operations

```bash
psql "$DATABASE_URL" -f migrations/0031_polling_module.sql   # schema
npx tsx scripts/seed-question-bank.ts                        # bank + module pool v1
npx tsx scripts/e2e-poll-test.ts                             # full-flow test (48 panelists)
python3 stats-sidecar/main.py                                # optional sidecar (:8077)
```

Out of scope for v1 (per the build directive): MRP estimation, payments,
public API, media embeds, and the calibration/house-bias monitoring jobs
(benchmark drift + election-error pages) beyond the stored benchmark data
that already supports them.
