-- 0032_community_visibility
-- Two per-community privacy toggles, both 'public' | 'members'.
-- The community row itself (name, description, member count, founder/admins)
-- stays public regardless; these gate the member roster and the content
-- (proposals, debates, votes, attached media/docs) respectively.
-- Both are governable settings: liquid majority vote in autonomous
-- communities, admin-set in managed ones.

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS member_list_visibility text NOT NULL DEFAULT 'public';

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS content_visibility text NOT NULL DEFAULT 'public';
