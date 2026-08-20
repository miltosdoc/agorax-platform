-- Discussion attached to a single amendment.
--
-- Flat by design: a comment is a remark about this one proposed change.
-- Threaded back-and-forth belongs in the proposal's debate tab.
CREATE TABLE IF NOT EXISTS amendment_comments (
  id            serial PRIMARY KEY,
  amendment_id  integer NOT NULL REFERENCES proposal_amendments(id) ON DELETE CASCADE,
  author_id     integer NOT NULL REFERENCES users(id),
  content       text NOT NULL,
  created_at    timestamp NOT NULL DEFAULT now()
);

-- The panel loads every comment for a proposal's amendments in one query.
CREATE INDEX IF NOT EXISTS amendment_comment_by_amendment
  ON amendment_comments (amendment_id, created_at);
