-- A member can pin communities so they list first in "My communities",
-- the side rail and the home page. Personal: nobody else sees it.
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS pinned_at timestamp;
