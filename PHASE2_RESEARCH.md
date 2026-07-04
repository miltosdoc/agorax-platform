# Phase 2 Research: Backend — Storage, Routes, Identity, and Verifiable Voting

## Purpose

This document consolidates all research and architectural decisions for implementing Phase 2 of the AgoraX platform: extending the storage interface and API routes to support deliberation features (communities, proposals, sortition, amendments, debate) while establishing the identity, coercion-resistance, and cryptographic-tallying foundations required for a legitimate direct-democracy platform operating at Greek national scale.

This revision incorporates critical architectural decisions made during review:

- **gov.gr as identity provider** with strict identity/action separation
- **LLM as structurer, not gatekeeper** (no auto-rejection based on score)
- **Sortition as advisory panel** (architecturally decoupled from state transitions)
- **Simplified state machine** (5 states, not 11)
- **Time + participation thresholds** for state transitions
- **Coercion resistance** via vote changeability and receipt-freeness
- **Helios-based cryptographic tallying** with distributed trustees
- **Benaloh challenges** for voter verification without receipts
- **Postgres-based job queue** (BullMQ deferred until scale justifies it)

---

## 1. Current AgoraX Architecture

### Storage Layer Pattern (`server/storage.ts`)

- **Interface:** `IStorage` defines ~42 typed methods
- **Implementation:** `PostgresStorage` class implements `IStorage` using Drizzle ORM
- **Pattern:** Each entity has CRUD methods + specialized queries
- **Naming:** `get<Entity>`, `create<Entity>`, `update<Entity>`, `delete<Entity>`, `get<Entity>By<X>`
- **Types:** All methods use Drizzle-generated types from `shared/schema.ts`
- **Query building:** Uses Drizzle `eq`, `and`, `or`, `desc`, `asc`, `inArray`, `sql` operators
- **DB access:** Direct `db.select()` / `db.insert()` / `db.update()` / `db.delete()` calls

### Route Pattern (`server/routes.ts`)

- **Framework:** Express.js with async route handlers
- **Validation:** Zod schemas imported from `shared/schema.ts`
- **Auth:** `req.session.user` checked for authentication
- **Error handling:** `formatValidationErrors()` helper for Zod errors
- **Response:** JSON responses via `res.json()`, redirects via `res.redirect()`
- **Authorization:** Per-route checks (to be replaced with middleware-based role enforcement)

### Existing `IStorage` Methods (Reference)

```
User:         getUser, getUserByUsername, getUserByEmail, getUserByProviderId,
              getUserByVoterHash, createUser, updateUserLocation, updateUser, deleteUser
Poll:         createPoll, getPolls, getUserPolls, getParticipatedPolls, getPoll,
              updatePoll, deletePoll
Survey:       createSurveyPoll, getSurveyPoll, updateSurveyStructure, updateSurveyMetadata
Vote:         createVote, getPollResults, getPollParticipantCount
Comment:      createComment, getPollComments
Group:        createGroup, getGroup, getUserGroups, addGroupMember, removeGroupMember,
              deleteGroup
Notification: createPollNotification, getUserNotifications
Analytics:    getAnalyticsOverview, getPollPopularityStats, getActivityTrends,
              getUsagePatterns
Account:      createAccountActivity, updateUserLoginInfo, getUserAccountActivity,
              getAllUsersWithAccountInfo, updateAccountStatus
Survey:       createSurveyResponse, getSurveyResults
```

---

## 2. Identity Architecture (gov.gr Integration)

### Core Principle: Separation of Identity and Action

The platform must prevent any single database from linking a real citizen to their political opinions, votes, and deliberation activity. This is achieved through a three-layer architecture:

```
┌────────────────────────────────────────────────────────┐
│  LAYER 1: gov.gr + 2FA (External Identity Authority)   │
│  Verifies: personhood, citizenship, registered address │
└────────────────────┬───────────────────────────────────┘
                     │ (one-time verification + periodic re-auth)
                     ▼
┌────────────────────────────────────────────────────────┐
│  LAYER 2: AgoraX Identity Service (Isolated)           │
│  Stores:   citizen_id ↔ pseudonymous_id mapping        │
│  Issues:   eligibility tokens per community            │
│  Access:   tightly restricted, audited, separate DB    │
└────────────────────┬───────────────────────────────────┘
                     │ (eligibility tokens only, no PII)
                     ▼
┌────────────────────────────────────────────────────────┐
│  LAYER 3: AgoraX Deliberation Platform                 │
│  Stores:   pseudonymous_id + all activity              │
│  Never sees: real names, gov.gr IDs, addresses         │
└────────────────────────────────────────────────────────┘
```

### Layer 2: Identity Service Requirements

- **Separate database** from the main platform (ideally separate server, separate credentials)
- **Minimal API surface:**
  - `verifyEligibility(pseudonymous_id, community_id) → token`
  - `issueAnonymousCredential(citizen_id, community_id) → pseudonymous_id`
  - `revokeAccess(citizen_id, reason)` — admin-only, audited
- **Audit log** of every access, with legal retention policy
- **No bulk export** functions. No admin dashboard that shows name ↔ activity mappings
- **Cryptographic unlinkability:** Use blind signatures or anonymous credentials (e.g., IRMA, Idemix) so that even the Identity Service cannot link pseudonymous activity back to citizens without active re-identification

