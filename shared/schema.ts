import { pgTable, text, serial, integer, boolean, timestamp, jsonb, uniqueIndex, index, numeric } from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password"), // Made optional for social logins
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  providerId: text("provider_id"), // ID from the provider (Google, etc.)
  provider: text("provider"), // 'google', 'facebook', 'twitter'
  profilePicture: text("profile_picture"), // URL to profile picture

  // Admin role
  isAdmin: boolean("is_admin").notNull().default(false),

  // Device fingerprinting and IP tracking
  deviceFingerprint: text("device_fingerprint"),
  registrationIp: text("registration_ip"),
  lastLoginIp: text("last_login_ip"),
  accountFlags: jsonb("account_flags"),
  accountStatus: text("account_status").default("active"),

  // Gov.gr Identity Verification
  govgrVerified: boolean("govgr_verified").default(false),
  govgrVerifiedAt: timestamp("govgr_verified_at"),
  govgrVoterHash: text("govgr_voter_hash"), // SHA256(AFM + SALT) — one-person key
  govgrDocCodeHash: text("govgr_doc_code_hash"), // SHA256(doc code + SALT) — anti-replay
  // Verified demographics extracted from the Responsible Declaration. By
  // data-minimisation, identifiers (ID-card number, parents) are NOT stored.
  govgrFirstName: text("govgr_first_name"),
  govgrLastName: text("govgr_last_name"),
  govgrMunicipality: text("govgr_municipality"),
  govgrPostcode: text("govgr_postcode"),

  // GDPR consent gate. Default TRUE — any new row (OAuth, manual insert)
  // is locked out of Art. 9 routes until the member accepts the canonical
  // privacy text. /api/register sets this FALSE explicitly after recording
  // consent. /api/user/consent/accept clears it for OAuth users at first
  // login. See migration 0016 + the requireConsent middleware.
  requiresConsent: boolean("requires_consent").notNull().default(true),

  // Interface and email language. The consent row's locale is a legal
  // artefact — which text they were shown — not a standing preference;
  // this is the preference.
  locale: text("locale").notNull().default("el"),

  // Colour theme: one of shared/theme.ts ACCENT_THEMES. Navy is what the
  // platform always looked like, so the default changes nothing.
  theme: text("theme").notNull().default("navy"),

  // NULL = the address was never proved. Nothing is gated on it: locking
  // out every member who registered before verification existed would be a
  // worse failure than an unconfirmed address.
  emailVerifiedAt: timestamp("email_verified_at"),
});

// Append-only consent audit log (GDPR Art. 7 + Art. 9(2)(a)).
// One row per acceptance; withdrawal sets `withdrawnAt` in place — the
// acceptance row itself is never deleted, since the historical fact
// "they did agree at time T" remains true even after withdrawal.
export const userConsents = pgTable("user_consents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  consentVersion: text("consent_version").notNull(),
  consentTextHash: text("consent_text_hash").notNull(),
  locale: text("locale").notNull(),
  acceptedAt: timestamp("accepted_at").notNull().defaultNow(),
  withdrawnAt: timestamp("withdrawn_at"),
});

// Admin action audit log (INTERNAL_POLICIES §1.2). The control that lets
// us answer "who touched what, when, why" for every admin-initiated
// action that hits a privileged endpoint. DB-direct joins by a human
// with psql are out of scope — those rely on the hosting layer.
export const adminAuditLog = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetUserId: integer("target_user_id").references(() => users.id, { onDelete: "set null" }),
  targetResource: text("target_resource"),
  details: jsonb("details"),
  requestId: text("request_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// GDPR Art. 17 — pending right-to-be-forgotten requests. Manual admin
// processing per the brief (≤1000-member scale). Resolving the
// hash-chain-vs-erasure tension is documented in INTERNAL_POLICIES.md.
export const erasureRequests = pgTable("erasure_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
  processedBy: integer("processed_by").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
});

export const polls = pgTable("polls", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  creatorId: integer("creator_id").notNull().references(() => users.id),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  allowExtension: boolean("allow_extension").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  visibility: text("visibility").notNull().default("public"),
  showResults: boolean("show_results").notNull().default(false),
  allowComments: boolean("allow_comments").notNull().default(true),
  requireVerification: boolean("require_verification").notNull().default(false),
  pollType: text("poll_type").notNull().default("singleChoice"),
  communityMode: boolean("community_mode").notNull().default(false), // Indicates if creator name is hidden with "community"

  // Community visibility
  communityId: integer("community_id").references(() => communities.id, { onDelete: "set null" }), // If set, poll is only visible to community members
});

export const pollOptions = pgTable("poll_options", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => polls.id),
  text: text("text").notNull(),
  order: integer("order").notNull(),
});

export const votes = pgTable("votes", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => polls.id),
  userId: integer("user_id").notNull().references(() => users.id),
  optionId: integer("option_id").notNull().references(() => pollOptions.id),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => polls.id),
  userId: integer("user_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Poll notifications for community members
export const pollNotifications = pgTable("poll_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pollId: integer("poll_id").notNull().references(() => polls.id, { onDelete: "cascade" }),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  pollNotificationUnique: uniqueIndex('poll_notification_unique').on(table.userId, table.pollId),
}));

// Account activity tracking
export const accountActivity = pgTable("account_activity", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  deviceFingerprint: text("device_fingerprint"),
  ipAddress: text("ip_address"),
  action: text("action").notNull(),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// Gov.gr Ballot Votes (for verified voting via Solemn Declaration)
export const ballotVotes = pgTable("ballot_votes", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => polls.id, { onDelete: "cascade" }),
  voterHash: text("voter_hash").notNull(), // SHA256(AFM + SALT) - never store raw AFM
  fileHash: text("file_hash").notNull().unique(), // SHA256 of PDF - prevents duplicate uploads
  voteChoice: text("vote_choice").notNull(),
  signerName: text("signer_name"), // Certificate signer for audit trail
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  pollVoterUnique: uniqueIndex('ballot_poll_voter_unique').on(table.pollId, table.voterHash),
}));

// Survey Poll Tables (Δημοσκοπική Ψηφοφορία)
export const pollQuestions = pgTable("poll_questions", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => polls.id),
  text: text("text").notNull(),
  questionType: text("question_type").notNull(), // "singleChoice", "multipleChoice", "ordering"
  order: integer("order").notNull(),
  parentId: integer("parent_id"), // Self-reference for nested questions
  parentAnswerId: integer("parent_answer_id"), // Which answer triggers this question
  required: boolean("required").notNull().default(true),
});

export const pollAnswers = pgTable("poll_answers", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => pollQuestions.id),
  text: text("text").notNull(),
  order: integer("order").notNull(),
});

export const pollUserResponses = pgTable("poll_user_responses", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => polls.id),
  questionId: integer("question_id").notNull().references(() => pollQuestions.id),
  userId: integer("user_id").notNull().references(() => users.id),
  answerId: integer("answer_id").references(() => pollAnswers.id), // can be null for ordering type
  answerValue: jsonb("answer_value"), // For ordering or multiple choice responses
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Communities (Κοινότητες) ──────────────────────────────────────

