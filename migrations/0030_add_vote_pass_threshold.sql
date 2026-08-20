-- 0030_add_vote_pass_threshold
-- Add per-community voting pass threshold.
-- Default 0.5 means simple majority (yes > no).
-- Communities can set higher thresholds (e.g. 0.6 for 60%, 0.75 for supermajority).

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS vote_pass_threshold NUMERIC DEFAULT '0.5';