### Geo-Fencing Rules

- **Authoritative source:** Registered residence from gov.gr (not device GPS)
- **Residency requirement:** Minimum 30 days registered in a community before voting eligibility
- **No device GPS** for eligibility decisions (trivially spoofable, excludes travelers)
- **Dual residence:** Citizens may be eligible in one community at a time; switching requires a cool-down period (e.g., 90 days)

### Exclusion Policy (Explicit Decisions Required)

The project must formally decide and document:

- Non-citizens resident in Greek communities: observer / limited / full participation?
- Greeks living abroad: which community? (ancestral village? last registered?)
- Citizens without gov.gr access: assisted access protocol?
- Minors: age threshold for participation? (e.g., 16 for municipal, 18 for national?)

### Operational Dependencies

- **Formal MoU with Greek ministry** (Ministry of Digital Governance) before production launch
- **GDPR Data Protection Impact Assessment (DPIA)** — required; political opinions are Article 9 special-category data
- **Data Protection Officer (DPO)** appointed
- **Contingency plan** for gov.gr outages (cached eligibility tokens with expiry)
- **Identity layer abstraction** — code must support swap to EU eIDAS or other providers

---

## 3. State Machine Design (Simplified)

### Rejecting the 11-State Model

The original research proposed 11 states. This is over-engineered. Real human deliberation does not fit fine-grained states, and premature state modeling creates bugs (stuck proposals, missing transitions). We start with **5 states** and add granularity only when user behavior demands it.

### The 5-State Model

```
draft → review → deliberation → voting → decided
         ↓           ↓             ↓
      archived   archived      archived
```

### State Definitions

| State | Meaning | Entry | Exit |
|-------|---------|-------|------|
| **draft** | Author is composing; not visible to community | Created by author | Author submits, or abandons (→ archived) |
| **review** | LLM-assisted structuring + advisory sortition review | Submission | Advisory panel recommends advance/return, or timeout |
| **deliberation** | Community debates, proposes amendments, supports/opposes | Advance from review | Timer expires with quorum met |
| **voting** | Cryptographic voting period | Deliberation ends | Voting period expires |
| **decided** | Result recorded, immutable | Voting closes | (terminal) |
| **archived** | Abandoned, failed quorum, or withdrawn | Any state | (terminal) |

### Transition Rules

Each state has explicit configuration:

```typescript
interface StateConfig {
  duration_hours: number;              // How long the state lasts
  min_participation: {
    type: 'absolute' | 'percentage';
    value: number;                     // e.g., 10 people or 5% of community
  };
  on_insufficient_participation:
    | 'extend'                          // Extend the timer once
    | 'archive'                         // Abandon the proposal
    | 'escalate_to_admin';              // Community admin decides
  required_events?: string[];           // e.g., 'sortition_recommendation'
}
```

### Example Configurations (per community, overridable per proposal type)

```typescript
const DEFAULT_STATE_CONFIG = {
  review: {
    duration_hours: 72,
    min_participation: { type: 'absolute', value: 5 },    // 5 sortition members respond
    on_insufficient_participation: 'extend',
  },
  deliberation: {
    duration_hours: 336,                                    // 14 days
    min_participation: { type: 'percentage', value: 3 },    // 3% of community engages
    on_insufficient_participation: 'archive',
  },
  voting: {
    duration_hours: 168,                                    // 7 days
    min_participation: { type: 'percentage', value: 10 },   // 10% quorum to pass
    on_insufficient_participation: 'archive',
  },
};
```

### Implementation: Use XState

- Use the **XState** library to formally define the state chart
- Benefits: visual state diagrams, impossible-state prevention, clean side-effect handling, testable transitions
- Prevents bugs like "archived proposal transitioned to voting"

---

## 4. LLM as Structurer, Not Gatekeeper

### Rejecting the Tiered Scoring Model

The original research proposed tiered LLM scoring (<20% return, 20-90% sortition, >90% auto-approve). This is rejected because:

1. **Legitimacy:** An LLM auto-approving or auto-rejecting citizen proposals is algorithmic gatekeeping incompatible with democratic values
2. **Bias:** LLM RLHF training reflects a specific cultural-political worldview; minority viewpoints and non-standard phrasing are systematically penalized
3. **Opacity:** Authors of rejected proposals receive feedback without understanding why the model decided as it did
4. **Trust:** "An AI rejected my proposal" is politically explosive

### New Role: Structural Assistant

The LLM **extracts and presents** information to help human reviewers, but does **not** make accept/reject decisions:

```typescript
interface ProposalStructure {
  problem_statement: string;      // What problem does this address?
  proposed_solution: string;      // What is being proposed?
  evidence_cited: string[];       // What evidence/reasoning is provided?
  scope_assessment: string;       // Is this within community authority?
  similarity_matches: {           // Potential duplicates
    proposal_id: number;
    similarity: number;
  }[];
  flags: string[];                // Potential issues: 'unclear', 'off-topic', etc.
  suggested_category: string;
}
```

### Workflow