export const communities = pgTable("communities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("autonomous"), // 'autonomous' | 'managed'
  // Διαχειριστές για managed κοινότητες· κενός πίνακας για autonomous.
  adminIds: jsonb("admin_ids").default("[]"),
  // Σημαία για τη μοναδική «Γενική» κοινότητα όπου εγγράφεται κάθε νέος χρήστης.
  isGeneral: boolean("is_general").default(false),
  governanceModel: text("governance_model").default("no_admin"), // 'no_admin' | 'admin_team' | 'hybrid'
  creatorId: integer("creator_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),

  // Deliberation parameters (per-community config)
  maxConcurrentVotes: integer("max_concurrent_votes").default(-1), // -1 = unlimited
  minParticipationPct: numeric("min_participation_pct").default("0"),
  votePassThreshold: numeric("vote_pass_threshold").default("0.5"), // yes votes / (yes+no) must exceed this to pass
  sortitionSize: integer("sortition_size").default(20),
  sortitionMode: text("sortition_mode").default("absolute"), // 'absolute' | 'percentage'
  sortitionResponseHours: integer("sortition_response_hours").default(72),
  // Who synthesizes the final text after deliberation: 'ai' (default) or
  // 'sortition' (a drawn jury, with AI as automatic fallback when the jury
  // cannot form or does not respond).
  synthesisMode: text("synthesis_mode").default("ai"), // 'ai' | 'sortition'

  // Amendment parameters (per-community config)
  amendmentThreshold: numeric("amendment_threshold").default("0.5"), // upvote ratio to flag rejected amendments
  // Popularity ratio (0..1) above which the AI merge will include an
  // amendment the author did NOT explicitly accept. 1 = author-only, which
  // makes an inattentive author a single point of failure: everything the
  // community deliberated is dropped and the vote opens on untouched text.
  // The default lets clear community support carry an amendment on its own.
  amendmentInclusionThreshold: numeric("amendment_inclusion_threshold").default("0.6"),
  maxAmendmentsPerProposal: integer("max_amendments_per_proposal").default(-1), // -1 = unlimited

  // Merge tracking (self-reference — defined without FK to avoid circular init)
  mergedInto: integer("merged_into"),

  // Verification settings
  requireGovgrVerification: boolean("require_govgr_verification").default(false),

  // Phase time limits (hours). 0 = unlimited (no auto-advance)
  authorReviewHours: integer("author_review_hours").default(72),
  communitySignalHours: integer("community_signal_hours").default(48),
  votingHours: integer("voting_hours").default(168),
  // Grace window between the deliberation deadline and the ballot opening:
  // the merged text is ready and the author can still judge amendments.
  // Silence accepts the merged text, so this is short by design.
  finalReviewHours: integer("final_review_hours").default(24),

  // Bounds on the durations a proposal author may choose for their own
  // proposal. The community owns the range; the author picks inside it. The
  // clock is a governance lever — an unbounded author could run a two-hour
  // deliberation nobody sees, or park a proposal for six months.
  deliberationMinHours: integer("deliberation_min_hours").default(24),
  deliberationMaxHours: integer("deliberation_max_hours").default(336),
  votingMinHours: integer("voting_min_hours").default(24),
  votingMaxHours: integer("voting_max_hours").default(720),

  // Democracy score (computed, shows how democratic the community governance is)
  democracyScore: numeric("democracy_score"),

  // Apply-to-join policy: 'open' adds members directly, 'approval' creates a
  // pending community_join_requests row, 'invite_only' rejects unsolicited
  // applications outright — the only way in is a community_invites token.
  joinPolicy: text("join_policy").notNull().default("open"),

  // Visibility toggles ('public' | 'members'). The community row itself
  // (name, description, member count, founder/admins) is always public;
  // these gate the member roster and the content (proposals, debates,
  // votes, attached media/docs) respectively.
  memberListVisibility: text("member_list_visibility").notNull().default("public"),
  contentVisibility: text("content_visibility").notNull().default("public"),

  // ── Public identity (AGORA 2026 design) ──────────────────────────────────
  // The community card and header show a face, not just a name. All nullable:
  // the 18 communities that predate this have none, and the card falls back
  // rather than inventing one.
  username: text("username"),                 // the @handle; unique when set
  coverPath: text("cover_path"),               // 2:1 banner, relative to AGORAX_MEDIA_DIR
  avatarPath: text("avatar_path"),             // 1:1 mark, same convention
  tagline: text("tagline"),                    // the line under the banner
  // One of the browse filters: koinonia | perivallon | politiki | politismos
  // | oikonomia | allilengyi | ygeia. Text with a CHECK rather than an enum,
  // because the list is a design decision and Postgres enums do not shrink.
  category: text("category"),
  region: text("region"),
  language: text("language").notNull().default("el"),
  website: text("website"),
  // Catalogue key (`<pattern>-<palette>`, see shared/thumbnails.ts), not a
  // file path. Null means nobody chose: the card derives one from the id, so
  // the slot is never blank and never reshuffles.
  thumbnailKey: text("thumbnail_key"),
});

export const communityMembers = pgTable("community_members", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").default("member"), // 'member' | 'admin' | 'founder'
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
}, (table) => ({
  communityMemberUnique: uniqueIndex('community_member_unique').on(table.communityId, table.userId),
}));

export const communityJoinRequests = pgTable("community_join_requests", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  message: text("message"),
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
  decidedByUserId: integer("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
});

// Invitations into a community. Two shapes share one table:
//   • targeted — invitedUserId set, maxUses 1. Only that user can redeem it,
//     and they get a notification pointing at the token link.
//   • link — invitedUserId null. Anyone holding the token can redeem it until
//     it expires or maxUses is reached (-1 = unlimited).
// An invite is redeemable while status = 'pending', expiresAt is in the future
// (or null), and useCount is below maxUses. Redeeming increments useCount and
// flips status to 'accepted' once exhausted; 'revoked' kills it early.
export const communityInvites = pgTable("community_invites", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  invitedUserId: integer("invited_user_id").references(() => users.id, { onDelete: "cascade" }),
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  role: text("role").notNull().default("member"), // role granted on redemption: 'member' | 'admin'
  maxUses: integer("max_uses").notNull().default(1), // -1 = unlimited
  useCount: integer("use_count").notNull().default(0),
  message: text("message"),
  status: text("status").notNull().default("pending"), // 'pending' | 'accepted' | 'revoked'
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at"), // most recent redemption
});

// Liquid settings votes for autonomous communities. Each member can cast one
// vote per (community, settingKey); the community setting tracks the
// plurality winner. choiceValue is text — booleans serialise to 'true'/'false',
// numbers/decimals to their string form, enums to the enum literal.
export const communitySettingVotes = pgTable("community_setting_votes", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  settingKey: text("setting_key").notNull(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  choiceValue: text("choice_value").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  communitySettingVoteUnique: uniqueIndex('community_setting_votes_unique_idx').on(table.communityId, table.settingKey, table.userId),
}));

// ─── Proposals (Προβουλεύματα) ────────────────────────────────────

export const proposals = pgTable("proposals", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communities.id),
  authorId: integer("author_id").notNull().references(() => users.id),

  // Core content (Προβούλευμα = question + solution)
  question: text("question").notNull(),       // Το Ερώτημα
  solution: text("solution").notNull(),       // Η Απάντηση/Λύση
  finalText: text("final_text"),              // Τελικό κείμενο από κληρωτό σώμα (null until synthesis)

  // State machine
  status: text("status").notNull().default("draft"),
  // Canonical lifecycle lives in shared/proposal-lifecycle.ts:
  // draft → review → author_review → community_signal → sortition_synthesis → voting → decided
  // plus archived as a terminal non-decision state.

  // LLM validation
  llmScore: numeric("llm_score"),              // 0-100 score from LLM validation
  llmFeedback: text("llm_feedback"),            // Explanation for low scores
  llmValidatedAt: timestamp("llm_validated_at"),
  llmValidationRound: integer("llm_validation_round").default(1), // for appeals

  // Sortition scoring
  sortitionAvgScore: numeric("sortition_avg_score"), // weighted avg from sortition body
  sortitionRank: integer("sortition_rank"),       // rank among proposals in same cycle

  // Voting privacy mode (migration 0021). Default 'anonymous' so every new
  // proposal gets malicious-operator unlinkability. 'pseudonymous' is opt-in
  // for transparent ratification votes where the creator explicitly wants
  // public attribution.
  votingMode: text("voting_mode").notNull().default("anonymous"), // 'anonymous' | 'pseudonymous'

  // Metadata
  category: text("category"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),

  // Phase deadline — set when entering author_review, community_signal,
  // final_review, or voting. null means no deadline configured (unlimited).
  phaseDeadline: timestamp("phase_deadline"),

  // ── Two-track flow (migration 0033) ──
  // 'deliberation': short flow — amendments phase, AI-merged final text with
  // author acceptance, counter-proposals on the ballot as alternatives.
  // 'vote': straight to a yes/no/abstain vote with an author-chosen duration.
  track: text("track").notNull().default("deliberation"),
  // Author-chosen voting duration (hours) — overrides the community's
  // votingHours when this proposal enters voting. null = community default.
  // Clamped to the community's votingMin/MaxHours at transition time.
  votingDurationHours: integer("voting_duration_hours"),
  // Author-chosen deliberation duration (hours) — overrides the community's
  // communitySignalHours. null = community default. Clamped to the
  // community's deliberationMin/MaxHours at transition time.
  deliberationDurationHours: integer("deliberation_duration_hours"),
  // Option ballot for deliberation-track final votes: array of
  // { id: 'final' | 'counter_<amendmentId>' | 'status_quo', label: string }.
  // null = classic yes/no/abstain ballot (all legacy proposals).
  ballotOptions: jsonb("ballot_options"),
  // Winning option id once decided (option ballots only).
  winningOption: text("winning_option"),

  // Live final text (migration 0034): the author's standing AI-refine
  // instruction, re-applied on every live re-merge, and the moment the
  // author explicitly accepted the current text (informational signal —
  // silence still advances at the deadline).
  authorRefineInstruction: text("author_refine_instruction"),
  authorAcceptedFinalAt: timestamp("author_accepted_final_at"),
  // Catalogue key for the card picture — see shared/thumbnails.ts.
  thumbnailKey: text("thumbnail_key"),
});

// ─── Amendments (Αντιπροτάσεις & Βελτιώσεις) ──────────────────────

