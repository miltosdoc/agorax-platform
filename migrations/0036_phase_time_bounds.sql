-- Phase timing: author-chosen durations inside community bounds, a grace
-- window before the ballot opens, and an inclusion threshold that no longer
-- makes the author a single point of failure.

ALTER TABLE communities ADD COLUMN IF NOT EXISTS final_review_hours integer DEFAULT 24;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS deliberation_min_hours integer DEFAULT 24;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS deliberation_max_hours integer DEFAULT 336;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS voting_min_hours integer DEFAULT 24;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS voting_max_hours integer DEFAULT 720;

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS deliberation_duration_hours integer;

-- Backfill rows created before the columns existed.
UPDATE communities SET final_review_hours = 24 WHERE final_review_hours IS NULL;
UPDATE communities SET deliberation_min_hours = 24 WHERE deliberation_min_hours IS NULL;
UPDATE communities SET deliberation_max_hours = 336 WHERE deliberation_max_hours IS NULL;
UPDATE communities SET voting_min_hours = 24 WHERE voting_min_hours IS NULL;
UPDATE communities SET voting_max_hours = 720 WHERE voting_max_hours IS NULL;

-- Inclusion threshold: 1 meant "only what the author explicitly accepted",
-- so an author who ran out of time dropped the entire deliberation and the
-- vote opened on untouched text. Every existing row still holds the old
-- default — no community has tuned this setting — so the new default is
-- applied to all of them. A community that wants author-only can set 1 back
-- from its settings page.
ALTER TABLE communities ALTER COLUMN amendment_inclusion_threshold SET DEFAULT 0.6;
UPDATE communities SET amendment_inclusion_threshold = 0.6 WHERE amendment_inclusion_threshold = 1;
