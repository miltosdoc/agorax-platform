-- Migration: Amendment Flow v2 — Author-as-Editor Model
-- Adds: author review fields, community signal voting, sortition synthesis support

-- 1. Communities: Per-community amendment parameters
ALTER TABLE communities ADD COLUMN amendment_threshold NUMERIC DEFAULT '0.5';
ALTER TABLE communities ADD COLUMN max_amendments_per_proposal INTEGER DEFAULT -1;

-- 2. Proposals: Final text composed by sortition body
ALTER TABLE proposals ADD COLUMN final_text TEXT;

-- 3. Proposal Amendments: Author review + community signal fields
ALTER TABLE proposal_amendments ADD COLUMN author_decision TEXT;
ALTER TABLE proposal_amendments ADD COLUMN author_reason TEXT;
ALTER TABLE proposal_amendments ADD COLUMN rejection_upvotes INTEGER DEFAULT 0;
ALTER TABLE proposal_amendments ADD COLUMN rejection_downvotes INTEGER DEFAULT 0;

-- 4. Amendment Rejection Votes: Individual community votes on rejected amendments
CREATE TABLE amendment_rejection_votes (
  id SERIAL PRIMARY KEY,
  amendment_id INTEGER NOT NULL REFERENCES proposal_amendments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  vote INTEGER NOT NULL,  -- +1 (disagree with rejection) or -1 (agree with rejection)
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX amendment_vote_unique ON amendment_rejection_votes (amendment_id, user_id);

-- 5. State machine: New proposal statuses
-- Valid statuses now include:
-- 'author_review', 'community_signal', 'sortition_synthesis'
-- (No schema change needed — status is a TEXT column, these are runtime values)

-- 6. Comments
COMMENT ON COLUMN communities.amendment_threshold IS 'Upvote ratio threshold to flag rejected amendments (default 0.5 = 50%)';
COMMENT ON COLUMN communities.max_amendments_per_proposal IS 'Max amendments per proposal (-1 = unlimited)';
COMMENT ON COLUMN proposals.final_text IS 'Final text composed by sortition body (null until synthesis phase)';
COMMENT ON COLUMN proposal_amendments.author_decision IS 'Author review decision: accepted, rejected, or null (not yet reviewed)';
COMMENT ON COLUMN proposal_amendments.author_reason IS 'Author justification for rejection';
COMMENT ON COLUMN proposal_amendments.rejection_upvotes IS 'Community upvotes on rejection (disagree with author)';
COMMENT ON COLUMN proposal_amendments.rejection_downvotes IS 'Community downvotes on rejection (agree with author)';
COMMENT ON COLUMN amendment_rejection_votes.vote IS '+1 = disagree with rejection, -1 = agree with rejection';