1. Author submits proposal → state becomes `review`
2. LLM structures the proposal (async, ~30 seconds)
3. Structured output + original text shown to an advisory sortition panel (5 randomly-selected community members)
4. Panel recommends: `advance to deliberation` / `return to author with feedback` / `flag for admin`
5. State transitions based on **panel recommendation**, not LLM score
6. If panel fails quorum, timer-based escalation to community admin

### Pluggable LLM Backend

```typescript
interface LLMBackend {
  structureProposal(text: string): Promise<ProposalStructure>;
  findSimilarProposals(text: string, communityId: number): Promise<SimilarityMatch[]>;
  suggestAmendmentMerges(amendments: Amendment[]): Promise<MergeSuggestion[]>;
}

class OllamaBackend implements LLMBackend { /* local dev */ }
class OpenRouterBackend implements LLMBackend { /* production */ }
```

Selection via environment variable:
```
LLM_PROVIDER=ollama|openrouter
```

### Prompt Design (Structural, Not Evaluative)

```
You are analyzing a citizen proposal to help human reviewers understand it.
You are NOT deciding whether the proposal should be accepted.

Extract and return:
1. The core problem being raised (in neutral language)
2. The proposed solution (in neutral language)
3. Any evidence or reasoning cited
4. Potential issues a reviewer might want to consider (NOT judgments)

Do not score the proposal. Do not recommend approval or rejection.
Your job is to make the proposal easier to read, not to judge it.

Return JSON matching the ProposalStructure schema.
```

---

## 5. Sortition Architecture (Advisory Panel Model)

### Political Role: Advisory, Not Juridical

Sortition panels in AgoraX are **recommenders**, not deciders. This must be enforced architecturally:

- Panel output is stored as a `sortition_recommendation` object
- State transitions are **never** triggered directly by panel output
- The final decision is made by: (a) community-wide vote, (b) admin accepting the recommendation, or (c) timeout-based default
- **When panel recommendation and community vote disagree, both are displayed publicly** — this tension is a feature, not a bug; it's the legitimacy mechanism

### Historical and Modern References

| Source | Approach | Relevance |
|--------|----------|-----------|
| Athenian Kleroteria | Bronze tablets, dice-based selection | Principle: equal probability for all eligible citizens |
| Irish Citizens' Assembly (2016) | 100 citizens, stratified random | Demographic representativeness |
| Paris Climate Assembly (2019-20) | 150 citizens, quota-based | Modern large-scale deliberation |
| Decidim (Rails) | JSON-based eligibility + random selection | Open-source reference implementation |

### Selection Algorithm

**Phase 2:** Simple random sampling (cryptographically secure)
**Phase 3+:** Add stratification for large communities

```typescript
// Phase 2: cryptographically secure simple random
import { randomInt } from 'node:crypto';

function secureShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
```

**Must NOT use `Math.random()`**. Use `node:crypto.randomInt`.

### Verifiable Randomness (Phase 3 goal)

For high-stakes sortition, the seed must be publicly verifiable so that no party — including the platform itself — can manipulate selection:

- Commit-reveal scheme: platform commits to a hash; future public entropy (e.g., NIST randomness beacon, future Bitcoin block hash) provides the reveal
- All sortition selections are then reproducible and auditable by third parties

### Sortition Configuration

```typescript
interface SortitionConfig {
  size: number;                              // Panel size
  size_type: 'absolute' | 'percentage';
  purpose: 'review' | 'amendment_consolidation';
  response_timeout_hours: number;            // e.g., 72
  replacement_enabled: boolean;              // Auto-replace non-responders
  self_exclusion: boolean;                   // Members may decline
  conflict_of_interest_check: boolean;       // Phase 3+
}
```

### Conflict of Interest (Phase 3)

For certain proposal types (e.g., land use, financial decisions), selected members must disclose potential conflicts and may be recused. Implementation deferred to Phase 3 but the data model should accommodate it:

```typescript
interface SortitionMember {
  sortition_body_id: number;
  pseudonymous_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'recused' | 'replaced' | 'responded';
  conflict_disclosed: boolean;
  conflict_details?: string;
  response?: any;
  responded_at?: Date;
}
```

### Replacement Logic

When a selected member does not respond within the timeout:
1. System selects a replacement from remaining eligible pool
2. Excludes: current members, prior non-responders, recused members
3. Replacement receives full response window
4. Original non-responder receives notification (no penalty, but tracked for participation analytics)

---

## 6. Coercion Resistance and Receipt-Freeness

### The Principle

**A voter must not be able to prove to a third party how they voted — even if they want to.** This breaks vote-buying markets and undermines coercive surveillance, because no proof of vote can be delivered or verified.

Perfect coercion resistance is impossible on mobile devices. The goal is to **make coercion uneconomical at scale**, not impossible in edge cases.

### Implemented Defenses

#### Level 1: No Receipt in UI or Communications

- **No vote history UI.** Users cannot see which option they chose, ever.
- **Confirmation messages say only:** "Your vote has been recorded." Never reveal the choice.
- **No email receipts with the chosen option.** Emails confirm participation only.
- **No screenshot prevention theater.** FLAG_SECURE and watermarks create false security and annoy users; they are not implemented.

#### Level 2: Vote Changeability (Essential)

This is the single most important coercion defense.

