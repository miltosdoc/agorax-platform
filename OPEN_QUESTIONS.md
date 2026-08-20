# Open Questions — AgoraX

Compiled: 2026-04-23

---

## Design & Technical Questions

### D1. Community Verification
**Source:** `community-types.md`
**Question:** How do we verify a community claiming to represent a real institution (e.g., "Citizens of Kalamaria Municipality", "Thessaloniki University Students Association") actually does?
**Decision (2026-04-23):** Use OpenStreetMap (or similar geospatial data) to pre-populate standard communities per Greek administrative divisions (cities, municipalities, regions). Custom communities still allowed on top. Eliminates manual verification for geographic entities.
**Status:** ✅ DECIDED — OSM-based pre-population.

### D2. Initial Governance Model
**Source:** `community-types.md`
**Question:** What is the default governance model for a new autonomous community?
**Proposal:** Start with no-admin model. Community can vote to appoint admins, define their rights, revoke them, or return to no-admin. Cannot vote to strip members of rights (no dictatorship).
**Status:** Proposal exists, not yet implemented.

### D3. Admin Rights Escalation
**Source:** `community-types.md`
**Question:** Can admins increase their own rights after community creation?
**Proposal:** No. A community can only become more autonomous over time, never less. Admins cannot self-escalate privileges.
**Status:** Proposal exists, not enforced in code.

### D4. Real Institution Communities
**Source:** `community-types.md`
**Question:** What happens when a community corresponds to a real institution with its own membership rules? Can the institution's real-world membership decisions override the platform's?
**Example:** A real association removes someone as a member — should the platform reflect that?
**Status:** Unresolved.

### D5. LLM Tiered Validation Scoring
**Source:** `features/ai.md`, `PHASE2_RESEARCH.md`
**Question:** The tiered scoring logic (<20% returned, >90% auto-approved, 20-90% → sortition) is documented but not yet implemented. What thresholds are final?
**Status:** Deferred to Phase 3.1. Current implementation only does structuring (extract problem/solution/evidence), not scoring.

### D6. LLM Backend Configuration
**Source:** `PHASE2_RESEARCH.md`
**Question:** Which LLM backend? Ollama (local, PHI-safe), OpenRouter (production), Anthropic? Configurable per community?
**Status:** Unresolved. Current code has no backend wired up.