export const proposalAmendments = pgTable("proposal_amendments", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => users.id),

  type: text("type").notNull(), // 'improvement' (βελτίωση) | 'counter_proposal' (αντιπρόταση)

  // Set when this amendment targets a counter-proposal instead of the main
  // text. One level only: the parent must be a counter_proposal and children
  // cannot themselves be counter_proposals.
  parentAmendmentId: integer("parent_amendment_id").references((): any => proposalAmendments.id, { onDelete: "cascade" }),

  // Content
  text: text("text").notNull(),

  // AI-restyled version of a counter_proposal, rewritten to match the final
  // proposal's structure/style so it can stand on the ballot as a complete
  // alternative (migration 0033). null until the final_review merge runs.
  restyledText: text("restyled_text"),

  // Author review (Κρίση συγγραφέα)
  authorDecision: text("author_decision"), // 'accepted' | 'rejected' | null (not yet reviewed)
  authorReason: text("author_reason"),     // Author's justification for rejection

  // Community signal (Κρίση κοινότητας — votes on rejected amendments)
  rejectionUpvotes: integer("rejection_upvotes").default(0),  // ⬆️ disagree with rejection
  rejectionDownvotes: integer("rejection_downvotes").default(0), // ⬇️ agree with rejection

  // Status (legacy field, kept for backward compatibility)
  status: text("status").default("pending"), // 'pending' | 'accepted' | 'rejected' | 'under_review'
  authorVeto: boolean("author_veto").default(false), // original author vetoed this amendment

  // LLM validation
  llmScore: numeric("llm_score"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Amendment Rejection Votes (Κρίση κοινότητας) ─────────────────

export const amendmentRejectionVotes = pgTable("amendment_rejection_votes", {
  id: serial("id").primaryKey(),
  amendmentId: integer("amendment_id").notNull().references(() => proposalAmendments.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  vote: integer("vote").notNull(), // +1 (disagree with rejection) or -1 (agree with rejection)
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  amendmentVoteUnique: uniqueIndex('amendment_vote_unique').on(table.amendmentId, table.userId),
}));

// ─── Amendment Comments (Σχόλια επί τροπολογίας) ──────────────────
// Discussion attached to one amendment rather than to the proposal as a
// whole. The proposal-wide debate threads sat in their own tab and drew a
// fraction of the traffic amendments did, because a remark about a specific
// proposed change had nowhere to live next to the change itself. Flat by
// design: replies-to-replies belong in the debate tab, a comment here is a
// remark about this one amendment.

export const amendmentComments = pgTable("amendment_comments", {
  id: serial("id").primaryKey(),
  amendmentId: integer("amendment_id").notNull().references(() => proposalAmendments.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // The panel loads every comment for a proposal's amendments at once.
  amendmentCommentByAmendment: index('amendment_comment_by_amendment').on(table.amendmentId, table.createdAt),
}));

// ─── LLM Validation Results (Αξιολογήσεις LLM) ────────────────────
// Persists the structured output of `validateProposal` so the score, the
// freeform feedback, the per-criterion breakdown, and the routing category
// (return / sortition / auto_approve) survive across requests. The
// `proposals.llmScore` / `llmFeedback` columns keep the latest scalar values
// for fast list rendering; the full history (one row per validation round)
// lives here.

export const validationResults = pgTable("validation_results", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),                    // 0-100
  feedback: text("feedback"),                            // Λεκτικό σχόλιο LLM
  details: jsonb("details"),                             // { clarity, structure, civic } — older rows: { structure, specificity, feasibility, completeness, clarity }
  category: text("category").notNull(),                  // 'return' | 'sortition' | 'auto_approve'
  validatedAt: timestamp("validated_at").notNull().defaultNow(),
});

// ─── Sortition Notifications ──────────────────────────────────────

export const sortitionNotifications = pgTable("sortition_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'sortition_assigned' | 'sortition_deadline' | 'sortition_reminder' | 'proposal_advanced' | 'amendment_ready' | 'vote_started'
  title: text("title").notNull(),
  message: text("message"),
  sortitionBodyId: integer("sortition_body_id").references(() => sortitionBodies.id, { onDelete: "cascade" }),
  proposalId: integer("proposal_id").references(() => proposals.id, { onDelete: "cascade" }),
  communityId: integer("community_id").references(() => communities.id, { onDelete: "cascade" }),
  read: boolean("read").notNull().default(false),
  actionUrl: text("action_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  readAt: timestamp("read_at"),
});

// ─── Sortition Bodies (Κληρωτά Σώματα) ────────────────────────────

export const sortitionBodies = pgTable("sortition_bodies", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communities.id),
  purpose: text("purpose").notNull(), // 'validity_check' | 'scoring' | 'conflict_resolution' | 'vote_promotion'
  proposalId: integer("proposal_id").references(() => proposals.id), // NULL if not tied to specific proposal

  size: integer("size").notNull(),           // target number of members
  responseHours: integer("response_hours").default(72),

  status: text("status").default("selecting"), // 'selecting' | 'active' | 'completed' | 'timeout'

  selectedAt: timestamp("selected_at"),
  completedAt: timestamp("completed_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sortitionMembers = pgTable("sortition_members", {
  id: serial("id").primaryKey(),
  bodyId: integer("body_id").notNull().references(() => sortitionBodies.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  responded: boolean("responded").default(false),
  score: numeric("score"),                    // individual score (0-10 or 0-100)
  feedback: text("feedback"),                  // optional written justification for the score
  scoredAt: timestamp("scored_at"),
}, (table) => ({
  sortitionMemberUnique: uniqueIndex('sortition_member_unique').on(table.bodyId, table.userId),
}));

// ─── Debate Threads (Διάλογος σε νήματα) ──────────────────────────
// Real-time threaded discussion attached to a proposal during deliberation.
// `parentId` is null for top-level threads and points at another row for
// replies. Active only while the proposal is in a deliberation state — the
// route layer enforces this so historical threads survive once voting opens.

export const debateThreads = pgTable("debate_threads", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => users.id),
  parentId: integer("parent_id").references((): any => debateThreads.id, { onDelete: "cascade" }), // null = top-level
  content: text("content").notNull(),
  upvotes: integer("upvotes").default(0),
  downvotes: integer("downvotes").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const debateVotes = pgTable("debate_votes", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => debateThreads.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  direction: text("direction").notNull(), // 'up' | 'down'
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Ένας χρήστης μία ψήφος ανά νήμα.
  debateVoteUnique: uniqueIndex('debate_vote_unique').on(table.threadId, table.userId),
}));

// ─── Debate Arguments (Διάλογος) ──────────────────────────────────

export const debateArguments = pgTable("debate_arguments", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => users.id),

  side: text("side").notNull(),   // 'for' | 'against'
  text: text("text").notNull(),

  // Support mechanism (likes/dislikes from consultation.md)
  supportCount: integer("support_count").default(0),
  oppositionCount: integer("opposition_count").default(0),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Proposal Support (Συγκέντρωση Υποστήριξης) ───────────────────

export const proposalSupport = pgTable("proposal_support", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'support' | 'oppose'
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  proposalSupportUnique: uniqueIndex('proposal_support_unique').on(table.proposalId, table.userId, table.type),
}));

// ─── Proposal Final Ratification Votes (Επικυρωτική Ψηφοφορία) ────
// Append-only ledger of ratification votes cast during the `voting` phase.
// Each row links to its predecessor via prev_hash, forming a per-proposal
// SHA-256 hash chain. A user changing their vote inserts a NEW row and the
// previous row's superseded_by_id is set to the new row's id. Reads that
// want "the user's current vote" must filter superseded_by_id IS NULL.
export const proposalVotes = pgTable("proposal_votes", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  // Nullable for two distinct reasons:
  //   (a) Art. 17 crypto-shred (erased_at set): see migration 0017 and
  //       docs/compliance/INTERNAL_POLICIES.md §2.4.
  //   (b) voting_mode='anonymous': vote_token is set instead of user_id.
  //       The (user → choice) link is absent from the schema by design.
  //       See migration 0021 and docs/compliance/04_ANONYMOUS_VOTING_DESIGN.md.
  userId: integer("user_id").references(() => users.id),
  voteToken: text("vote_token"),                        // anonymous-mode only
  votingMode: text("voting_mode").notNull().default("pseudonymous"), // 'pseudonymous' | 'anonymous'
  choice: text("choice").notNull(),                     // 'yes' | 'no' | 'abstain'
  weight: numeric("weight").notNull().default("1"),
  castAt: timestamp("cast_at").notNull(),
  prevHash: text("prev_hash").notNull(),
  rowHash: text("row_hash").notNull(),
  supersededById: integer("superseded_by_id"),
  erasedAt: timestamp("erased_at"),
}, (table) => ({
  proposalChainIdx: uniqueIndex('proposal_votes_proposal_id_idx').on(table.proposalId, table.id),
}));

// Anonymous-voting key store. One RSA keypair per proposal that runs in
// voting_mode='anonymous'. The private exponent d is AES-256-GCM encrypted
// at rest using a key derived (HKDF-SHA256) from the server-only
// SIGNING_MASTER_KEY env var, with the proposal id as the HKDF info field.
export const blindSigKeys = pgTable("blind_sig_keys", {
  proposalId: integer("proposal_id")
    .primaryKey()
    .references(() => proposals.id, { onDelete: "cascade" }),
  publicN: text("public_n").notNull(),
  publicE: text("public_e").notNull(),
  secretDCiphertext: text("secret_d_ciphertext").notNull(),
  secretDIv: text("secret_d_iv").notNull(),
  secretDTag: text("secret_d_tag").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Issuance ledger — proves one-blind-sig-per-(member, proposal) without
// recording the token itself. Operator sees "user X participated in
// proposal Y." Operator does NOT learn the unblinded token or the choice.
export const blindSigIssuance = pgTable("blind_sig_issuance", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
}, (table) => ({
  unique: uniqueIndex('blind_sig_issuance_unique').on(table.proposalId, table.userId),
}));

// ─── ElectionGuard verifiable voting (@agorax/voting backend) ───────────────
// Used only when VOTING_BACKEND=electionguard. One election per proposal,
// created lazily when the voting phase opens or the first ballot is cast.
//
// dev_guardian_secrets holds the trustee secret key shares SERVER-SIDE. That
// is a development-only compromise: with the shares on the server the host
// can decrypt, so this backend does NOT yet deliver vote privacy. Real
// privacy needs client-side encryption (SDK Phase 6) and trustees that hold
// their own shares off-server. The column name is deliberately loud.
export const egElections = pgTable("eg_elections", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  threshold: integer("threshold").notNull(),
  guardianCount: integer("guardian_count").notNull(),
  jointPublicKey: text("joint_public_key").notNull(),
  guardianCommitments: jsonb("guardian_commitments").notNull(),
  devGuardianSecrets: jsonb("dev_guardian_secrets").notNull(),
  status: text("status").notNull().default("open"), // 'open' | 'closed'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
}, (table) => ({
  egElectionProposalUnique: uniqueIndex('eg_elections_proposal_id_unique').on(table.proposalId),
}));

