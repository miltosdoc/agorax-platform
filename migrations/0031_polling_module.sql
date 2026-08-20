-- 0031_polling_module
-- Open digital polling platform: anonymous panel (blind-sig enrolled),
-- versioned question bank, two-tier polls (community/certified), piggyback
-- module with planned missingness, responses, raked results.
--
-- GDPR: panelists / panel_profiles / survey_responses / survey_item_answers
-- are ANONYMOUS-SIDE tables (keyed by token hash, no user FK). Grant the
-- agorax_vote role access to them where the storage split is applied; the
-- identity side keeps only panel_enrollments ("user X joined the panel").

-- ── Identity side ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS panel_enrollment_keys (
  id SERIAL PRIMARY KEY,
  public_n TEXT NOT NULL,
  public_e TEXT NOT NULL,
  secret_d_ciphertext TEXT NOT NULL,
  secret_d_iv TEXT NOT NULL,
  secret_d_tag TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS panel_enrollments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_channel TEXT NOT NULL DEFAULT 'organic',
  issued_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS panel_enrollments_user_unique ON panel_enrollments(user_id);

-- ── Anonymous side ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS panelists (
  id SERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  source_channel TEXT NOT NULL DEFAULT 'organic',
  status TEXT NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS panel_profiles (
  panelist_id INTEGER PRIMARY KEY REFERENCES panelists(id) ON DELETE CASCADE,
  age_band TEXT NOT NULL,
  gender TEXT NOT NULL,
  region TEXT NOT NULL,
  education TEXT NOT NULL,
  urbanity TEXT NOT NULL,
  past_vote_2023 TEXT NOT NULL,
  past_vote_recall_flagged BOOLEAN NOT NULL DEFAULT TRUE,
  benchmarks JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  refresh_due_at TIMESTAMP
);

-- ── Question bank ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS question_bank (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  text TEXT NOT NULL,
  item_type TEXT NOT NULL,
  options JSONB,
  randomize_options BOOLEAN NOT NULL DEFAULT FALSE,
  category TEXT NOT NULL DEFAULT 'one_off',
  benchmark_key TEXT,
  population_value JSONB,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS question_bank_code_version_unique ON question_bank(code, version);

-- ── Polls ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS survey_polls (
  id SERIAL PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'community',
  title TEXT NOT NULL,
  topic_tag TEXT NOT NULL,
  intent TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  community_id INTEGER REFERENCES communities(id) ON DELETE SET NULL,
  language TEXT NOT NULL DEFAULT 'el',
  target_n INTEGER,
  compiler_meta JSONB,
  gatekeeper_verdict JSONB,
  methodology JSONB,
  opens_at TIMESTAMP,
  closes_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS survey_polls_status_idx ON survey_polls(status, tier);

CREATE TABLE IF NOT EXISTS survey_items (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES survey_polls(id) ON DELETE CASCADE,
  question_bank_id INTEGER REFERENCES question_bank(id),
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  item_type TEXT NOT NULL,
  options JSONB,
  randomize_options BOOLEAN NOT NULL DEFAULT FALSE,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  is_module_item BOOLEAN NOT NULL DEFAULT FALSE,
  is_attention_check BOOLEAN NOT NULL DEFAULT FALSE,
  attention_expected TEXT
);
CREATE INDEX IF NOT EXISTS survey_items_poll_idx ON survey_items(poll_id, position);

-- ── Piggyback module ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS module_items (
  id SERIAL PRIMARY KEY,
  question_bank_id INTEGER NOT NULL REFERENCES question_bank(id),
  pool_version INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS module_assignments (
  id SERIAL PRIMARY KEY,
  panelist_id INTEGER NOT NULL REFERENCES panelists(id) ON DELETE CASCADE,
  pool_version INTEGER NOT NULL,
  item_ids JSONB NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS module_assignments_unique ON module_assignments(panelist_id, pool_version);

-- ── Responses ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS survey_responses (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES survey_polls(id) ON DELETE CASCADE,
  panelist_id INTEGER NOT NULL REFERENCES panelists(id) ON DELETE CASCADE,
  order_seed TEXT NOT NULL,
  module_item_ids JSONB NOT NULL DEFAULT '[]',
  host_topic_tag TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  quality_flags JSONB,
  quality_passed BOOLEAN,
  claim_code_hash TEXT,
  claimed_at TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_unique ON survey_responses(poll_id, panelist_id);
CREATE INDEX IF NOT EXISTS survey_responses_poll_idx ON survey_responses(poll_id, status);

CREATE TABLE IF NOT EXISTS survey_item_answers (
  id SERIAL PRIMARY KEY,
  response_id INTEGER NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES survey_items(id) ON DELETE CASCADE,
  value JSONB NOT NULL,
  time_ms INTEGER,
  answered_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS survey_item_answers_unique ON survey_item_answers(response_id, item_id);
CREATE INDEX IF NOT EXISTS survey_item_answers_item_idx ON survey_item_answers(item_id);

-- ── Results ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS survey_results (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES survey_polls(id) ON DELETE CASCADE,
  cohort TEXT NOT NULL DEFAULT 'published',
  completes INTEGER NOT NULL,
  raw JSONB NOT NULL,
  weighted JSONB,
  effective_n NUMERIC,
  design_effect NUMERIC,
  weighting_vars JSONB,
  weight_summary JSONB,
  computed_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS survey_results_poll_cohort_unique ON survey_results(poll_id, cohort);
