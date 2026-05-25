# GDPR Formalization Brief — AgoraX (Closed Movement Instance)

**Audience:** Hermes Agent
**Owner:** Miltos (controller representative, AMKE "Restart Democracy")
**Scope:** The closed direct-democracy instance, 100–1000 verified members.
**Goal:** Produce the *evidence* that GDPR controls exist — and, where the evidence reveals a gap, fix or formally accept the gap. This is an audit disguised as documentation. Do not generate compliance theater.

---

## 0. Operating principle (read first)

Most of the security controls are claimed to exist already. Your job is not to assume they do. For every control referenced below you will:

1. Locate it in the codebase (cite file + symbol).
2. Confirm it does what the document will claim it does.
3. If it does not, either (a) open a remediation task, or (b) record an explicit, signed-off residual-risk acceptance in the DPIA.

A document that asserts a control the code does not implement is worse than no document — it is evidence of negligence. Verify, then write.

---

## 1. CRITICAL FINDING — resolve before the DPIA is signed

The README claims vote/identity unlinkability is part of the design. The shipping configuration contradicts this.

- Default `VOTING_BACKEND=hash-chain` stores votes in cleartext (per README: "Votes are cleartext").
- `electionguard` backend is Development status; full vote privacy (client-side encryption) is explicitly "a later phase — not for binding elections yet."
- The account record links a real verified identity (name, DOB, place of birth, residence) plus a salted AFM hash to the member.

Therefore: in the default deployment, the host can reconstruct *"member X cast vote Y on proposal Z."* That is processing of political opinions linked to identifiable persons — Article 9 special-category data, in a politically sensitive context.

### Required action (pick one, document the choice)
- **A — Architectural fix:** make ballots unlinkable from identity at rest before binding votes run. Determine whether this is achievable with the current electionguard backend or requires the planned client-side encryption phase. If not ready, binding votes must not run on cleartext.
- **B — Pseudonymity, honestly labelled:** if votes remain linkable, the DPIA must state that ballots are pseudonymous, not anonymous, that the linkage is a known residual risk, list the exact access paths that can re-link (admin DB, server logs, join tables), and document the compensating controls (access control, audit log, encryption at rest) plus an explicit risk acceptance.

Do not describe the system as providing vote anonymity unless option A is verified true. Investigate `server/voting/`, `packages/voting-sdk/`, and `docs/VERIFIABLE_VOTING_SDK_PLAN.md` and report which state we are actually in.

---

## 2. Controller, jurisdiction, supervisory authority

- **Controller:** AMKE "Restart Democracy" (Greece) — confirm this is the legal entity processing member data, not a Swedish entity.
- **Supervisory authority:** Greek HDPA (Hellenic Data Protection Authority). Note that members resident in Sweden do not change the lead authority but should be acknowledged.
- **Lawful basis for Art. 9 data:** explicit consent (Art. 9(2)(a)) and the not-for-profit political/association carve-out (Art. 9(2)(d)) — the latter covers members only, only for internal purposes, and only if data is not disclosed externally without consent. State both; rely primarily on 9(2)(d) for membership processing and 9(2)(a) as backstop.

Flag for Miltos if the controlling entity is ambiguous — it determines every downstream document.

---

## 3. Deliverables

Produce these as Markdown in `docs/compliance/`. Keep them short; this is a ≤1000-member closed instance, not an enterprise.

### 3.1 DPIA.md — Data Protection Impact Assessment (KEYSTONE)
Required because we process special-category data (political opinion) at scale. This document does the real work; the others derive from it.