// One encrypted ballot per cast. Re-voting inserts a new row and sets the
// previous row's superseded_by_id; the tally uses only non-superseded rows.
export const egBallots = pgTable("eg_ballots", {
  id: serial("id").primaryKey(),
  electionId: integer("election_id").notNull().references(() => egElections.id, { onDelete: "cascade" }),
  // Nullable for Art. 17 crypto-shred (see migration 0017 + proposalVotes).
  userId: integer("user_id").references(() => users.id),
  erasedAt: timestamp("erased_at"),
  ciphertextBallot: jsonb("ciphertext_ballot").notNull(),
  castAt: timestamp("cast_at").notNull().defaultNow(),
  supersededById: integer("superseded_by_id"),
});

// The published election record + decrypted tally, written once at close.
export const egElectionRecords = pgTable("eg_election_records", {
  id: serial("id").primaryKey(),
  electionId: integer("election_id").notNull().references(() => egElections.id, { onDelete: "cascade" }),
  record: jsonb("record").notNull(),
  tally: jsonb("tally").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  egRecordElectionUnique: uniqueIndex('eg_election_records_election_id_unique').on(table.electionId),
}));

// ─── Democracy Points (ο μισθός εκκλησιαστικός — civic-participation credit) ─
// An append-only ledger that records civic contribution. Points are NOT a
// token and have no monetary value until the platform reaches a revenue phase
// (see platform_settings key `economy.phase`); redemption is gated on that
// phase AND on identity verification. See docs / the economy modules.

// Append-only transaction ledger — every point movement is one row.
export const pointTransactions = pgTable("point_transactions", {
  id: serial("id").primaryKey(),
  // Nullable for Art. 17 crypto-shred (see migration 0019). The ledger row
  // survives for treasury reconciliation; only the user binding is gone.
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // 'participation' | 'redemption' | 'civic_dividend' | 'referral' | 'adjustment'
  points: integer("points").notNull(), // signed: positive = credit, negative = debit
  actionKey: text("action_key").notNull(), // e.g. 'sortition_score', 'ratification_vote'
  refType: text("ref_type").notNull().default(''), // e.g. 'proposal', 'amendment', 'sortition_member'
  refId: integer("ref_id").notNull().default(0),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // One award per (user, action, target) — makes awardPoints idempotent.
  pointTxnIdempotency: uniqueIndex('point_transactions_idempotency')
    .on(table.userId, table.actionKey, table.refType, table.refId),
  pointTxnUserIdx: index('point_transactions_user_idx').on(table.userId),
}));

// Cached per-user balance — a projection of the ledger for fast reads.
export const pointBalances = pgTable("point_balances", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  lifetimeEarned: integer("lifetime_earned").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Redemption requests — opened only past the pre_revenue phase, by verified users.
export const pointRedemptions = pgTable("point_redemptions", {
  id: serial("id").primaryKey(),
  // Nullable for Art. 17 crypto-shred (see migration 0019). Redemption
  // history survives for treasury accounting; user binding is severed.
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  points: integer("points").notNull(),
  eurAmount: numeric("eur_amount").notNull(),
  targetCurrency: text("target_currency").notNull().default('EUR'),
  status: text("status").notNull().default('requested'), // 'requested' | 'approved' | 'paid' | 'rejected'
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
});

// Transparent treasury ledger — backs redemption honestly; public totals.
export const treasuryLedger = pgTable("treasury_ledger", {
  id: serial("id").primaryKey(),
  entryType: text("entry_type").notNull(), // 'inbound_payment' | 'citizen_payout' | 'operations_expense' | 'dividend'
  eurAmount: numeric("eur_amount").notNull(),
  refType: text("ref_type").notNull().default(''),
  refId: integer("ref_id"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Admin Action Log ───────────────────────────────────────────────────────

export const adminActions = pgTable("admin_actions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  communityId: integer("community_id").references(() => communities.id),
  actionType: text("action_type").notNull(), // 'delete_comment' | 'ban_user' | 'override_sortition_timeout' | 'manage_membership' | 'moderate_proposal'
  targetId: integer("target_id"),
  details: jsonb("details"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// ─── Platform Settings (Καθολικές ρυθμίσεις πλατφόρμας) ─────────────────────
// Key/value store for instance-wide defaults that the General community can
// vote to change (sortition body size, validation model, similarity
// threshold, etc.). Values are stored as text — callers parse to the type
// they expect. lastChangedBy/At record who flipped the switch and when, so
// changes have an audit trail without a separate log table.

export const platformSettings = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  lastChangedBy: integer("last_changed_by").references(() => users.id),
  lastChangedAt: timestamp("last_changed_at").defaultNow(),
});

// ─── Proposal Media (Podcasts & Video Teasers per πρόταση) ──────────────────
// User-uploaded audio (MP3) and video (MP4) content tied to a proposal.
// The platform generates a script from the proposal text + top arguments;
// the user takes that script to NotebookLM (or similar) externally to
// produce media, then uploads the result here. The proposal author
// curates: any community member can submit, but the author can feature,
// hide, or delete. The "featured" entry is what appears in the global
// /feed and on the public share routes.
export const proposalMedia = pgTable("proposal_media", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  uploaderId: integer("uploader_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),                          // 'podcast' | 'video'
  title: text("title"),                                   // user-provided post name
  filePath: text("file_path").notNull(),                 // relative to AGORAX_MEDIA_DIR
  thumbPath: text("thumb_path"),                          // null for podcasts; jpg poster for videos
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  durationS: numeric("duration_s"),                       // ffprobe-derived; null if probe failed
  status: text("status").notNull().default("published"), // 'published' | 'hidden'
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  proposalMediaProposalIdx: index('proposal_media_proposal_idx').on(table.proposalId),
  proposalMediaFeedIdx: index('proposal_media_feed_idx').on(table.status, table.createdAt),
}));

// ─── Community Media (Βιβλιοθήκη κοινότητας) ────────────────────────────────
// Media posted INSIDE a community — audio, video, documents — deliberately
// decoupled from proposals and from the global /feed. Items live on the
// community page only, gated by the community's contentVisibility.
// Founder/admins can pin items to the top of the library ("start here"
// material). Kind reuses the proposal-media vocabulary so the upload
// validation pipeline (media-rules.ts) is shared.
export const communityMedia = pgTable("community_media", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  uploaderId: integer("uploader_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),                          // 'podcast' | 'video' | 'document'
  title: text("title").notNull(),
  description: text("description"),
  filePath: text("file_path").notNull(),                 // relative to AGORAX_MEDIA_DIR
  thumbPath: text("thumb_path"),                          // jpg poster for videos
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  durationS: numeric("duration_s"),                       // ffprobe-derived; null if probe failed
  status: text("status").notNull().default("published"), // 'published' | 'hidden'
  pinned: boolean("pinned").notNull().default(false),
  pinnedAt: timestamp("pinned_at"),
  pinnedBy: integer("pinned_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  communityMediaLibraryIdx: index('community_media_library_idx').on(table.communityId, table.pinned, table.createdAt),
}));

// ─── LiveKit Conference Rooms ───────────────────────────────────────────────
// Two flavours, gated by `kind`:
//   • 'community'  — open to every member of `communityId`; only admins can
//                    schedule/close. `sortitionBodyId` is null.
//   • 'sortition'  — restricted to members of `sortitionBodyId`. Auto-closed
//                    when the body's status flips to completed. `communityId`
//                    is the body's parent community (for listing/filtering).
//
// The Node app issues join tokens against the configured LiveKit SFU
// (LIVEKIT_URL/API_KEY/API_SECRET). The SFU itself runs as a sidecar.
// Recordings are off by default; flipping `recordingEnabled` tells the
// frontend to expose the record-toggle UI and the server to authorise
// the egress action. Storage path for any produced recording lives in
// `recordingPath` (relative to AGORAX_MEDIA_DIR).
export const livekitRooms = pgTable("livekit_rooms", {
  id: serial("id").primaryKey(),
  roomName: text("room_name").notNull().unique(),       // LiveKit room identifier
  kind: text("kind").notNull(),                          // 'community' | 'sortition'
  title: text("title").notNull(),
  // Free text: agenda, dial-in notes, links. Stored and rendered as PLAIN
  // TEXT — the client linkifies URLs into anchors itself and never injects
  // HTML, since any community member can write this.
  description: text("description"),
  communityId: integer("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  sortitionBodyId: integer("sortition_body_id").references(() => sortitionBodies.id, { onDelete: "cascade" }),
  createdById: integer("created_by_id").notNull().references(() => users.id),
  scheduledAt: timestamp("scheduled_at"),
  status: text("status").notNull().default("active"),    // 'scheduled' | 'active' | 'closed'
  recordingEnabled: boolean("recording_enabled").notNull().default(false),
  recordingPath: text("recording_path"),
  // Set when the "starts soon" reminder fan-out has gone out, so the sweep
  // is idempotent. Cleared whenever the organiser moves the meeting, which
  // is what makes the new time get its own reminder.
  reminderSentAt: timestamp("reminder_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
}, (table) => ({
  livekitCommunityIdx: index('livekit_rooms_community_idx').on(table.communityId, table.status),
  livekitSortitionUnique: uniqueIndex('livekit_rooms_sortition_unique').on(table.sortitionBodyId),
}));

// ─── LiveKit participation log ──────────────────────────────────────────────
// One row per (room, user) join. We insert at token-issue time (since
// that's the last server-side touchpoint before the browser opens the
// wss) and update left_at via a navigator.sendBeacon when the LiveKit
// React provider fires onDisconnected. If the beacon never lands —
// laptop closed, network dropped, tab killed — left_at stays NULL and
// the "recent calls" UI falls back to the room's closed_at for
// duration accounting. A user can join the same room multiple times,
// each producing its own row, which is the honest record.
export const livekitParticipations = pgTable("livekit_participations", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => livekitRooms.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  leftAt: timestamp("left_at"),
}, (table) => ({
  livekitPartRoomIdx: index('livekit_participations_room_idx').on(table.roomId),
  livekitPartUserIdx: index('livekit_participations_user_idx').on(table.userId),
}));

// ─── Web Push Subscriptions ─────────────────────────────────────────────────
// One row per (user, browser instance). The browser produces (endpoint,
// p256dh, auth) at subscribe-time via the Push API; we send notifications
// by POST-ing an encrypted payload to that endpoint via the web-push lib.
// Endpoint is unique because the same browser keeps the same endpoint for
// its lifetime (until the user clears site data).
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),                      // bookkeeping for the user
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
}, (table) => ({
  pushSubsUserIdx: index('push_subscriptions_user_idx').on(table.userId),
}));

// ─── Job Queue ──────────────────────────────────────────────────────────────

// ─── Password reset ─────────────────────────────────────────────────────────
// Two ways in, one table. `issuedById` NULL means the member asked for the
// link themselves through "forgot my password" and it was mailed to them
// (30-minute expiry); a user id means an admin minted it and delivered it
// out of band (24 hours), which is still the route for someone who has lost
// access to their address. Only the SHA-256 of the token is stored — a
// database reader cannot replay a link, same rule as the panel tokens and
// claim codes.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  issuedById: integer("issued_by_id").references(() => users.id),
  requestedIp: text("requested_ip"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  passwordResetUserIdx: index('password_reset_tokens_user_idx').on(table.userId),
  passwordResetExpiresIdx: index('password_reset_tokens_expires_idx').on(table.expiresAt),
}));

