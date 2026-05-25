# Record of Processing Activities (ROPA)

**Article 30 GDPR.** Single table for the closed AgoraX instance.

| Field | Value |
|---|---|
| Controller | AMKE "Restart Democracy" (Greece) |
| Contact | Miltos Triantafyllou (controller representative) |
| Joint controllers | None |
| Representative in EU | N/A (controller is in EU) |
| DPO | Not appointed at this scale (≤1000 members) — re-evaluate above 5000 |
| Document version | 2026-05-25 |

---

## Processing activities

| # | Activity | Data subjects | Data categories | Art. 9? | Purpose | Lawful basis | Retention | Recipients / processors | International transfers | Security |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Account registration + auth** | AMKE members | Username, name, email, hashed password (or OAuth provider+id), profile picture | No | Account identification + authentication | Art. 6(1)(b) contract | Until account closure + 30 days, then anonymise | VPS host | None (EU host required) | scrypt hashing, PostgreSQL sessions, rate limiting |
| 2 | **Consent capture** | AMKE members | Consent version, text hash, locale, accepted_at, withdrawn_at | No | Evidence Art. 9(2)(a) lawful basis | Art. 6(1)(c) legal obligation (own ROPA / Art. 7 evidence) | Indefinite (audit log) — retained beyond account closure to defend lawfulness of historical processing | VPS host | None | Append-only table, no UPDATEs except withdrawnAt |
| 3 | **Gov.gr identity verification** | AMKE members opting into verified status | In transit: PDF; persisted: salted AFM hash, salted doc-code hash, name, municipality, postcode, verified_at | No (hashes pseudonymous) | One-person-one-vote integrity | Art. 6(1)(c) + 9(2)(a) consent | While account active; hashes survive account anonymisation to prevent re-registration | Python ballot service (same-instance Docker), VPS host | None | PDF never persisted (in-memory only); SALT_KEY required env var; signature verified via pyHanko |
| 4 | **Proposal authorship** | AMKE members | creator_id, question, solution, amendments, finalText | **YES** (political opinion) | Direct-democracy deliberation | **Art. 9(2)(a) consent** + 9(2)(d) association | Indefinite — proposals are the historical record of the assembly | VPS host | None | `requireConsent` middleware blocks pre-consent authoring |
| 5 | **Debate contributions** | AMKE members | author_id, content, support/oppose votes | **YES** | Deliberation | Art. 9(2)(a) + 9(2)(d) | Indefinite (with the proposal) | VPS host | None | Same gate |
| 6 | **Voting (consultative)** | AMKE members | user_id, choice, weight, cast_at, hash chain row | **YES** | Member preference on proposals | Art. 9(2)(a) + 9(2)(d) | Indefinite (append-only, hash-chained); erasure post-close via crypto-shred | VPS host | None | Hash chain (tamper-evidence); pseudonymous-not-anonymous — see DPIA §6.1 |
| 7 | **Sortition** | AMKE members | member id, attendance, feedback, scores | No | Random selection for deliberative review | Art. 6(1)(f) legitimate interest in fair process | Indefinite (governance record) | VPS host | None | Random selection auditable in `sortitionMembers` table |
| 8 | **Democracy Points participation ledger** | AMKE members | user_id, action, points, timestamp | No | Incentive design + redemption tracking | Art. 6(1)(f) | Append-only; erasure via crypto-shred (nullify user FK) | VPS host | None | Append-only, redemption gated by identity verification |
| 9 | **Abuse defense / activity log** | All visitors who attempt auth | IP, device fingerprint, user-agent, timestamp, action | No | Duplicate-account / takeover defense | Art. 6(1)(f) | 12 months rolling, then drop | VPS host | None | Admin-only access via `isAdmin` flag |
| 10 | **Subject-rights handling** | Members exercising rights | Request reason (optional), timestamp, processed_at | No | Compliance with Art. 15 / 17 | Art. 6(1)(c) | Indefinite (compliance record) | VPS host | None | `erasure_requests` table; access via `GET /api/user/data-export` |

---

## Recipients / processors (consolidated)

| Recipient | Role | DPA required | Status |
|---|---|---|---|
| VPS host (TBD per deployment) | Infrastructure processor | **Yes** | Pending — controller must sign DPA with chosen host |
| Email provider (TBD) | Sub-processor for notifications | Yes | Not yet integrated |
| Google (OAuth) | Identity provider for OAuth signups | Outside controller's processor relationship — the member's relationship with Google is independent. Notice required in Privacy Notice. | Notice to be added |
| ~~OpenRouter / NVIDIA~~ | Was: LLM quality gate | — | **Removed** — see DPIA §6.5 |

No transfers outside the EEA. If the VPS host is non-EEA, that is a §44 transfer and must be reflected here with the SCCs / adequacy decision basis.

---

## Notes

- Activities 4, 5, 6 are the **Article 9 special-category core** — they collectively constitute "processing of political opinions of identifiable persons." DPIA mandatory (delivered: [DPIA.md](DPIA.md)).
- This ROPA must be re-issued on any of: new processor, schema change touching the Art. 9 tables, lawful-basis change, retention change, or annually.
