/**
 * Polling module — data model.
 *
 * GDPR architecture (mirrors anonymous voting, see
 * docs/compliance/04_ANONYMOUS_VOTING_DESIGN.md):
 *
 *   IDENTITY SIDE (main DB role)          ANONYMOUS SIDE (agorax_vote role)
 *   ─────────────────────────────         ──────────────────────────────────
 *   panel_enrollments  (user X joined)    panelists        (tokenHash, channel)
 *   panel_enrollment_keys (RSA vault)     panel_profiles   (demographics)
 *                                         survey_responses (+ item answers)
 *
 * Enrollment uses an RFC 9474 blind signature: the server signs a blinded
 * token while authenticated, the client unblinds it and registers the
 * panelist UNauthenticated. The identity side learns "user X is a panelist";
 * it can never join to a panelist row, profile, or response.
 *
 * Poll DEFINITIONS (survey_polls, survey_items, question_bank, module pool)
 * are public content, not personal data — they live on the main side.
 */

import { pgTable, text, serial, integer, boolean, timestamp, jsonb, numeric, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users, communities } from "./schema";

// ─── Identity side ───────────────────────────────────────────────────────────

/** Platform-wide RSA keypair(s) for blind-signing panel enrollment tokens. */
export const panelEnrollmentKeys = pgTable("panel_enrollment_keys", {
  id: serial("id").primaryKey(),
  publicN: text("public_n").notNull(),
  publicE: text("public_e").notNull(),
  secretDCiphertext: text("secret_d_ciphertext").notNull(),
  secretDIv: text("secret_d_iv").notNull(),
  secretDTag: text("secret_d_tag").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Enrollment ledger — one blind signature per user, ever. Records THAT a
 * user joined the panel (and their acquisition channel at that moment),
 * never WHICH panelist they became.
 */
export const panelEnrollments = pgTable("panel_enrollments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceChannel: text("source_channel").notNull().default("organic"), // 'organic' | 'paid' | 'referral' | 'partner'
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
}, (table) => ({
  panelEnrollmentUserUnique: uniqueIndex("panel_enrollments_user_unique").on(table.userId),
}));

// ─── Anonymous side ──────────────────────────────────────────────────────────

/**
 * One row per panel member, keyed by the SHA-256 of their unblinded
 * enrollment token. The token itself is the panelist's bearer credential
 * (kept client-side); the server stores only its hash.
 */
export const panelists = pgTable("panelists", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  // Permanent acquisition tag, self-carried through the blind enrollment.
  // Published/certified outputs use 'organic'+'paid' cohorts only.
  sourceChannel: text("source_channel").notNull().default("organic"),
  status: text("status").notNull().default("active"), // 'active' | 'paused' | 'left'
  enrolledAt: timestamp("enrolled_at").notNull().defaultNow(),
  lastActiveAt: timestamp("last_active_at"),
});

/**
 * Demographic profile — collected once at onboarding, annual refresh.
 * Lives EXCLUSIVELY on the anonymous side; never collected per-poll.
 * Field vocabularies in shared/polling.ts.
 */
export const panelProfiles = pgTable("panel_profiles", {
  panelistId: integer("panelist_id").primaryKey().references(() => panelists.id, { onDelete: "cascade" }),
  ageBand: text("age_band").notNull(),
  gender: text("gender").notNull(),
  region: text("region").notNull(),          // NUTS-2 code, e.g. 'EL30'
  education: text("education").notNull(),
  urbanity: text("urbanity").notNull(),
  pastVote2023: text("past_vote_2023").notNull(),
  // Recall bias is structural for past vote — the flag travels with the row.
  pastVoteRecallFlagged: boolean("past_vote_recall_flagged").notNull().default(true),
  // Calibration benchmark answers (smoker, household_car, household_size) —
  // items with known ELSTAT population values, for selection-skew estimation.
  benchmarks: jsonb("benchmarks").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  refreshDueAt: timestamp("refresh_due_at"),
});

// ─── Question bank (canonical, versioned wording) ───────────────────────────

/**
 * Canonical wording for recurring items. Tracker questions must be
 * character-identical across waves: rows are IMMUTABLE — a wording change
 * is a NEW row with version+1, never an edit. unique(code, version).
 */
