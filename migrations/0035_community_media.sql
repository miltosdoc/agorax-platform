-- 0035_community_media
--
-- Community library: media (audio/video/documents) posted INSIDE a
-- community, deliberately decoupled from proposals and from the global
-- feed. Items live on the community page only; founder/admins can pin
-- items to the top (e.g. "start here" explainer material). Kind reuses
-- the proposal-media vocabulary ('podcast' | 'video' | 'document') so the
-- upload validation pipeline is shared.

CREATE TABLE IF NOT EXISTS community_media (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  thumb_path TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  duration_s NUMERIC,
  status TEXT NOT NULL DEFAULT 'published',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_at TIMESTAMP,
  pinned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT community_media_kind_check CHECK (kind IN ('podcast', 'video', 'document')),
  CONSTRAINT community_media_status_check CHECK (status IN ('published', 'hidden'))
);

-- Library listing: pinned items first, then newest.
CREATE INDEX IF NOT EXISTS community_media_library_idx
  ON community_media (community_id, pinned DESC, created_at DESC);