// Proof that a member controls the address on their account.
//
// Same construction as the reset tokens: only the SHA-256 is stored. `email`
// pins the link to one specific address, so changing the address before
// clicking retires the link rather than verifying the new one.
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  emailVerifyUserIdx: index('email_verification_tokens_user_idx').on(table.userId),
  emailVerifyExpiresIdx: index('email_verification_tokens_expires_idx').on(table.expiresAt),
}));

// Rate-limit counters for self-service reset. Addresses are HMACed with a key
// derived from SIGNING_MASTER_KEY — the response is identical whether or not
// an account exists, so this table would otherwise accumulate every address
// anyone ever typed into the form, most of them belonging to nobody here.
export const passwordResetRequests = pgTable("password_reset_requests", {
  id: serial("id").primaryKey(),
  emailHmac: text("email_hmac").notNull(),
  ipHmac: text("ip_hmac"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
}, (table) => ({
  resetReqEmailIdx: index('password_reset_requests_email_idx').on(table.emailHmac, table.requestedAt),
  resetReqIpIdx: index('password_reset_requests_ip_idx').on(table.ipHmac, table.requestedAt),
}));

// ─── Optional-email preferences ─────────────────────────────────────────────
// Categories live in a jsonb map, not a column each: the in-app preferences
// of 0003b took the column-per-type route and every notification type added
// since shipped with no preference, because adding one meant a migration
// nobody wrote. The catalogue is shared/email-categories.ts.
export const emailNotificationPrefs = pgTable("email_notification_prefs", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  masterEnabled: boolean("master_enabled").notNull().default(true),
  categories: jsonb("categories").notNull().default({}),
  // Opaque subject for the signed unsubscribe link — carries no user id and
  // no address, so a link in an inbox cannot be read back into an identity.
  unsubscribeId: text("unsubscribe_id").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Idempotency ledger. The row is claimed before the SMTP call, so a retried
// job or two overlapping fan-outs cannot mail the same member twice.
export const emailDeliveries = pgTable("email_deliveries", {
  id: serial("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  template: text("template").notNull(),
  status: text("status").notNull().default("queued"), // queued | sent | failed | suppressed
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
}, (table) => ({
  emailDeliveriesCreatedIdx: index('email_deliveries_created_idx').on(table.createdAt),
  emailDeliveriesUserIdx: index('email_deliveries_user_idx').on(table.userId),
}));

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // 'structure_proposal' | 'send_notification' | 'create_sortition' | 'recalculate_score' | 'cleanup_expired'
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'processing' | 'completed' | 'failed'
  priority: text("priority").notNull().default("normal"), // 'low' | 'normal' | 'high'
  result: jsonb("result"),
  error: text("error"),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  polls: many(polls),
  votes: many(votes),
  comments: many(comments),
  accountActivity: many(accountActivity),
  communityMemberships: many(communityMembers),
  proposals: many(proposals),
  proposalAmendments: many(proposalAmendments),
  debateArguments: many(debateArguments),
  proposalSupport: many(proposalSupport),
  sortitionMemberships: many(sortitionMembers),
  adminActions: many(adminActions),
}));

export const pollsRelations = relations(polls, ({ one, many }) => ({
  creator: one(users, {
    fields: [polls.creatorId],
    references: [users.id],
  }),
  community: one(communities, {
    fields: [polls.communityId],
    references: [communities.id],
  }),
  options: many(pollOptions),
  votes: many(votes),
  comments: many(comments),
  notifications: many(pollNotifications),
}));