export const questionBank = pgTable("question_bank", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),               // stable family code, e.g. 'govt_direction'
  version: integer("version").notNull().default(1),
  text: text("text").notNull(),
  itemType: text("item_type").notNull(),      // 'single_choice' | 'multi_choice' | 'likert' | 'open_text'
  options: jsonb("options"),                  // string[] for choice/likert items
  randomizeOptions: boolean("randomize_options").notNull().default(false),
  category: text("category").notNull().default("one_off"), // 'tracker' | 'benchmark' | 'one_off' | 'attention'
  // For benchmark items: the official population value + source citation.
  benchmarkKey: text("benchmark_key"),
  populationValue: jsonb("population_value"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  questionBankCodeVersionUnique: uniqueIndex("question_bank_code_version_unique").on(table.code, table.version),
}));

// ─── Polls (two tiers) ───────────────────────────────────────────────────────

export const surveyPolls = pgTable("survey_polls", {
  id: serial("id").primaryKey(),
  tier: text("tier").notNull().default("community"), // 'community' | 'certified'
  title: text("title").notNull(),
  topicTag: text("topic_tag").notNull(),
  intent: text("intent"),                       // creator's natural-language prompt
  status: text("status").notNull().default("draft"), // shared/polling.ts SURVEY_POLL_STATUSES
  creatorId: integer("creator_id").references(() => users.id, { onDelete: "set null" }), // null for platform-authored certified polls
  communityId: integer("community_id").references(() => communities.id, { onDelete: "set null" }),
  language: text("language").notNull().default("el"),
  targetN: integer("target_n"),
  // Compiler provenance: model, rounds, fallback flag — part of transparency.
  compilerMeta: jsonb("compiler_meta"),
  // Adversarial reviewer output (shared/polling.ts gatekeeperVerdict).
  gatekeeperVerdict: jsonb("gatekeeper_verdict"),
  // Frozen at close: n, field dates, weighting vars, eff. n, design effect…
  methodology: jsonb("methodology"),
  opensAt: timestamp("opens_at"),
  closesAt: timestamp("closes_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
}, (table) => ({
  surveyPollsStatusIdx: index("survey_polls_status_idx").on(table.status, table.tier),
}));

/**
 * The rendered items of a poll. Host items come from the compiler (inline
 * text) or the question bank (questionBankId set → wording is the bank
 * row's, character-identical). Piggyback-module items are materialized
 * here at fielding time with isModuleItem=true and negative-free positions
 * BEFORE every host item.
 */
export const surveyItems = pgTable("survey_items", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => surveyPolls.id, { onDelete: "cascade" }),
  questionBankId: integer("question_bank_id").references(() => questionBank.id),
  position: integer("position").notNull(),
  text: text("text").notNull(),
  itemType: text("item_type").notNull(),
  options: jsonb("options"),
  randomizeOptions: boolean("randomize_options").notNull().default(false),
  required: boolean("required").notNull().default(true),
  isModuleItem: boolean("is_module_item").notNull().default(false),
  isAttentionCheck: boolean("is_attention_check").notNull().default(false),
  // For attention checks: the option text the respondent is instructed to pick.
  attentionExpected: text("attention_expected"),
}, (table) => ({
  surveyItemsPollIdx: index("survey_items_poll_idx").on(table.pollId, table.position),
}));

// ─── Piggyback module pool & planned missingness ─────────────────────────────

