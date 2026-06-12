# DPIA Stub — Polling Module (Panel & Surveys)

Status: **stub** — generated alongside the data model (migration 0031).
To be completed by the controller before scaling the panel beyond pilot
size. Companion to the platform DPIA ([DPIA.md](DPIA.md)) and the anonymous
voting design ([04_ANONYMOUS_VOTING_DESIGN.md](04_ANONYMOUS_VOTING_DESIGN.md)).

## 1. Processing description

| Aspect | Description |
|---|---|
| Purpose 1 | Panel membership: enrollment ledger + acquisition channel (identity side) |
| Purpose 2 | Polling: demographic profile + survey responses (anonymous side) |
| Purpose 3 | Piggyback module: 2–3 platform questions carried by every poll |
| Data categories | Political opinions (Art. 9), demographics incl. 2023 past vote, calibration items |
| Legal basis | Explicit consent, Art. 9(2)(a) — **separate** consent text/version per purpose (`shared/polling.ts` POLLING_CONSENT_*), recorded in `user_consents` as `polling-<version>` |
| Storage | `panel_enrollments` (identity side); `panelists`, `panel_profiles`, `survey_responses`, `survey_item_answers` (anonymous side, `agorax_vote` role) |

## 2. Unlinkability design

- Enrollment via RFC 9474 blind signature: the server signs a blinded token
  while authenticated; the panelist registers with the unblinded token on an
  unauthenticated route with credentials omitted. The operator can prove
  *that* a user enrolled, never *which* panelist they became.
- One-enrollment-per-user enforced on the identity side (unique ledger);
  no second blind signature is ever issued.
- The points claim (`survey_responses.claim_code_hash`) discloses only
  "user X completed poll Y (quality passed)" — equivalent to the existing
  vote issuance ledger disclosure, accepted in the platform DPIA.

## 3. Residual risks (to assess before scale)

1. **Timing correlation at enrollment.** Unlike anonymous voting (30-minute
   minimum delay), panel registration follows the blind signature within
   seconds. An operator logging both requests could correlate by timestamp.
   *Mitigation candidates:* client-side randomized delay; batch issuance
   windows. **Accepted for pilot, must revisit.**
2. **Profile as quasi-identifier.** age × gender × NUTS-2 × education ×
   urbanity × past vote can be near-unique in small regions. Mitigations in
   place: no demographic cross-tabs rendered in v1; `K_ANONYMITY_FLOOR`
   suppression on all displayed results; profile lives only on the
   anonymous side. *Before any cross-tab feature ships, a formal
   k-anonymity analysis of the panel is required.*
3. **Module context tags.** Responses carry the host poll's topic tag —
   harmless for analysis, but combined with timestamps could narrow a
   panelist's browsing pattern. Low risk; monitor.
4. **Channel attribute through the blind flow.** The acquisition channel is
   self-carried into registration (4 values ≈ 2 bits). Documented,
   accepted.

## 4. Data subject rights

- **Withdrawal**: leaving the panel = client discards the token; the
  panelist row can be set `status='left'` via a panel-token request (the
  operator cannot do it per-user, by design). Enrollment-ledger erasure
  follows the platform's Art. 17 process.
- **Access/portability**: profile + responses retrievable via the panel
  token (`/api/panel/me`); without the token the operator cannot locate a
  specific person's responses — this limitation is inherent to the
  unlinkability guarantee and must be stated in the privacy notice.

## 5. Open actions

- [ ] Controller review + sign-off before recruiting beyond pilot
- [ ] Privacy-notice section for the panel (mirror consent text)
- [ ] Enrollment timing-correlation mitigation decision (risk 1)
- [ ] k-anonymity analysis gate before any demographic cross-tab feature
- [ ] Retention schedule for responses of departed panelists