export const pollOptionsRelations = relations(pollOptions, ({ one, many }) => ({
  poll: one(polls, {
    fields: [pollOptions.pollId],
    references: [polls.id],
  }),
  votes: many(votes),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  poll: one(polls, {
    fields: [votes.pollId],
    references: [polls.id],
  }),
  user: one(users, {
    fields: [votes.userId],
    references: [users.id],
  }),
  option: one(pollOptions, {
    fields: [votes.optionId],
    references: [pollOptions.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  poll: one(polls, {
    fields: [comments.pollId],
    references: [polls.id],
  }),
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
}));

export const pollNotificationsRelations = relations(pollNotifications, ({ one }) => ({
  user: one(users, {
    fields: [pollNotifications.userId],
    references: [users.id],
  }),
  poll: one(polls, {
    fields: [pollNotifications.pollId],
    references: [polls.id],
  }),
}));

export const accountActivityRelations = relations(accountActivity, ({ one }) => ({
  user: one(users, {
    fields: [accountActivity.userId],
    references: [users.id],
  }),
}));

export const ballotVotesRelations = relations(ballotVotes, ({ one }) => ({
  poll: one(polls, {
    fields: [ballotVotes.pollId],
    references: [polls.id],
  }),
}));

export const pollQuestionsRelations = relations(pollQuestions, ({ one, many }) => ({
  poll: one(polls, {
    fields: [pollQuestions.pollId],
    references: [polls.id],
  }),
  parentQuestion: one(pollQuestions, {
    fields: [pollQuestions.parentId],
    references: [pollQuestions.id],
  }),
  parentAnswer: one(pollAnswers, {
    fields: [pollQuestions.parentAnswerId],
    references: [pollAnswers.id],
  }),
  answers: many(pollAnswers),
  responses: many(pollUserResponses),
  childQuestions: many(pollQuestions, { relationName: "childToParent" }),
}));

export const pollAnswersRelations = relations(pollAnswers, ({ one, many }) => ({
  question: one(pollQuestions, {
    fields: [pollAnswers.questionId],
    references: [pollQuestions.id],
  }),
  responses: many(pollUserResponses),
  childQuestions: many(pollQuestions, { relationName: "answerToQuestion" }),
}));

export const pollUserResponsesRelations = relations(pollUserResponses, ({ one }) => ({
  poll: one(polls, {
    fields: [pollUserResponses.pollId],
    references: [polls.id],
  }),
  question: one(pollQuestions, {
    fields: [pollUserResponses.questionId],
    references: [pollQuestions.id],
  }),
  user: one(users, {
    fields: [pollUserResponses.userId],
    references: [users.id],
  }),
  answer: one(pollAnswers, {
    fields: [pollUserResponses.answerId],
    references: [pollAnswers.id],
  }),
}));

// ─── Deliberation Relations ─────────────────────────────────────────────────────

export const communitiesRelations = relations(communities, ({ one, many }) => ({
  creator: one(users, {
    fields: [communities.creatorId],
    references: [users.id],
  }),
  members: many(communityMembers),
  proposals: many(proposals),
  sortitionBodies: many(sortitionBodies),
  adminActions: many(adminActions),
}));

export const communityMembersRelations = relations(communityMembers, ({ one }) => ({
  community: one(communities, {
    fields: [communityMembers.communityId],
    references: [communities.id],
  }),
  user: one(users, {
    fields: [communityMembers.userId],
    references: [users.id],
  }),
}));

export const proposalsRelations = relations(proposals, ({ one, many }) => ({
  community: one(communities, {
    fields: [proposals.communityId],
    references: [communities.id],
  }),
  author: one(users, {
    fields: [proposals.authorId],
    references: [users.id],
  }),
  amendments: many(proposalAmendments),
  debateArguments: many(debateArguments),
  debateThreads: many(debateThreads),
  support: many(proposalSupport),
  sortitionBodies: many(sortitionBodies),
  validationResults: many(validationResults),
}));

export const validationResultsRelations = relations(validationResults, ({ one }) => ({
  proposal: one(proposals, {
    fields: [validationResults.proposalId],
    references: [proposals.id],
  }),
}));

export const proposalAmendmentsRelations = relations(proposalAmendments, ({ one }) => ({
  proposal: one(proposals, {
    fields: [proposalAmendments.proposalId],
    references: [proposals.id],
  }),
  author: one(users, {
    fields: [proposalAmendments.authorId],
    references: [users.id],
  }),
}));

export const sortitionBodiesRelations = relations(sortitionBodies, ({ one, many }) => ({
  community: one(communities, {
    fields: [sortitionBodies.communityId],
    references: [communities.id],
  }),
  proposal: one(proposals, {
    fields: [sortitionBodies.proposalId],
    references: [proposals.id],
  }),
  members: many(sortitionMembers),
}));

export const sortitionMembersRelations = relations(sortitionMembers, ({ one }) => ({
  body: one(sortitionBodies, {
    fields: [sortitionMembers.bodyId],
    references: [sortitionBodies.id],
  }),
  user: one(users, {
    fields: [sortitionMembers.userId],
    references: [users.id],
  }),
}));

export const sortitionNotificationsRelations = relations(sortitionNotifications, ({ one }) => ({
  user: one(users, {
    fields: [sortitionNotifications.userId],
    references: [users.id],
  }),
  body: one(sortitionBodies, {
    fields: [sortitionNotifications.sortitionBodyId],
    references: [sortitionBodies.id],
  }),
  proposal: one(proposals, {
    fields: [sortitionNotifications.proposalId],
    references: [proposals.id],
  }),
  community: one(communities, {
    fields: [sortitionNotifications.communityId],
    references: [communities.id],
  }),
}));

export const debateThreadsRelations = relations(debateThreads, ({ one, many }) => ({
  proposal: one(proposals, {
    fields: [debateThreads.proposalId],
    references: [proposals.id],
  }),
  author: one(users, {
    fields: [debateThreads.authorId],
    references: [users.id],
  }),
  parent: one(debateThreads, {
    fields: [debateThreads.parentId],
    references: [debateThreads.id],
    relationName: 'thread_parent',
  }),
  replies: many(debateThreads, { relationName: 'thread_parent' }),
  votes: many(debateVotes),
}));

export const debateVotesRelations = relations(debateVotes, ({ one }) => ({
  thread: one(debateThreads, {
    fields: [debateVotes.threadId],
    references: [debateThreads.id],
  }),
  user: one(users, {
    fields: [debateVotes.userId],
    references: [users.id],
  }),
}));

export const debateArgumentsRelations = relations(debateArguments, ({ one }) => ({
  proposal: one(proposals, {
    fields: [debateArguments.proposalId],
    references: [proposals.id],
  }),
  author: one(users, {
    fields: [debateArguments.authorId],
    references: [users.id],
  }),
}));

export const proposalSupportRelations = relations(proposalSupport, ({ one }) => ({
  proposal: one(proposals, {
    fields: [proposalSupport.proposalId],
    references: [proposals.id],
  }),
  user: one(users, {
    fields: [proposalSupport.userId],
    references: [users.id],
  }),
}));

export const proposalVotesRelations = relations(proposalVotes, ({ one }) => ({
  proposal: one(proposals, {
    fields: [proposalVotes.proposalId],
    references: [proposals.id],
  }),
  user: one(users, {
    fields: [proposalVotes.userId],
    references: [users.id],
  }),
}));

export const adminActionsRelations = relations(adminActions, ({ one }) => ({
  user: one(users, {
    fields: [adminActions.userId],
    references: [users.id],
  }),
  community: one(communities, {
    fields: [adminActions.communityId],
    references: [communities.id],
  }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertPollNotificationSchema = createInsertSchema(pollNotifications).omit({ id: true, createdAt: true });
export const insertAccountActivitySchema = createInsertSchema(accountActivity).omit({ id: true, timestamp: true });
export const insertPollSchema = createInsertSchema(polls)
  .omit({ id: true, createdAt: true })
  .extend({
    // We store dates as strings in the form and transform them to Date when submitting
    startDate: z.union([
      z.string().transform(str => {
        const date = new Date(str);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid start date format');
        }
        return date;
      }),
      z.date()
    ]),
    endDate: z.union([
      z.string().transform(str => {
        const date = new Date(str);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid end date format');
        }
        return date;
      }),
      z.date()
    ]),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  });
export const insertPollOptionSchema = createInsertSchema(pollOptions).omit({ id: true });
export const insertVoteSchema = createInsertSchema(votes).omit({ id: true, createdAt: true });
export const insertCommentSchema = createInsertSchema(comments).omit({ id: true, createdAt: true });

// Extended vote schema for ranking polls with JSON answerValue
export const rankingVoteSchema = z.object({
  pollId: z.number(),
  userId: z.number(),
  orderedOptionIds: z.array(z.number()),
  optionId: z.number().optional(), // Still needed for database compatibility
  comment: z.string().optional(),
});

// Survey Poll Insert Schemas
export const insertPollQuestionSchema = createInsertSchema(pollQuestions).omit({ id: true });
export const insertPollAnswerSchema = createInsertSchema(pollAnswers).omit({ id: true });
export const insertPollUserResponseSchema = createInsertSchema(pollUserResponses).omit({ id: true, createdAt: true });
// Deliberation Insert Schemas
export const insertCommunitySchema = createInsertSchema(communities).omit({ id: true, createdAt: true });
export const insertPlatformSettingSchema = createInsertSchema(platformSettings).omit({ id: true, lastChangedAt: true });
export const insertCommunityMemberSchema = createInsertSchema(communityMembers).omit({ id: true, joinedAt: true });
export const insertCommunityJoinRequestSchema = createInsertSchema(communityJoinRequests).omit({ id: true, createdAt: true, decidedAt: true, decidedByUserId: true, status: true });
export const insertProposalSchema = createInsertSchema(proposals).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProposalAmendmentSchema = createInsertSchema(proposalAmendments).omit({ id: true, createdAt: true });
export const insertValidationResultSchema = createInsertSchema(validationResults).omit({ id: true, validatedAt: true });
export const insertSortitionBodySchema = createInsertSchema(sortitionBodies).omit({ id: true, createdAt: true });
export const insertSortitionMemberSchema = createInsertSchema(sortitionMembers).omit({ id: true });
export const insertDebateArgumentSchema = createInsertSchema(debateArguments).omit({ id: true, createdAt: true });
export const insertDebateThreadSchema = createInsertSchema(debateThreads).omit({ id: true, createdAt: true, updatedAt: true, upvotes: true, downvotes: true });
export const insertDebateVoteSchema = createInsertSchema(debateVotes).omit({ id: true, createdAt: true });
export const insertProposalSupportSchema = createInsertSchema(proposalSupport).omit({ id: true, createdAt: true });
export const insertProposalMediaSchema = createInsertSchema(proposalMedia).omit({ id: true, createdAt: true });
export const insertCommunityMediaSchema = createInsertSchema(communityMedia).omit({ id: true, createdAt: true });
export const insertLivekitRoomSchema = createInsertSchema(livekitRooms).omit({ id: true, createdAt: true, closedAt: true });
export const insertProposalVoteSchema = createInsertSchema(proposalVotes).omit({ id: true, castAt: true, prevHash: true, rowHash: true, supersededById: true });

// Classic ballots use yes/no/abstain; option ballots (deliberation track
// with counter-proposal alternatives) use ids like 'final', 'counter_12',
// 'status_quo'. The route validates against the proposal's actual option
// set — this schema only enforces shape.
export const proposalVoteChoiceSchema = z.string().min(1).max(64).regex(/^[a-z0-9_]+$/);
export const CLASSIC_BALLOT_CHOICES = ['yes', 'no', 'abstain'] as const;

export interface BallotOption { id: string; label: string }

/** The valid choice ids for a proposal, from its ballotOptions or the classic trio. */
export function validBallotChoices(proposal: { ballotOptions?: unknown }): string[] {
  const opts = proposal.ballotOptions;
  if (Array.isArray(opts) && opts.length > 0) {
    return (opts as BallotOption[]).map(o => o.id);
  }
  return [...CLASSIC_BALLOT_CHOICES];
}
export const castProposalVoteSchema = z.object({
  choice: proposalVoteChoiceSchema,
});
export const insertAdminActionSchema = createInsertSchema(adminActions).omit({ id: true, timestamp: true });

// Poll with options schema for creation
export const createPollSchema = z.object({
  poll: insertPollSchema.extend({
    // Make these optional so they can be removed after processing
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  }),
  options: z.array(z.object({
    text: z.string().min(1),
    order: z.number(),
  })),
  // Allow for holding these values outside the poll object during form processing
  startTime: z.string().optional(),
  endTime: z.string().optional()
});

// Survey poll schema for creation
export const createSurveyPollSchema = z.object({
  poll: insertPollSchema.extend({
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    pollType: z.literal("surveyPoll"),
  }),
  questions: z.array(z.object({
    id: z.number().optional(), // Frontend temp ID for mapping
    text: z.string().min(1, { message: "Το κείμενο της ερώτησης είναι υποχρεωτικό" }),
    questionType: z.enum(["singleChoice", "multipleChoice", "ordering"], {
      errorMap: () => ({ message: "Ο τύπος της ερώτησης είναι υποχρεωτικός" })
    }),
    required: z.boolean().default(true),
    order: z.number(),
    parentId: z.number().optional(),
    parentAnswerId: z.number().optional(),
    answers: z.array(z.object({
      id: z.number().optional(), // Frontend temp ID for React keys
      text: z.string().min(1, { message: "Το κείμενο της απάντησης είναι υποχρεωτικό" }),
      order: z.number(),
    })).min(2, { message: "Χρειάζονται τουλάχιστον δύο επιλογές απάντησης" }),
  })).min(1, { message: "Χρειάζεται τουλάχιστον μια ερώτηση" }),
  // Allow for holding these values outside the poll object during form processing
  startTime: z.string().optional(),
  endTime: z.string().optional()
});

/**
 * What counts as an acceptable password, in one place.
 *
 * Registration and password reset must agree — a reset that accepted weaker
 * passwords than registration would be a way around the policy rather than a
 * way back into an account. Tightening the rule here tightens both.
 */
export const passwordPolicySchema = z
  .string()
  .min(8, { message: "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες" });

// Extended schemas with validations
export const registerUserSchema = insertUserSchema.extend({
  password: passwordPolicySchema,
  email: z.string().email({ message: "Εισάγετε έγκυρη διεύθυνση email" }),
  name: z.string().min(2, { message: "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες" }),
  returnTo: z.string().optional(), // Add returnTo field for redirection after authentication
  deviceFingerprint: z.string().optional(),
  // The interface language they registered in, so the first email we send
  // them — the address confirmation — is already in their language.
  locale: z.enum(['el', 'en']).optional(),
  // GDPR Art. 9(2)(a) — explicit consent for processing political opinions.
  // Server validates the version matches the current canonical text.
  consent: z.object({
    version: z.string(),
    locale: z.enum(['el', 'en']),
  }).optional(),
});

export const loginUserSchema = z.object({
  // Accepts a username or an email address — see the LocalStrategy in
  // server/auth.ts for why reset-by-email requires login-by-email.
  username: z.string().min(1, { message: "Συμπληρώστε όνομα χρήστη ή email" }),
  password: z.string().min(1, { message: "Ο κωδικός είναι υποχρεωτικός" }),
  returnTo: z.string().optional(), // Add returnTo field for redirection after authentication
  deviceFingerprint: z.string().optional(),
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertPollNotification = z.infer<typeof insertPollNotificationSchema>;
export type InsertAccountActivity = z.infer<typeof insertAccountActivitySchema>;
export type InsertPoll = z.infer<typeof insertPollSchema>;
export type InsertPollOption = z.infer<typeof insertPollOptionSchema>;
export type InsertVote = z.infer<typeof insertVoteSchema>;
export type RankingVote = z.infer<typeof rankingVoteSchema>;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type InsertPollQuestion = z.infer<typeof insertPollQuestionSchema>;
export type InsertPollAnswer = z.infer<typeof insertPollAnswerSchema>;
export type InsertPollUserResponse = z.infer<typeof insertPollUserResponseSchema>;
export type CreatePoll = z.infer<typeof createPollSchema>;
export type CreateSurveyPoll = z.infer<typeof createSurveyPollSchema>;
export type RegisterUser = z.infer<typeof registerUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;

export type User = typeof users.$inferSelect;
export type UserConsent = typeof userConsents.$inferSelect;
export type InsertUserConsent = typeof userConsents.$inferInsert;
export type BlindSigKey = typeof blindSigKeys.$inferSelect;
export type InsertBlindSigKey = typeof blindSigKeys.$inferInsert;
export type BlindSigIssuance = typeof blindSigIssuance.$inferSelect;
export type InsertBlindSigIssuance = typeof blindSigIssuance.$inferInsert;
export type ErasureRequest = typeof erasureRequests.$inferSelect;
export type InsertErasureRequest = typeof erasureRequests.$inferInsert;
export type PollNotification = typeof pollNotifications.$inferSelect;
export type SelectAccountActivity = typeof accountActivity.$inferSelect;
export type Poll = typeof polls.$inferSelect;
export type PollOption = typeof pollOptions.$inferSelect;
export type Vote = typeof votes.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type PollQuestion = typeof pollQuestions.$inferSelect;
export type PollAnswer = typeof pollAnswers.$inferSelect;
export type PollUserResponse = typeof pollUserResponses.$inferSelect;
export type BallotVote = typeof ballotVotes.$inferSelect;

// Deliberation Types
export type Community = typeof communities.$inferSelect;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type CommunityMember = typeof communityMembers.$inferSelect;
export type CommunityJoinRequest = typeof communityJoinRequests.$inferSelect;
export type CommunityInvite = typeof communityInvites.$inferSelect;
export type CommunitySettingVote = typeof communitySettingVotes.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type ProposalAmendment = typeof proposalAmendments.$inferSelect;
export type ValidationResult = typeof validationResults.$inferSelect;
export type SortitionBody = typeof sortitionBodies.$inferSelect;
export type SortitionMember = typeof sortitionMembers.$inferSelect;
export type SortitionNotification = typeof sortitionNotifications.$inferSelect;
export type DebateArgument = typeof debateArguments.$inferSelect;
export type DebateThread = typeof debateThreads.$inferSelect;
export type DebateVote = typeof debateVotes.$inferSelect;
export type AmendmentComment = typeof amendmentComments.$inferSelect;
export type ProposalSupport = typeof proposalSupport.$inferSelect;
export type ProposalVote = typeof proposalVotes.$inferSelect;
export type ProposalMedia = typeof proposalMedia.$inferSelect;
export type ProposalMediaKind = 'podcast' | 'video';
export type CommunityMedia = typeof communityMedia.$inferSelect;
export type InsertCommunityMedia = z.infer<typeof insertCommunityMediaSchema>;
export type CommunityMediaKind = 'podcast' | 'video' | 'document';
export type LivekitRoom = typeof livekitRooms.$inferSelect;
export type LivekitRoomKind = 'community' | 'sortition';
export type LivekitRoomStatus = 'scheduled' | 'active' | 'closed';
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type EmailNotificationPrefs = typeof emailNotificationPrefs.$inferSelect;
export type EmailDelivery = typeof emailDeliveries.$inferSelect;
export type LivekitParticipation = typeof livekitParticipations.$inferSelect;
export type ProposalVoteChoice = z.infer<typeof proposalVoteChoiceSchema>;
export type AdminAction = typeof adminActions.$inferSelect;

// Deliberation Insert Types
export type InsertCommunity = z.infer<typeof insertCommunitySchema>;
export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;
export type InsertCommunityMember = z.infer<typeof insertCommunityMemberSchema>;
export type InsertCommunityJoinRequest = z.infer<typeof insertCommunityJoinRequestSchema>;
export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type InsertProposalAmendment = z.infer<typeof insertProposalAmendmentSchema>;
export type InsertValidationResult = z.infer<typeof insertValidationResultSchema>;
export type InsertSortitionBody = z.infer<typeof insertSortitionBodySchema>;
export type InsertSortitionMember = z.infer<typeof insertSortitionMemberSchema>;
export type InsertDebateArgument = z.infer<typeof insertDebateArgumentSchema>;
export type InsertDebateThread = z.infer<typeof insertDebateThreadSchema>;
export type InsertDebateVote = z.infer<typeof insertDebateVoteSchema>;
export type InsertProposalSupport = z.infer<typeof insertProposalSupportSchema>;
export type InsertProposalVote = z.infer<typeof insertProposalVoteSchema>;
export type InsertProposalMedia = z.infer<typeof insertProposalMediaSchema>;
export type InsertLivekitRoom = z.infer<typeof insertLivekitRoomSchema>;
export type InsertAdminAction = z.infer<typeof insertAdminActionSchema>;

// Safe user type without sensitive auth/internal fields.
export type SafeUser = Pick<
  User,
  | 'id'
  | 'username'
  | 'name'
  | 'email'
  | 'profilePicture'
  | 'isAdmin'
  | 'accountStatus'
  | 'requiresConsent'
  | 'govgrVerified'
  | 'govgrVerifiedAt'
  | 'govgrFirstName'
  | 'govgrLastName'
  | 'govgrMunicipality'
  | 'govgrPostcode'
  | 'locale'
  | 'theme'
  | 'emailVerifiedAt'
>;


// Extended types
export type PollWithOptions = Poll & {
  options: PollOption[];
  creator: User;
  voteCount: number;
  userVoted?: boolean;
  community?: Community;
};

// Survey poll extended types
export type PollQuestionWithAnswers = PollQuestion & {
  answers: PollAnswer[];
  childQuestions?: PollQuestionWithAnswers[];
};

export type PollWithQuestions = Poll & {
  questions: PollQuestionWithAnswers[];
  creator: User;
  voteCount: number;
  userVoted?: boolean;
};

// Deliberation extended types
export type CommunityWithMembers = Community & {
  members: (CommunityMember & { user: SafeUser })[];
  creator: SafeUser;
  memberCount: number;
};

export type ProposalDetail = Proposal & {
  author: SafeUser;
  community: Community;
  amendments: ProposalAmendment[];
  debateArguments: DebateArgument[];
  supportCount: number;
  opposeCount: number;
};

// Interface for ranking poll results
export interface RankingStats {
  totalPoints: number;
  firstPlaceVotes: number;
  averageRank: string;
  rankDistribution: Record<number, number>;
}

// Interface for poll results with optional ranking stats
export interface PollResult {
  pollId: number;
  optionId: number;
  optionText: string;
  voteCount: number;
  percentage: number;
  isRanking?: boolean;
  rankingStats?: RankingStats;
}

// ─── Sortition Attendance ──────────────────────────────────────────────────
export const sortitionAttendance = pgTable(
  "sortition_attendance",
  {
    id: serial("id").primaryKey(),
    bodyId: integer("body_id").notNull().references(() => sortitionBodies.id, { onDelete: "cascade" }),
    memberId: integer("member_id").notNull(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // 'invited' | 'accepted' | 'declined' | 'no-show' | 'completed'
    invitedAt: timestamp("invited_at").notNull(),
    respondedAt: timestamp("responded_at"),
    completedAt: timestamp("completed_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

export type SortitionAttendance = InferSelectModel<typeof sortitionAttendance>;
export type InsertSortitionAttendance = InferInsertModel<typeof sortitionAttendance>;

// ─── Community Forum (Αγορά της κοινότητας) ─────────────────────────
// Threaded discussion that belongs to a community rather than to a proposal.
//
// The shape deliberately mirrors debateThreads — self-referencing parentId,
// up/down votes, one vote per member — so anyone who knows the proposal
// debate already knows this. It is a separate table because debateThreads
// cascades away with its proposal and its routes only open during
// deliberation; two lifecycles in one table means one eventually deletes the
// other.
//
// parentId null → a topic, which has a title.
// parentId set  → a reply to a topic, which does not. One level, not a tree:
//                 a forum thread that branches stops being readable.

export const communityPosts = pgTable("community_posts", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => users.id),
  parentId: integer("parent_id").references((): any => communityPosts.id, { onDelete: "cascade" }),
  title: text("title"),
  content: text("content").notNull(),
  upvotes: integer("upvotes").notNull().default(0),
  downvotes: integer("downvotes").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  pinned: boolean("pinned").notNull().default(false),
  // Sorted by liveliness, not birthday: last month's topic being argued today
  // belongs at the top.
  lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),

  // hiddenBy null while hiddenAt is set means the members hid it by majority,
  // which is the only way it can happen in a community with no admins.
  hiddenAt: timestamp("hidden_at"),
  hiddenBy: integer("hidden_by").references(() => users.id),
  hiddenReason: text("hidden_reason"),
  // Author removal. The row survives so replies keep their anchor; the text
  // is never served again.
  deletedAt: timestamp("deleted_at"),

  // Why the forum exists: a topic is the antechamber to a proposal, not a
  // parallel venue. SET NULL so deleting a proposal does not erase the
  // discussion it came from.
  promotedProposalId: integer("promoted_proposal_id").references(() => proposals.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const communityPostVotes = pgTable("community_post_votes", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => communityPosts.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(), // 'up' | 'down'
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  communityPostVoteUnique: uniqueIndex('community_post_vote_unique').on(table.postId, table.userId),
}));

// One row per member per post: 'hide' is the report, 'keep' is the defence.
// In an autonomous community these two values *are* the verdict — there is no
// administrator to reach one.
export const communityPostFlags = pgTable("community_post_flags", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => communityPosts.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(), // 'hide' | 'keep'
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  communityPostFlagUnique: uniqueIndex('community_post_flag_unique').on(table.postId, table.userId),
}));

export type CommunityPost = InferSelectModel<typeof communityPosts>;
export type InsertCommunityPost = InferInsertModel<typeof communityPosts>;
export type CommunityPostVote = InferSelectModel<typeof communityPostVotes>;
export type CommunityPostFlag = InferSelectModel<typeof communityPostFlags>;

// ─── Bookmarks ──────────────────────────────────────────────────────────────
// The save icon sits on every card in the design — communities, proposals,
// surveys, media, forum posts. One polymorphic table rather than five, because
// nothing about the behaviour differs per kind, only the destination. No FK on
// entityId: reads always join the kind's own table, so orphans simply vanish.
export const bookmarks = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(), // 'community' | 'proposal' | 'survey' | 'media' | 'post'
  entityId: integer("entity_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  bookmarksUnique: uniqueIndex('bookmarks_unique').on(table.userId, table.entityType, table.entityId),
  bookmarksUserIdx: index('bookmarks_user_idx').on(table.userId, table.createdAt),
}));

// ─── Tags ───────────────────────────────────────────────────────────────────
// The Ετικέτες block on a community page. The slug is the identity so that
// "Θεσσαλονίκη" and "θεσσαλονίκη" cannot become two tags.
export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tagsSlugUnique: uniqueIndex('tags_slug_unique').on(table.slug),
}));

export const entityTags = pgTable("entity_tags", {
  id: serial("id").primaryKey(),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(), // 'community' | 'proposal' | 'survey' | 'media'
  entityId: integer("entity_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  entityTagsUnique: uniqueIndex('entity_tags_unique').on(table.tagId, table.entityType, table.entityId),
  entityTagsEntityIdx: index('entity_tags_entity_idx').on(table.entityType, table.entityId),
}));

// ─── Community meetings ─────────────────────────────────────────────────────
// Separate from livekit_rooms on purpose: the room is the plumbing that lives
// as long as the call, the meeting is the announcement that exists weeks before
// and months after. An online meeting points at a room; an in-person one has
// no room at all.
export const communityMeetings = pgTable("community_meetings", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  createdBy: integer("created_by").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at"),
  location: text("location"),
  isOnline: boolean("is_online").notNull().default(true),
  roomId: integer("room_id").references(() => livekitRooms.id, { onDelete: "set null" }),
  isUrgent: boolean("is_urgent").notNull().default(false), // the red ΕΚΤΑΚΤΗ pill
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  communityMeetingsUpcomingIdx: index('community_meetings_upcoming_idx').on(table.communityId, table.startsAt),
}));