### D7. Similar Proposal Merging
**Source:** `00_Πληρης_Τεκμηριωση.md` (Open Question #1)
**Question:** How are similar proposals merged? AI detection + author confirmation, or sortition body decides?
**Status:** Unresolved. Schema has no merge tracking.

### D8. Scorer Awareness of Similar Proposals
**Source:** `00_Πληρης_Τεκμηριωση.md` (Open Question #2)
**Question:** Should sortition scorers be shown similar proposals when evaluating?
**Proposal:** Yes, via smart search in sortition UI.
**Status:** Proposal exists, not implemented.

### D9. Small Community Threshold (<100 Members)
**Source:** `00_Πληρης_Τεκμηριωση.md` (Open Question #4)
**Question:** What happens when a community has fewer than 100 members? Votes may be invalid if minimum participation threshold (e.g., 10%) can't be met.
**Options:**
- No voting until threshold reached (frustrating for early adopters)
- Allow "idea circulation" mode (no binding votes, just discussion)
- Configurable per community
**Status:** Unresolved.

### D10. Vote vs. Discussion-Only Mode
**Source:** `00_Πληρης_Τεκμηριωση.md` (Open Question #5)
**Question:** Should communities be able to choose between voting mode and discussion-only mode per topic?
**Status:** Unresolved. Current state machine always leads to voting.

### D11. Debate Like/Dislike During Live Mode
**Source:** `00_Πληρης_Τεκμηριωση.md` (Open Question #3)
**Question:** Should debate arguments have like/dislike during live debate?
**Status:** Supported via `proposal_support` table, but live debate mode not implemented.

### D12. Sortition Timeout & Replacement Logic
**Source:** `procedures/sortition.md`
**Question:** What happens when sortition members don't respond within the deadline? Replace with backups? Extend deadline? Skip?
**Status:** Schema has `responded` boolean but no replacement logic implemented.

### D13. Amendment Merge/Reject with Author Veto
**Source:** `procedures/proposals.md`
**Question:** Author has veto over amendments. What if author vetoes all amendments? Does the proposal proceed as-is or get flagged?
**Status:** Schema has `author_veto` field, but workflow not implemented.

### D14. Conflict of Interest in Sortition
**Source:** `PHASE2_RESEARCH.md`
**Question:** For certain proposal types (land use, financial decisions), selected sortition members must disclose conflicts and may recuse themselves.
**Status:** Deferred to Phase 3. Schema has `recused` status but no disclosure mechanism.

### D15. Frontend Page Wiring
**Source:** README.md Phase 5
**Question:** Community list, proposal form, and debate arguments components exist but are not wired into App.tsx routes or bottom-nav.
**Status:** Components exist, routing not connected.

### D16. Admin Action Logging
**Source:** README.md Phase 6
**Question:** Democracy score tracks admin intervention, but there's no admin action logging table to feed it.
**Status:** Not implemented. Democracy score currently returns a static default.

### D17. Groups → Communities Migration
**Source:** internal merge planning (not published)
**Question:** Existing `groups` table and `group_members` need to migrate to `communities` and `community_members`. How?
**Status:** Not implemented. Both systems coexist.

### D18. Jobs Table Migration
**Source:** `migrations/0001_add_jobs_table.sql`
**Question:** Migration file exists but hasn't been applied to production DB.
**Status:** Pending.

---

## Political & Governance Questions

### P1. Exclusion Policy
**Source:** `PHASE2_RESEARCH.md` Q3
**Question:** Who is excluded from voting? Non-citizens? Greeks abroad? Minors? Digitally excluded?
**Current State:** Implicit policy — if you can get a gov.gr signed PDF, you're eligible. No explicit age/citizenship checks in schema.
**Status:** Partially resolved. Relies on gov.gr verification as proxy. Phase 3/4 consideration for explicit handling.

### P2. Legal Status of Outcomes
**Source:** `PHASE2_RESEARCH.md` Q9
**Question:** Are voting outcomes advisory to municipalities? Binding in any context? Requires legislative work.
**Status:** Unresolved. Platform currently has no legal framework.

### P3. Trustee Selection for High-Stakes Votes
**Source:** `PHASE2_RESEARCH.md` Q8
**Question:** For cryptographic voting (Helios/ElectionGuard), which universities, civil society organizations, or international observers serve as distributed trustees?
**Status:** Deferred to Phase 3. No formal agreements.

### P4. Funding & Sustainability Model
**Source:** `PHASE2_RESEARCH.md` Q10
**Question:** Public funding? Municipal contracts? Philanthropic? Hybrid? The "wage for participation" idea from ancient Athens + sortition is mentioned but unexplored.
**Status:** Unresolved.

### P5. Gov.gr Integration — Formal MoU
**Source:** `PHASE2_RESEARCH.md` Q1
**Question:** Is there a formal MoU with Ministry of Digital Governance for using gov.gr Solemn Declaration? Current approach (user uploads signed PDF, we validate PAdES signature) works technically but may need formal agreement for scale.
**Status:** Partially resolved. Technical implementation exists; legal agreement pending.

### P6. DPIA (Data Protection Impact Assessment)
**Source:** `PHASE2_RESEARCH.md` Q2
**Question:** Has a formal DPIA been commissioned? Required before public launch under GDPR.
**Status:** Privacy policy exists; formal DPIA not yet commissioned.

### P7. Greeks Abroad
**Source:** `00_Πληρης_Τεκμηριωση.md`
**Question:** How do Greeks living abroad participate? Geofencing may exclude them. gov.gr verification works remotely, but is that sufficient?
**Status:** Phase 3 consideration.

### P8. Minors
**Source:** `00_Πληρης_Τεκμηριωση.md`
**Question:** Can minors (17 and under) participate? gov.gr doesn't issue Solemn Declaration PDFs to minors.
**Status:** Phase 3 consideration.

### P9. Digitally Excluded
**Source:** `00_Πληρης_Τεκμηριωση.md`
**Question:** Elderly, rural, or otherwise digitally excluded citizens — how do they participate?
**Status:** Unresolved. No offline participation mechanism.

### P10. Initial Growth Strategy
**Source:** `00_Πληρης_Τεκμηριωση.md`
**Question:** How to reach the 10% participation threshold before votes become valid? Core group of ~1000? Friendly organizations? Paid participation?
**Status:** Unresolved. Critical for launch viability.

### P11. Participation Incentives
**Source:** `00_Πληρης_Τεκμηριωση.md`
**Question:** Should there be financial incentives ("μισθοφορία συμμετοχής") or crypto tokens for participation? Ancient Athens paid jurors.
**Status:** Unresolved. Raises questions about vote buying vs. legitimate compensation.

### P12. Platform Governance
**Source:** Implicit
**Question:** Who governs the platform itself? The platform working group? A foundation? The code is open-source but deployment and domain ownership are centralized.
**Status:** Unresolved.

---

## Summary

| Category | Count | Resolved | Partially Resolved | Unresolved |
|----------|-------|----------|---------------------|------------|
| Design/Technical | 18 | 4 | 3 | 11 |
| Political/Governance | 12 | 0 | 2 | 10 |
| **Total** | **30** | **4** | **5** | **21** |

**Highest Priority (blocks launch):**
- D9 (Small community threshold)
- P1 (Exclusion policy)
- P6 (DPIA)
- P10 (Initial growth strategy)

**Deferred to Phase 3:**
- D5 (LLM scoring thresholds)
- D14 (Conflict of interest)
- P3 (Trustee selection)
- P7 (Greeks abroad)
- P8 (Minors)