**Sections:**
- **Processing description** — what data, what operations (deliberation, sortition, voting, Democracy Points), data flow across the three services (Node API, FastAPI ballot service, PostgreSQL).
- **Data inventory** — enumerate every personal-data field actually persisted. Verify against `shared/` (Drizzle schema) and `migrations/0000…0013`. Explicitly list: identity set (name, DOB, place of birth, residence), AFM salted hash, vote records, Democracy Points ledger, debate/amendment authorship, session data, audit logs. Confirm what is NOT stored (ID-card number, parents' names, phone, street) by checking the ballot service extraction code.
- **Gov.gr declaration handling** — does the uploaded Υπεύθυνη Δήλωση PDF get deleted after validation, or retained? If retained, where, for how long, encrypted? This is a high-risk item — the raw PDF contains everything we claim not to store. Verify in `ballot_service/`.
- **Necessity & proportionality** — justify each field against purpose. Flag anything collected "just in case."
- **Risk assessment** — primary risk: member de-anonymisation / exposure of political affiliation. Secondary: AFM-hash reversal, breach of cleartext votes, raw PDF leak. Rate likelihood × severity.
- **Mitigations** — map each risk to a control and cite the implementing code. The vote-linkage risk maps to the §1 decision.
- **Residual risk & sign-off** — what remains after controls, and explicit acceptance.

### 3.2 ROPA.md — Record of Processing (Art. 30)

One table. Columns: processing activity, data categories, special-category flag, purpose, lawful basis, data subjects, recipients/processors, retention period, security measures, transfers outside EEA (should be none — confirm hosting).

List processors: VPS/host provider, any email provider, any LLM provider used by the AI quality gate (important — if proposal text containing personal data is sent to an external LLM API, that is a processor transfer and possibly a special-category disclosure; verify whether the review state uses a local model on the xslco stack or an external API).

### 3.3 PRIVACY_NOTICE.md + CONSENT.md (Art. 13 + Art. 9(2)(a))

- **Privacy notice:** identity of controller, purposes, lawful bases, retention, rights, complaint route (HDPA).
- **Consent artifact:** the exact text a member agrees to at onboarding for processing of political opinions. Must be explicit, specific, freely given, and the consent event must be logged (timestamp + version). Verify the onboarding flow stores this; if not, open a task.
- **Bilingual** (el/en) to match the platform. Check i18n parity.

### 3.4 INTERNAL_POLICIES.md

Short stubs, each a few paragraphs:

- **Access control policy** — who can read identity↔vote linkage; cite the RBAC implementation if it exists.
- **Retention & deletion policy** — per data category; include member-initiated deletion (Art. 17) and how it interacts with the append-only Democracy Points ledger and the hash-chain (deletion vs. tamper-evidence is a genuine tension — address it, don't ignore it).
- **Breach response runbook** — the 72-hour Art. 33 clock. Who decides, who notifies HDPA, how members are informed. Write this before it is needed.

---

## 4. Specific tensions to resolve, not paper over

1. **Right to erasure vs. append-only / hash-chain.** A member's Art. 17 request collides with the tamper-evident vote chain and the append-only points ledger. Decide and document: crypto-shredding (delete the key, keep the structure), pseudonymise-in-place, or documented lawful refusal. Do not claim full erasure if the architecture cannot deliver it.

2. **AFM salted hash = pseudonymous, not anonymous.** A salted hash of a low-entropy national ID is re-identifiable by anyone who can hash candidate AFMs against the stored salt. Confirm the salt is a server-side secret (`SALT_KEY`), not per-record and exposed. State plainly in the DPIA that this is personal data.

3. **LLM quality gate as a data flow.** If proposals (which may contain personal data / political opinion) leave the instance to a third-party model, that is the highest-volume external disclosure in the system. Confirm whether inference is local.

4. **LICENSE inconsistency** (MIT vs CC-BY-NC-4.0 in package.json) — not GDPR, but flag it; legal coherence of the entity matters for the AMKE.

---

## 5. Acceptance criteria

The formalization is complete when:

- [ ] Every personal-data field in the document set maps to a real column/store, verified against schema + migrations.
- [ ] The §1 vote-linkage question is resolved to option A or B, in writing, with code citations.
- [ ] Gov.gr raw-PDF retention behaviour is confirmed and documented.
- [ ] The LLM quality-gate data flow (local vs external) is confirmed.
- [ ] DPIA, ROPA, Privacy Notice, Consent, and Internal Policies exist in `docs/compliance/`, bilingual where member-facing.
- [ ] No document asserts a control that you have not located in the codebase.
- [ ] A single `docs/compliance/README.md` indexes all of the above and lists open remediation tasks.

---

## 6. Out of scope (defer — do NOT build now)

Formal DPO appointment, automated breach notification, consent-management platform, the public/open-platform identity model. At ≤1000 members, manual processes for subject-access and deletion are acceptable and should be documented as such.

---

*Honesty over completeness. A short DPIA that tells the truth about a residual risk is worth more than a long one that hides it.*
