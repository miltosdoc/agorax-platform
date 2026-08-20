-- 0033_proposal_tracks
-- Two-track proposals:
--   'deliberation' — short flow: amendments phase → final_review (AI merges
--     accepted/promoted amendments into a new vote-ready text; author accepts
--     or refines it via constrained AI edits) → option-ballot vote where
--     qualifying counter-proposals stand as AI-restyled alternatives.
--   'vote' — submit goes straight to a yes/no/abstain vote with an
--     author-chosen duration.
-- ballot_options null = classic yes/no/abstain ballot (all legacy rows).

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS track text NOT NULL DEFAULT 'deliberation';

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS voting_duration_hours integer;

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS ballot_options jsonb;

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS winning_option text;

ALTER TABLE proposal_amendments
  ADD COLUMN IF NOT EXISTS restyled_text text;
