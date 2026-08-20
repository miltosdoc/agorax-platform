/**
 * Polling module — shared domain contracts.
 *
 * Single source of truth (client + server) for:
 *   - panel profile field vocabularies (age bands, NUTS-2 regions, …)
 *   - the CompiledSurvey schema — the strict JSON contract the LLM Poll
 *     Compiler must satisfy (validated server-side with zod; on schema
 *     failure the compilation is rejected, never patched up silently)
 *   - the polling-specific GDPR consent text (separate purpose from the
 *     platform-participation consent in shared/consent.ts)
 *
 * Two-tier vocabulary used throughout: 'community' polls are user-created
 * and visibly unofficial; 'certified' polls are platform-authored and the
 * only outputs published as findings.
 */

import { z } from 'zod';

// ─── Tiers & statuses ────────────────────────────────────────────────────────

export const POLL_TIERS = ['community', 'certified'] as const;
export type PollTier = (typeof POLL_TIERS)[number];

export const SURVEY_POLL_STATUSES = [
  'draft',              // compiled, editable, not fielded
  'gatekeeper_flagged', // adversarial reviewer refused it (push-poll etc.)
  'live',               // fielding
  'closed',             // results computed, methodology frozen
] as const;
export type SurveyPollStatus = (typeof SURVEY_POLL_STATUSES)[number];

// ─── Panel profile vocabularies ──────────────────────────────────────────────
// Collected once at onboarding, stored ONLY against the anonymous panelist —
// never against verified identity. Values are stable string codes; Greek
// labels live in the client locale files.

