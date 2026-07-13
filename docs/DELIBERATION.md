# Deliberation: amendments, counter-proposals, and final-text synthesis

How a proposal moves from draft to ballot, who decides what along the way,
and how the final text and the ballot options are produced.

## Lifecycle (short deliberation track)

```
draft → review (LLM validation) → community_signal (deliberation) → voting → decided
                                        └→ sortition_synthesis → voting   (opt-in, see Synthesis modes)
```

- **review** — the LLM scores the proposal. Low confidence returns it to the
  author (`draft`), mid confidence opens deliberation (`community_signal`),
  high confidence auto-approves straight to `voting`.
- **community_signal** — the single deliberation phase (default 48h,
  configurable per community). Everything below happens here.
- **voting** — the ballot is frozen; no further amendments.

Each timed phase has a deadline; a background job (`phase_auto_advance`)
moves expired proposals forward automatically. Nobody has to press anything.

## Amendments (τροπολογίες) and counter-proposals (αντιπροτάσεις)

Any community member can submit either during deliberation:

| | Amendment | Counter-proposal |
|---|---|---|
| Intent | improve/change the proposal text | a competing alternative vision |
| Reviewed by | the **proposal author** (accept / reject with justification) | the proposal author (accept / reject) |
| If accepted | AI merges it into the final text | it is restyled by AI and becomes a **separate ballot option** |
| If rejected | members vote ⬆️ disagree / ⬇️ agree with the rejection; ≥ max(threshold, 70%) disagreement = community override → included anyway | same override rule → stands on the ballot anyway |
| UI colour | default card | **violet accent** (`antip` design token), in the deliberation panel and on the ballot |

Unreviewed (pending) amendments are dropped when the phase ends, unless the
community sets `amendmentInclusionThreshold` below 1 — then a pending
amendment whose popularity ratio reaches the threshold is merged even
without the author's decision.

### Amendments ON a counter-proposal

A member can amend a specific counter-proposal (button «Τροπολογία στην
αντιπρόταση» on the counter's card). Rules:

- **One level only.** A counter-proposal cannot receive a counter-proposal,
  and amendments-on-amendments are not allowed.
- The **counter-proposal's author** reviews these amendments (accept /
  reject), inline in the amendments panel. Rejections are open to the same
  community override vote.
- Qualifying ones (accepted or community-overridden) are folded into the
  counter-proposal by the AI when it is restyled for the ballot — exactly
  like the main proposal absorbs its own amendments.
- They never touch the main proposal's final text.

### The ballot

When deliberation ends, `buildBallotOptions` freezes the ballot:

- No qualifying counter-proposal → classic **yes / no / abstain** vote on the
  merged final text.
- Otherwise a single-choice option ballot: **«Η τελική πρόταση»**, each
  qualifying counter-proposal (**«Αντιπρόταση N»**, violet accent), and
  **«Καμία αλλαγή»** (status quo).

## Synthesis modes (per-community setting `synthesisMode`)

Who produces the final text after deliberation:

- **`ai` (default for every community).** The AI merges accepted +
  community-overridden amendments into the vote-ready text and restyles
  qualifying counter-proposals; the vote opens immediately at phase end.
- **`sortition` (opt-in).** When flagged amendments exist, a drawn jury
  (`sortition_synthesis`, default 12 members) synthesizes the final text.
  **AI is always the fallback:**
  - jury cannot form (not enough eligible members — e.g. small communities) →
    AI synthesizes and the vote opens;
  - jury does not respond within `sortitionResponseHours` (default 72h) →
    the AI-prefilled text stands and the vote opens. A silent jury can no
    longer archive a proposal.

The setting lives in community settings (managed communities: admin edit;
autonomous communities: liquid member vote like every governable setting).
Requests to enter `sortition_synthesis` in an `ai`-mode community are
transparently routed to `voting`.

## Advancing the phase manually

The proposal author or a community admin/founder can fast-forward the
deliberation phase from the community-signal page. Safeguards:

- Members without that role don't get the button; the phase advances
  automatically at the deadline.
- While amendments are still awaiting review **and** the deadline has not
  passed, the server refuses the fast-forward (409 `pending_amendments`);
  the UI also warns and asks for confirmation.

## The AI prompts are load-bearing

All merge behaviour is encoded in four Greek prompts in
`server/utils/ai-merger.ts` — changing them changes the democracy:

- `MERGE_PROMPT` — integrates accepted amendments into one coherent text
  (never as appended blocks; removals remove, replacements replace).
- `RESTYLE_PROMPT` — rewrites a counter-proposal to match the final text's
  structure so the ballot comparison is fair, **without diluting its
  substance**, folding in the counter's own accepted amendments (rule 4).
- `REFINE_PROMPT` — the author's constrained edit; incorporated community
  amendments are passed as inviolable and cannot be weakened.
- The validation prompt (`llm-validation.ts`) — scores proposals into
  return / deliberate / auto-approve.

If the LLM is unavailable, merges fall back to a deterministic concatenation
(`localConcat`) and counter-proposals keep their original text, so the flow
never blocks on the LLM.