export const meetingRsvps = pgTable("meeting_rsvps", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => communityMeetings.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // The card counts only 'yes', but 'no' has to be expressible so a 'yes' can
  // be taken back.
  status: text("status").notNull().default("yes"), // 'yes' | 'no' | 'maybe'
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  meetingRsvpsUnique: uniqueIndex('meeting_rsvps_unique').on(table.meetingId, table.userId),
}));

// ─── Newsletter ─────────────────────────────────────────────────────────────
// The footer sign-up. Deliberately not email_notification_prefs: that speaks to
// a user with an account, this to an address that may belong to nobody.
// confirmedAt is double opt-in — nothing is ever sent before it is set.
export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  locale: text("locale").notNull().default("el"),
  // Tied to an account when there is one, so a GDPR erasure takes the
  // subscription with it.
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  confirmToken: text("confirm_token"),
  confirmedAt: timestamp("confirmed_at"),
  unsubscribeToken: text("unsubscribe_token").notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  newsletterUnsubscribeTokenUnique: uniqueIndex('newsletter_unsubscribe_token_unique').on(table.unsubscribeToken),
}));

// ─── Κατακτήσεις Δημοκρατίας ────────────────────────────────────────────────
// A decision that became a fact, with the number of people behind it and how
// long it took. Not derived from decided proposals: passing a vote is not the
// same as being carried out, so this is a curated row pointing back at the
// proposal it came from.
export const democracyAchievements = pgTable("democracy_achievements", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").references(() => proposals.id, { onDelete: "set null" }),
  communityId: integer("community_id").references(() => communities.id, { onDelete: "set null" }),
  createdBy: integer("created_by").notNull().references(() => users.id),
  title: text("title").notNull(),
  story: text("story"),
  region: text("region"),
  imagePath: text("image_path"),
  participantsCount: integer("participants_count"),
  durationDays: integer("duration_days"),
  // Unpublished until someone approves it; the card shows published only.
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  democracyAchievementsPublishedIdx: index('democracy_achievements_published_idx').on(table.publishedAt),
}));

export type Bookmark = InferSelectModel<typeof bookmarks>;
export type InsertBookmark = InferInsertModel<typeof bookmarks>;
export type Tag = InferSelectModel<typeof tags>;
export type EntityTag = InferSelectModel<typeof entityTags>;
export type CommunityMeeting = InferSelectModel<typeof communityMeetings>;
export type InsertCommunityMeeting = InferInsertModel<typeof communityMeetings>;
export type MeetingRsvp = InferSelectModel<typeof meetingRsvps>;
export type NewsletterSubscriber = InferSelectModel<typeof newsletterSubscribers>;
export type DemocracyAchievement = InferSelectModel<typeof democracyAchievements>;
export type InsertDemocracyAchievement = InferInsertModel<typeof democracyAchievements>;

// ─── Polling module (panel, question bank, two-tier polls) ──────────────────
// Tables live in their own file to keep this one navigable; re-exported here
// so drizzle-kit and `import * as schema from '@shared/schema'` pick them up.
export * from "./polling-schema";