export const AGE_BANDS = ['17-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

/** Greek NUTS-2 regions (Περιφέρειες), Eurostat codes. */
export const NUTS2_REGIONS = [
  'EL30', // Αττική
  'EL41', // Βόρειο Αιγαίο
  'EL42', // Νότιο Αιγαίο
  'EL43', // Κρήτη
  'EL51', // Ανατολική Μακεδονία & Θράκη
  'EL52', // Κεντρική Μακεδονία
  'EL53', // Δυτική Μακεδονία
  'EL54', // Ήπειρος
  'EL61', // Θεσσαλία
  'EL62', // Ιόνια Νησιά
  'EL63', // Δυτική Ελλάδα
  'EL64', // Στερεά Ελλάδα
  'EL65', // Πελοπόννησος
] as const;
export type Nuts2Region = (typeof NUTS2_REGIONS)[number];

export const EDUCATION_LEVELS = [
  'primary',        // έως δημοτικό/γυμνάσιο
  'secondary',      // λύκειο
  'post_secondary', // ΙΕΚ / μεταδευτεροβάθμια
  'tertiary',       // ΑΕΙ/ΤΕΙ
  'postgraduate',   // μεταπτυχιακό/διδακτορικό
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const URBANITY_LEVELS = [
  'urban',      // αστική περιοχή (>50k)
  'semi_urban', // ημιαστική (10k–50k)
  'rural',      // αγροτική (<10k)
] as const;
export type Urbanity = (typeof URBANITY_LEVELS)[number];

/**
 * Past vote, June 2023 parliamentary election. Self-reported recall —
 * collected once at onboarding (recall decays, capture early) and flagged
 * as recall-biased; the weighting pipeline treats it as an OPTIONAL
 * dimension, never part of the default raking.
 */
export const PAST_VOTE_2023 = [
  'nd', 'syriza', 'pasok', 'kke', 'spartiates', 'elliniki_lysi', 'niki',
  'plefsi', 'mera25', 'other', 'blank_invalid', 'did_not_vote', 'not_eligible',
  'prefer_not_to_say',
] as const;
export type PastVote2023 = (typeof PAST_VOTE_2023)[number];

/**
 * Calibration benchmark items — questions with known population values
 * (ELSTAT / official statistics). Asked at onboarding; the gap between the
 * panel's distribution and the official value is an ongoing estimate of
 * selection skew beyond demographics.
 */
export const BENCHMARK_KEYS = ['smoker', 'household_car', 'household_size'] as const;
export type BenchmarkKey = (typeof BENCHMARK_KEYS)[number];

export const panelProfileSchema = z.object({
  ageBand: z.enum(AGE_BANDS),
  gender: z.enum(GENDERS),
  region: z.enum(NUTS2_REGIONS),
  education: z.enum(EDUCATION_LEVELS),
  urbanity: z.enum(URBANITY_LEVELS),
  pastVote2023: z.enum(PAST_VOTE_2023),
  benchmarks: z.object({
    smoker: z.boolean(),
    household_car: z.boolean(),
    household_size: z.number().int().min(1).max(15),
  }),
});
export type PanelProfileInput = z.infer<typeof panelProfileSchema>;

export const RECRUITMENT_CHANNELS = ['organic', 'paid', 'referral', 'partner'] as const;
export type RecruitmentChannel = (typeof RECRUITMENT_CHANNELS)[number];

/** Channels whose responses may appear in published / certified outputs. */
export const PUBLISHABLE_CHANNELS: RecruitmentChannel[] = ['organic', 'paid'];

// ─── Compiled survey: the LLM compiler's output contract ────────────────────

export const SURVEY_ITEM_TYPES = [
  'single_choice', // one option
  'multi_choice',  // any number of options
  'likert',        // balanced ordinal scale, options ARE the scale points
  'open_text',     // free text (kept short, never used in weighted marginals)
] as const;
export type SurveyItemType = (typeof SURVEY_ITEM_TYPES)[number];

export const compiledItemSchema = z.object({
  text: z.string().min(5).max(500),
  itemType: z.enum(SURVEY_ITEM_TYPES),
  /** Required for choice/likert items; absent for open_text. */
  options: z.array(z.string().min(1).max(200)).min(2).max(12).optional(),
  /** Response-order randomization flag — compiler must set deliberately. */
  randomizeOptions: z.boolean(),
  required: z.boolean().default(true),
}).superRefine((item, ctx) => {
  if (item.itemType === 'open_text') {
    if (item.options) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'open_text items must not have options' });
  } else if (!item.options) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${item.itemType} items require options` });
  }
  if (item.itemType === 'likert' && item.randomizeOptions) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'likert scales must keep their order (randomizeOptions=false)' });
  }
});

export const compiledSurveySchema = z.object({
  title: z.string().min(5).max(200),
  /** Short topic tag (Greek), used to tag piggyback-module responses for context-effect analysis. */
  topicTag: z.string().min(2).max(60),
  language: z.enum(['el', 'en']).default('el'),
  items: z.array(compiledItemSchema).min(1).max(20),
});
export type CompiledSurvey = z.infer<typeof compiledSurveySchema>;
export type CompiledItem = z.infer<typeof compiledItemSchema>;

/** Adversarial gatekeeper verdict — produced by a SEPARATE reviewer call. */
export const gatekeeperVerdictSchema = z.object({
  approved: z.boolean(),
  flags: z.array(z.object({
    itemIndex: z.number().int().min(-1), // -1 = survey-level flag
    issue: z.enum(['leading', 'double_barreled', 'unbalanced_scale', 'push_poll', 'loaded_language', 'other']),
    explanation: z.string(),
    severity: z.enum(['block', 'warn']),
  })),
  reasoning: z.string(),
});
export type GatekeeperVerdict = z.infer<typeof gatekeeperVerdictSchema>;

// ─── Quality flags on a response ─────────────────────────────────────────────

export interface ResponseQualityFlags {
  speeder: boolean;
  straightLiner: boolean;
  failedAttention: boolean;
}

// ─── K-anonymity floor for any displayed cross-tab / marginal ────────────────
// Cells below this n are suppressed everywhere results render. Protects
// against re-identification via profile strata in small regions.
export const K_ANONYMITY_FLOOR = 5;

/** Minimum completes before weighted results render at all. */
export const MIN_WEIGHTED_N = 30;

// ─── Polling consent (separate GDPR purpose) ─────────────────────────────────

export const POLLING_CONSENT_VERSION = '2026-06-12';

export const POLLING_CONSENT_TEXT: Record<'el' | 'en', string> = {
  el: `Συγκατάθεση για συμμετοχή στο Πάνελ Δημοσκοπήσεων — έκδοση ${POLLING_CONSENT_VERSION}

Με την εγγραφή μου στο πάνελ δημοσκοπήσεων του AgoraX συναινώ ρητά:

1. Στην επεξεργασία των απαντήσεών μου σε δημοσκοπήσεις (πολιτικές απόψεις — δεδομένα ειδικής κατηγορίας, Άρθρο 9 ΓΚΠΔ), αποθηκευμένων ΜΟΝΟ έναντι ανώνυμου αναγνωριστικού πάνελ που δεν συνδέεται με την ταυτότητά μου.
2. Στη συλλογή δημογραφικού προφίλ (ηλικιακή ομάδα, φύλο, περιφέρεια, εκπαίδευση, αστικότητα, ψήφος 2023, στοιχεία βαθμονόμησης) έναντι του ίδιου ανώνυμου αναγνωριστικού — μία φορά, με ετήσια επικαιροποίηση.
3. Στο «σύστημα κοινών ερωτήσεων»: κάθε δημοσκόπηση περιλαμβάνει 2–3 πάγιες ερωτήσεις της πλατφόρμας στην αρχή του ερωτηματολογίου.

Η υπηρεσία επιλεξιμότητας (που γνωρίζει ποιος είμαι) δεν έχει πρόσβαση στις απαντήσεις μου· η σύνδεση αποτρέπεται με τυφλές υπογραφές (RFC 9474). Μπορώ να αποχωρήσω από το πάνελ ανά πάσα στιγμή.`,

  en: `Consent to Polling Panel participation — version ${POLLING_CONSENT_VERSION}

By joining the AgoraX polling panel I explicitly consent to:

1. Processing of my survey responses (political opinions — special-category data, GDPR Art. 9), stored ONLY against an anonymous panel identifier not linkable to my identity.
2. Collection of a demographic profile (age band, gender, region, education, urbanity, 2023 vote, calibration items) against the same anonymous identifier — once, with annual refresh.
3. The piggyback module: every poll carries 2–3 platform questions at the start of the questionnaire.

The eligibility service (which knows who I am) cannot access my responses; linkage is prevented via blind signatures (RFC 9474). I may leave the panel at any time.`,
};