- Voters may change their vote any number of times until voting closes
- Only the final vote counts
- Rate-limited: maximum 20 changes per voter per proposal (to prevent automation abuse)
- Each change is stored in an audit log (encrypted, used only for fraud detection)
- Estonia's i-voting system uses this; it is the documented best practice

**Database design:**
```sql
CREATE TABLE votes (
  proposal_id INT NOT NULL,
  voter_token TEXT NOT NULL,     -- pseudonymous, unlinkable
  encrypted_choice BYTEA NOT NULL,
  cast_at TIMESTAMP NOT NULL,
  PRIMARY KEY (proposal_id, voter_token)  -- only latest vote persists
);

CREATE TABLE vote_history (
  id SERIAL PRIMARY KEY,
  proposal_id INT NOT NULL,
  voter_token TEXT NOT NULL,
  encrypted_choice BYTEA NOT NULL,
  cast_at TIMESTAMP NOT NULL
);
```

Tallying uses only the `votes` table (latest per voter). The `vote_history` table is encrypted-at-rest and used only for fraud investigation under legal process.

#### Level 3: In-Person Override

**Not implemented.** AgoraX does not have physical polling infrastructure. Users relying on extreme coercion resistance (e.g., journalists, dissidents) are directed to traditional paper ballots for legally-binding state elections.

#### Level 4: Cryptographic Receipt-Freeness (Helios Integration)

Implemented for **high-stakes proposals** (configurable per community or proposal type):

- Voter's choice is **encrypted on the client device** before transmission
- The ciphertext is what appears in the public bulletin board, not the plaintext
- Only the **aggregated tally** is decrypted, by a set of distributed trustees
- Individual votes are **never decrypted**
- Voters receive a cryptographic receipt that proves their encrypted vote was included in the tally, but cannot prove what it decrypted to

This gives:
- **Individual verifiability:** "My vote was counted"
- **Universal verifiability:** "Anyone can verify the tally from published ciphertexts"
- **Receipt-freeness:** "No one can prove how I voted"

#### Level 5: The Benaloh Challenge

Implemented as the voter verification mechanism. This elegantly solves the tension between "I want to verify my vote was encrypted correctly" and "I must not be able to produce a receipt."

**How it works:**

1. The client device encrypts the voter's choice
2. Before submission, the voter is shown two options:
   - **Cast:** Submit this encrypted vote as final
   - **Challenge:** Audit this encryption to verify the device encrypted honestly

3. If the voter chooses **Challenge:**
   - The device reveals the randomness used in encryption
   - The voter (or their software) can verify the ciphertext correctly encrypts their stated choice
   - **That ballot is then discarded** and a new encryption is created
   - The voter can challenge as many times as they want

4. If the voter chooses **Cast:**
   - The encryption is submitted and becomes their vote
   - No challenge information is released

**Why this defeats receipts:**

