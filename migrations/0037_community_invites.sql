-- Community invitations: the missing half of the 'invite_only' join policy.
-- Until now that policy only rejected applications; nothing could issue an
-- invitation, so an invite-only community was sealed at whatever membership it
-- had. One table serves both shapes: targeted (invited_user_id set, one use)
-- and link (invited_user_id NULL, redeemable until expiry or max_uses).

CREATE TABLE IF NOT EXISTS community_invites (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  invited_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'member',
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMP
);

-- Admin listing reads pending invites per community; redemption reads by token
-- (already unique). A partial index keeps the "who have I already invited"
-- lookup cheap without indexing dead rows.
CREATE INDEX IF NOT EXISTS community_invites_pending_idx
  ON community_invites (community_id, status)
  WHERE status = 'pending';
