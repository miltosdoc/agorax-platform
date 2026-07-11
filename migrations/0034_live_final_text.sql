-- 0034_live_final_text
-- 3-step deliberation: the AI-merged final text is recomputed LIVE during
-- the deliberation phase (on author decisions / amendment votes) instead of
-- in a separate final_review waiting phase. The author's refine instruction
-- is stored and re-applied on every recompute; acceptance is a recorded
-- signal, not a phase gate. At the deadline the text freezes and the vote
-- opens immediately.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS author_refine_instruction text;

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS author_accepted_final_at timestamp;