/** The rotating pool of platform questions (trackers + calibration benchmarks). */
export const moduleItems = pgTable("module_items", {
  id: serial("id").primaryKey(),
  questionBankId: integer("question_bank_id").notNull().references(() => questionBank.id),
  poolVersion: integer("pool_version").notNull().default(1),
  position: integer("position").notNull(), // fixed internal order within the module
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Materialized per-respondent subset (planned missingness). The subset is
 * DERIVED deterministically — sha256(panelistId : poolVersion) ranks the
 * pool — and persisted here for auditability. Per-respondent (not per-poll)
 * assignment: each panelist answers the same subset across polls, which
 * maximizes their within-person time series and keeps item assignment
 * orthogonal to host-poll topic.
 */
export const moduleAssignments = pgTable("module_assignments", {
  id: serial("id").primaryKey(),
  panelistId: integer("panelist_id").notNull().references(() => panelists.id, { onDelete: "cascade" }),
  poolVersion: integer("pool_version").notNull(),
  itemIds: jsonb("item_ids").notNull(), // moduleItems.id[], in fixed module order
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
}, (table) => ({
  moduleAssignmentUnique: uniqueIndex("module_assignments_unique").on(table.panelistId, table.poolVersion),
}));

// ─── Responses (anonymous side) ──────────────────────────────────────────────

export const surveyResponses = pgTable("survey_responses", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => surveyPolls.id, { onDelete: "cascade" }),
  panelistId: integer("panelist_id").notNull().references(() => panelists.id, { onDelete: "cascade" }),
  // Seed for response-order randomization — fixed per respondent so the
  // instrument renders identically on refresh.
  orderSeed: text("order_seed").notNull(),
  // The module-item surveyItems.id[] this respondent was assigned.
  moduleItemIds: jsonb("module_item_ids").notNull().default("[]"),
  // Host-poll topic snapshot for context-effect analysis of module answers.
  hostTopicTag: text("host_topic_tag"),
  status: text("status").notNull().default("in_progress"), // 'in_progress' | 'completed' | 'discarded'
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  qualityFlags: jsonb("quality_flags"), // { speeder, straightLiner, failedAttention }
  qualityPassed: boolean("quality_passed"),
  // One-time code hash for the quality-gated Democracy Points claim. The
  // claim route burns it; the identity side learns only "completed poll Y".
  claimCodeHash: text("claim_code_hash"),
  claimedAt: timestamp("claimed_at"),
}, (table) => ({
  surveyResponseUnique: uniqueIndex("survey_responses_unique").on(table.pollId, table.panelistId),
  surveyResponsesPollIdx: index("survey_responses_poll_idx").on(table.pollId, table.status),
}));

export const surveyItemAnswers = pgTable("survey_item_answers", {
  id: serial("id").primaryKey(),
  responseId: integer("response_id").notNull().references(() => surveyResponses.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => surveyItems.id, { onDelete: "cascade" }),
  // single_choice: option index (number); multi_choice: number[];
  // likert: option index; open_text: string.
  value: jsonb("value").notNull(),
  timeMs: integer("time_ms"), // per-item dwell time (speeder detection)
  answeredAt: timestamp("answered_at").notNull().defaultNow(),
}, (table) => ({
  surveyItemAnswerUnique: uniqueIndex("survey_item_answers_unique").on(table.responseId, table.itemId),
  surveyItemAnswersItemIdx: index("survey_item_answers_item_idx").on(table.itemId),
}));

// ─── Computed results (raw + weighted, always together) ─────────────────────

export const surveyResults = pgTable("survey_results", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => surveyPolls.id, { onDelete: "cascade" }),
  // 'published' = organic+paid cohorts only (the only cohort certified
  // outputs may use); 'all' = every cohort (private/client products).
  cohort: text("cohort").notNull().default("published"),
  completes: integer("completes").notNull(),
  raw: jsonb("raw").notNull(),        // per-item raw marginals (k-anonymity applied at render)
  weighted: jsonb("weighted"),        // per-item weighted marginals; null below MIN_WEIGHTED_N
  effectiveN: numeric("effective_n"),
  designEffect: numeric("design_effect"),
  weightingVars: jsonb("weighting_vars"),
  weightSummary: jsonb("weight_summary"), // min/max/trimmed counts — transparency page
  computedAt: timestamp("computed_at").notNull().defaultNow(),
}, (table) => ({
  surveyResultsPollCohortUnique: uniqueIndex("survey_results_poll_cohort_unique").on(table.pollId, table.cohort),
}));

// ─── Types ───────────────────────────────────────────────────────────────────

export type PanelEnrollmentKey = typeof panelEnrollmentKeys.$inferSelect;
export type PanelEnrollment = typeof panelEnrollments.$inferSelect;
export type Panelist = typeof panelists.$inferSelect;
export type PanelProfile = typeof panelProfiles.$inferSelect;
export type QuestionBankItem = typeof questionBank.$inferSelect;
export type SurveyPoll = typeof surveyPolls.$inferSelect;
export type SurveyItem = typeof surveyItems.$inferSelect;
export type ModuleItem = typeof moduleItems.$inferSelect;
export type ModuleAssignment = typeof moduleAssignments.$inferSelect;
export type SurveyResponse = typeof surveyResponses.$inferSelect;
export type SurveyItemAnswer = typeof surveyItemAnswers.$inferSelect;
export type SurveyResult = typeof surveyResults.$inferSelect;