Any "receipt" a voter might show a coercer was either:
- A challenged ballot (which was discarded — doesn't count as a vote), or
- A cast ballot (for which the randomness is secret, so nothing can be decrypted)

A coercer demanding proof cannot distinguish a genuine cast from a challenged-and-discarded ballot. The coercion threat collapses.

**UX challenge:** The Benaloh challenge is complex to explain to ordinary users. Implementation must include:
- Clear in-app explanation at first use
- Optional "advanced mode" that surfaces the challenge; default mode casts directly
- Third-party verification apps that can perform the challenge on behalf of users
- Educational materials produced with civil society partners

**References:**
- Benaloh, J. "Simple Verifiable Elections" (EVT 2006)
- Helios voting system (benaloh.github.io/helios)
- Modern implementations: ElectionGuard (Microsoft), STAR-Vote

### Acknowledged Limits

Even with all these defenses, certain coercion scenarios remain possible:

- Device-level surveillance (screen recording, shoulder surfing at the moment of voting)
- Continuous physical monitoring of the voter on all their devices
- Coercion of voters unfamiliar with the change-vote feature

Mitigations:

- **User education** about vote changeability and reporting
- **Anomaly detection** (e.g., many votes from the same IP in a short window, device fingerprint clustering)
- **Clear reporting channels** for coerced voters, integrated with civil society organizations

---

## 7. Cryptographic Tallying (Helios Integration)

### Scope

Cryptographic tallying is **not universal**. It is configurable per community or per proposal type:

- **Low-stakes proposals** (e.g., "which day should we hold the community meeting"): fast database tallying with audit log
- **High-stakes proposals** (e.g., budget allocation, policy decisions): full cryptographic pipeline

This tiered approach balances verifiability against operational complexity and voting latency.

### Integration Strategy

Helios is a mature Django application with extensive cryptography. Three integration options were evaluated:

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Port Helios crypto to TypeScript | Single codebase | High risk of crypto bugs, massive effort | **Rejected** |
| Run Helios as a separate service | Clean separation, proven code | Two-service complexity, data sync | **Accepted for Phase 3** |
| Use existing JS libraries (helios-js) | Partial solution | Incomplete, not production-grade | **Rejected** |

**Decision:** Run Helios as a **federated tallying service**. AgoraX handles proposals, deliberation, and vote collection (encrypted ciphertexts). When voting closes, encrypted ballots are submitted to the Helios service, which performs homomorphic tallying and publishes the result with proofs.

### Trustee Architecture

Helios's security depends on **distributed trustees** holding key shares. For a Greek democracy platform, trustees must be independent and credible:

- **Not all AgoraX employees.** A platform-internal trustee set provides mathematical verifiability but zero political legitimacy.
- **Proposed trustee composition (for national-scale votes):**
  - 2 university cryptography departments (e.g., NTUA, University of Athens)
  - 2 civil society organizations (e.g., Vouliwatch, Homo Digitalis)
  - 1 international observer (e.g., OSCE/ODIHR cryptographer)
  - 1 AgoraX platform trustee (for operational continuity)
  - Threshold: 5 of 7 required to decrypt tally

- **For community-scale votes:** simpler trustee sets (3 trustees, 2-of-3 threshold) drawn from community members

### Vote Storage Interface

The vote storage interface must support both tallying modes. Design it abstractly:

```typescript
interface ITallyBackend {
  recordVote(proposalId: number, encryptedChoice: Ciphertext, voterToken: string): Promise<void>;
  closeVoting(proposalId: number): Promise<TallyResult>;
  verifyTally(proposalId: number): Promise<VerificationResult>;
  publicBulletinBoard(proposalId: number): Promise<BulletinEntry[]>;
}

class DatabaseTallyBackend implements ITallyBackend { /* low-stakes */ }
class HeliosTallyBackend implements ITallyBackend { /* high-stakes */ }
```

Phase 2 implements `DatabaseTallyBackend` with encrypted storage and audit logs. Phase 3 adds `HeliosTallyBackend`.

---

## 8. Debate and Amendment Structure

### Rejecting Binary For/Against

Real deliberation is not binary. Loomio's consensus model (Agree / Abstain / Disagree / Block) works better than simple for/against. AgoraX adopts a nuanced debate model:

### Argument Model

```typescript
interface DebateArgument {
  id: number;
  proposal_id: number;
  author_token: string;              // pseudonymous
  stance: 'agree' | 'abstain' | 'disagree' | 'block';
  argument_text: string;
  section_reference?: number;        // Link to specific proposal section
  supports_count: number;
  parent_argument_id?: number;       // For threaded responses
  created_at: Date;
}
```

- **Agree:** Supports the proposal as written
- **Abstain:** Neutral; willing to live with the outcome either way
- **Disagree:** Opposed, but willing to be overruled by the community
- **Block:** Strong objection; believes the proposal should not pass

Arguments can be linked to specific **sections** of the proposal (paired with the amendment system), enabling structured debate: "I support the goal but object to the funding mechanism in section 3."

### Amendment Consolidation

The amendment problem: 15 amendments to a single proposal makes voting incoherent (omnibus bill problem, contradictory amendments).

**Solution:** A dedicated sortition body consolidates amendments before voting.

Workflow:

1. Deliberation phase ends with N amendments submitted
2. A **consolidation sortition panel** is convened (separate from the review panel)
3. Panel reviews all amendments with LLM-assisted similarity clustering
4. Panel produces a **single consolidated proposal text** that incorporates as many amendments as coherently possible
5. Original proposal author has **veto power** over specific consolidations (to prevent distortion of intent)
6. If author vetoes, the original proposal + individual amendments proceed to voting separately
7. Final consolidated text proceeds to voting phase

LLM assistance is limited to:
- Identifying semantically similar amendments
- Suggesting merge candidates
- Flagging contradictions between amendments

LLM does **not** write the final consolidated text; that is the sortition panel's responsibility.

---

## 9. Job Queue (Postgres-Based)

### Rejecting Premature BullMQ/Redis

Redis + BullMQ adds deployment complexity, an additional service to monitor, and another failure mode. For Phase 2 with zero production users, this is premature infrastructure.

### Postgres Queue Design

```sql
CREATE TABLE job_queue (
  id SERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,            -- 'llm_structure', 'sortition_selection', etc.
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
                                      -- pending | running | completed | failed
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  error_log TEXT,
  scheduled_for TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_queue_pending ON job_queue (status, scheduled_for)
  WHERE status = 'pending';
```

### Worker

A single worker process polls every 30 seconds, uses `SELECT ... FOR UPDATE SKIP LOCKED` to claim jobs, processes them, and updates status. Failed jobs retry with exponential backoff up to `max_retries`.

### Abstraction for Future Migration

```typescript
interface IJobQueue {
  enqueue(jobType: string, payload: any, options?: JobOptions): Promise<number>;
  processJobs(jobType: string, handler: JobHandler): void;
  getJobStatus(jobId: number): Promise<JobStatus>;
}

class PostgresJobQueue implements IJobQueue { /* Phase 2 */ }
class BullMQJobQueue implements IJobQueue { /* Phase 3+ when scale justifies */ }
```

Migration to BullMQ is a drop-in replacement when load telemetry justifies it (typically north of 100K active users with heavy LLM workloads).

---

## 10. IStorage Interface Extensions

### Community Methods

```typescript
createCommunity(community: InsertCommunity): Promise<Community>;
getCommunity(id: number): Promise<Community | undefined>;
getCommunityBySlug(slug: string): Promise<Community | undefined>;
updateCommunity(id: number, updates: Partial<Community>): Promise<Community>;
deleteCommunity(id: number): Promise<boolean>;
getCommunitiesByUser(pseudonymousId: string): Promise<Community[]>;
getCommunityMembers(communityId: number): Promise<CommunityMember[]>;
addCommunityMember(member: InsertCommunityMember): Promise<CommunityMember>;
removeCommunityMember(communityId: number, pseudonymousId: string): Promise<boolean>;
updateMemberRole(communityId: number, pseudonymousId: string, role: string): Promise<CommunityMember>;
```

### Proposal Methods

```typescript
createProposal(proposal: InsertProposal): Promise<Proposal>;
getProposal(id: number): Promise<Proposal | undefined>;
getProposals(communityId: number, filters?: ProposalFilters): Promise<Proposal[]>;
updateProposal(id: number, updates: Partial<Proposal>): Promise<Proposal>;
getProposalsByAuthor(pseudonymousId: string): Promise<Proposal[]>;
getProposalWithDetails(id: number): Promise<ProposalDetail | undefined>;
transitionProposalState(id: number, newState: string, trigger: StateTransitionTrigger): Promise<Proposal>;
```

### Amendment Methods

```typescript
createAmendment(amendment: InsertProposalAmendment): Promise<ProposalAmendment>;
getAmendments(proposalId: number): Promise<ProposalAmendment[]>;
getAmendment(id: number): Promise<ProposalAmendment | undefined>;
updateAmendment(id: number, updates: Partial<ProposalAmendment>): Promise<ProposalAmendment>;
consolidateAmendments(proposalId: number, consolidatedText: string, vetoes: number[]): Promise<Proposal>;
```

### Sortition Methods

```typescript
createSortitionBody(body: InsertSortitionBody): Promise<SortitionBody>;
getSortitionBody(id: number): Promise<SortitionBody | undefined>;
getSortitionMembers(bodyId: number): Promise<SortitionMember[]>;
selectSortitionMembers(communityId: number, config: SortitionConfig, excludeTokens?: string[]): Promise<string[]>;
replaceNonResponders(bodyId: number): Promise<SortitionMember[]>;
recordMemberResponse(bodyId: number, pseudonymousId: string, response: any): Promise<SortitionMember>;
getSortitionRecommendation(bodyId: number): Promise<SortitionRecommendation>;
completeSortitionBody(bodyId: number): Promise<SortitionBody>;
```

### Debate Methods

```typescript
createArgument(argument: InsertDebateArgument): Promise<DebateArgument>;
getArguments(proposalId: number, stance?: ArgumentStance): Promise<DebateArgument[]>;
getArgument(id: number): Promise<DebateArgument | undefined>;
supportArgument(argumentId: number, pseudonymousId: string): Promise<DebateArgument>;
```

### Vote Methods (Receipt-Free)

```typescript
castVote(proposalId: number, voterToken: string, encryptedChoice: Ciphertext): Promise<VoteReceipt>;
changeVote(proposalId: number, voterToken: string, encryptedChoice: Ciphertext): Promise<VoteReceipt>;
hasVoted(proposalId: number, voterToken: string): Promise<boolean>;  // returns bool only; never reveals choice
closeVoting(proposalId: number): Promise<TallyResult>;
verifyVoteIncluded(proposalId: number, voterToken: string): Promise<InclusionProof>;  // proof of inclusion, not of choice
```

### Benaloh Challenge Methods

```typescript
createChallengeableBallot(proposalId: number, voterToken: string, choice: string): Promise<ChallengeableBallot>;
challengeBallot(ballotId: number): Promise<BallotChallengeResult>;  // reveals randomness, voids ballot
castBallot(ballotId: number): Promise<VoteReceipt>;                 // finalizes ballot
```

### Job Queue Methods

```typescript
enqueueJob(jobType: string, payload: any, options?: JobOptions): Promise<number>;
getJobStatus(jobId: number): Promise<JobStatus>;
```

---

## 11. API Route Structure

```
IDENTITY
POST   /api/auth/govgr/callback              Complete gov.gr authentication
POST   /api/auth/logout                      End session
GET    /api/auth/me                          Current pseudonymous session info

COMMUNITIES
GET    /api/communities                      List discoverable communities
POST   /api/communities                      Create community (admin-approved)
GET    /api/communities/:id                  Community details
PATCH  /api/communities/:id                  Update community (admin only)
GET    /api/communities/:id/members          List members
POST   /api/communities/:id/members          Join community (eligibility-checked)
DELETE /api/communities/:id/members/:token   Leave or be removed

PROPOSALS
GET    /api/communities/:id/proposals        List proposals
POST   /api/communities/:id/proposals        Submit proposal (→ review state)
GET    /api/proposals/:id                    Proposal details (with structured analysis)
PATCH  /api/proposals/:id                    Update proposal (author only, draft only)
POST   /api/proposals/:id/withdraw           Author withdraws (→ archived)

DELIBERATION
GET    /api/proposals/:id/arguments          List debate arguments
POST   /api/proposals/:id/arguments          Add argument
POST   /api/arguments/:id/support            Support an argument
GET    /api/proposals/:id/amendments         List amendments
POST   /api/proposals/:id/amendments         Submit amendment
POST   /api/proposals/:id/consolidate        Trigger amendment consolidation panel

SORTITION
GET    /api/sortition/:id                    Sortition body details (member-only)
POST   /api/sortition/:id/accept             Accept invitation to serve
POST   /api/sortition/:id/decline            Decline / self-exclude
POST   /api/sortition/:id/disclose-conflict  Disclose conflict of interest
POST   /api/sortition/:id/respond            Submit recommendation
GET    /api/sortition/:id/recommendation     Public recommendation (after completion)

VOTING
POST   /api/proposals/:id/ballot             Create challengeable ballot
POST   /api/ballots/:id/challenge            Challenge (audit) the ballot
POST   /api/ballots/:id/cast                 Cast the ballot (final)
POST   /api/proposals/:id/change-vote        Change previously cast vote
GET    /api/proposals/:id/voted              Boolean: has this voter voted? (no choice revealed)
GET    /api/proposals/:id/verify             Inclusion proof for voter's ballot
GET    /api/proposals/:id/tally              Public tally (after voting closes)
GET    /api/proposals/:id/bulletin-board     Public list of encrypted ballots

ADMIN
GET    /api/admin/proposals/stuck            Proposals in failed states
POST   /api/admin/proposals/:id/escalate     Admin intervention
GET    /api/admin/sortition/failed           Failed sortition panels
```

---

## 12. Middleware-Based Authorization

Replace per-route auth checks with explicit middleware:

```typescript
requireAuth                                   // Valid session exists
requireCommunityRole(role: 'member' | 'admin' | 'founder')
requireCommunityMembership(communityId)       // Eligibility-verified
requireProposalAuthor                         // Author of :id
requireProposalState(states: string[])        // e.g., only in 'deliberation'
requireSortitionMember                        // Active member of sortition :id
rateLimitVoting                               // Max 20 vote changes per proposal
```

Routes compose middleware cleanly:

```typescript
router.post(
  '/proposals/:id/arguments',
  requireAuth,
  requireCommunityMembership,
  requireProposalState(['deliberation']),
  async (req, res) => { /* handler */ }
);
```

---

## 13. What Must Be Built — Implementation Order

### Phase 2.0 — Foundations (Weeks 1-2)

1. **Identity Service skeleton** (separate Postgres DB, minimal API)
2. **gov.gr integration** (auth flow, session management, pseudonymous ID issuance)
3. **Schema migrations** for all new tables (communities, proposals, amendments, sortition, arguments, votes, vote_history, job_queue)
4. **XState state chart** for proposal lifecycle
5. **Postgres job queue** + worker process
6. **Middleware library** (auth, roles, state checks)

### Phase 2.1 — Communities and Proposals (Weeks 3-4)

7. **Community CRUD** (create, list, join, leave, member management)
8. **Geo-fencing** based on registered residence + 30-day requirement
9. **Proposal draft + submit** (author can edit in draft, locks on submit)
10. **Proposal listing with filters** (by state, date, category, author)

### Phase 2.2 — Review Phase (Weeks 5-6)

11. **LLM backend interface** with Ollama (dev) and OpenRouter (prod)
12. **Proposal structural analysis** (async job, stored result)
13. **Review sortition panel** (5 members, 72-hour response window)
14. **Panel recommendation recording** (advance/return/flag)
15. **Timer-based state transitions** with participation thresholds

### Phase 2.3 — Deliberation Phase (Weeks 7-8)

16. **Debate arguments** with agree/abstain/disagree/block stances
17. **Section-linked arguments**
18. **Amendment submission**
19. **Support/oppose tracking** (pseudonymous)
20. **Amendment consolidation sortition panel** (convened when deliberation ends)
21. **LLM-assisted similarity clustering** for amendments
22. **Author veto on consolidations**

### Phase 2.4 — Voting Phase (Weeks 9-10)

23. **Database tally backend** (encrypted at rest, audit logged)
24. **Vote changeability** (up to 20 changes, latest counts)
25. **Receipt-free UI** (no vote history, no choice in confirmations)
26. **Benaloh challenge flow** (challengeable ballot creation, audit path, cast path)
27. **Inclusion proof endpoint** (proves vote included, not which choice)
28. **Public bulletin board** of encrypted ballots

### Phase 2.5 — Decided State and Audit (Week 11)

29. **Tally publication** with public verification
30. **Immutable decided state** (results cannot be modified)
31. **Sortition recommendation publication** (displayed alongside final result)
32. **Dissent visualization** when panel and community disagree

### Phase 2.6 — Admin, Monitoring, Documentation (Week 12)

33. **Admin dashboard** (stuck proposals, failed sortitions, escalations)
34. **Anomaly detection** (coercion patterns, IP clustering, device fingerprint analysis)
35. **Audit log viewing** (restricted access, legal process only)
36. **User-facing documentation** (how voting works, your rights, how to change your vote, coercion reporting)
37. **Integration tests** for full proposal lifecycle
38. **Load testing** of job queue and vote flow

---

## 14. Deferred to Phase 3

- **Helios federated tallying service** (cryptographic tallying for high-stakes votes)
- **Distributed trustee ceremony** infrastructure
- **Verifiable randomness** via commit-reveal with public entropy source
- **Stratified sortition** with demographic quotas
- **Conflict-of-interest** formal checking for sortition
- **BullMQ migration** when load telemetry justifies it
- **Mobile app** with secure enclave integration for client-side encryption
- **eIDAS integration** for EU-wide identity
- **Offline/assisted access** for digitally excluded citizens

---

## 15. Open Questions Requiring Explicit Decisions

Before Phase 2 implementation begins, the project must formally decide:

1. ~~**gov.gr integration status:** Is the MoU with Ministry of Digital Gov...[truncated]
2. ~~**DPIA status:** Has the Data Protection Impact Assessment been commissioned? When will it complete?** — **PARTIALLY RESOLVED:** Privacy policy in place (`/privacy` page) with GDPR-compliant language covering data collection, usage, security, and user rights. Formal DPIA document not yet commissioned — should be addressed before public launch.~~
3. ~~**Exclusion policy:** Formal decisions on non-citizens, Greeks abroad, minors, digitally excluded.** — **PARTIALLY RESOLVED:** Implicit policy: gov.gr verified = eligible to vote. No explicit age/citizenship checks in schema (relies on gov.gr verification). Geofencing supports location-based eligibility. No explicit handling for Greeks abroad, minors, or digitally excluded — these are Phase 3/4 considerations. Current approach: if you can get a gov.gr signed PDF, you're eligible.~~
4. **Community founding model:** Who can create a community? Open self-service, admin-approved, or tied to administrative geography (municipalities)?
5. **Community admin authority:** What can admins do beyond moderation? Can they override sortition timeouts? Block proposals?
6. **Proposal eligibility:** Any community member can submit? Or must meet participation threshold (e.g., 30 days membership)?
7. **Voting eligibility per proposal type:** Same as community membership, or stricter (e.g., full residency required for binding votes)?
8. **Trustee selection for high-stakes votes:** Which universities, civil society organizations, international observers? Formal agreements?
9. **Legal status of outcomes:** Are these decisions advisory to municipalities? Binding in any context? Requires legislative work.
10. **Funding and sustainability model:** Public funding, municipal contracts, philanthropic, hybrid?

**Q4-7 DECISIONS (2026-04-23):**
- **Q4:** Open self-service. Any registered user can create a community. No admin approval needed — lowers friction for early adoption.
- **Q5:** Admins can moderate (delete comments, ban users), manage membership, and override sortition timeouts. Cannot block proposals or override voting results. Admin actions logged and visible to community members. Democracy score tracks admin power usage.
- **Q6:** Any community member can submit. No participation threshold — lowers barrier to entry. Spam handled through LLM structuring + sortition review, not gatekeeping.
- **Q7:** Same as community membership. No stricter residency requirement for binding vs. advisory votes — that distinction is a Phase 3 legal question, not a technical one.

---

## 15.5 Phase 2.0 Implementation Status (2026-04-23)

**COMPLETED:**
- ✅ Storage layer: ~30 deliberation methods (communities, proposals, amendments, sortition, debate, support)
- ✅ API routes: 16 endpoints for community/proposal/debate management
- ✅ State machine: 5-state proposal lifecycle (draft → review → deliberation → voting → decided)
- ✅ Sortition algorithm: Cryptographically secure random selection with verifiable seed
- ✅ Democracy score: 0-100 scale with 5 factors (admin intervention, sortition usage, participation, transparency, deliberation)
- ✅ Design decisions documented (Q4-7)

**REMAINING FOR PHASE 2:**
- ⏳ Integration tests for state machine transitions
- ⏳ Admin action logging table for democracy score accuracy
- ⏳ Additional frontend pages (community detail, proposal detail, sortition management)
- ⏳ E2E tests for proposal lifecycle

**COMPLETED (2026-04-23):**
- ✅ LLM proposal structuring service (extract problem/solution/evidence)
- ✅ Job queue for async tasks (LLM processing, notifications)
- ✅ Frontend components for communities, proposals, debate
- ✅ Jobs table migration (0001_add_jobs_table.sql)

**DEFERRED TO PHASE 3:**
- 🔜 Cryptographic voting tallying (Helios/ElectionGuard)
- 🔜 Distributed trustees for high-stakes votes
- 🔜 Multi-community federation
- 🔜 Legal status of outcomes (advisory vs. binding)

## 16. References

- **MERGE_PLAN.md** — Full deliberation-module merge strategy (schema, storage, routes, LLM, frontend)
- **Helios Voting System** — https://github.com/benadida/helios-server
- **Benaloh, J. (2006)** "Simple Verifiable Elections" — USENIX EVT
- **Decidim** — https://github.com/decidim/decidim
- **Loomio** — https://github.com/loomio/loomio
- **Estonian i-Voting** — https://www.valimised.ee/en
- **ElectionGuard (Microsoft)** — https://www.electionguard.vote/
- **STAR-Vote** — Travis County, TX verifiable voting
- **NIST Randomness Beacon** — https://beacon.nist.gov/
- **IRMA / Idemix** — Anonymous credential systems
- **OSCE/ODIHR** — International election observation standards
- **AgoraX codebase** — `~/.hermes/agorax-build/`