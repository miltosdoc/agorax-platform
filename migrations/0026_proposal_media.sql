-- Migration 0026: Proposal media (podcasts + video teasers)
--
-- User-uploaded MP3 podcasts and MP4 video teasers tied to a proposal.
-- AgoraX generates a Greek script from the proposal text + top arguments;
-- the user paste-creates the media externally (NotebookLM / similar) and
-- uploads the result. Any community member can submit, but the proposal
-- author curates: feature, hide, or delete. The featured entry surfaces
-- in the global /feed and on public /p/:slug/(podcast|video)/:mid share
-- routes.

BEGIN;

CREATE TABLE "proposal_media" (
  "id"           serial PRIMARY KEY,
  "proposal_id"  integer NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "uploader_id"  integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind"         text NOT NULL,
  "file_path"    text NOT NULL,
  "thumb_path"   text,
  "mime_type"    text NOT NULL,
  "size_bytes"   integer NOT NULL,
  "duration_s"   numeric,
  "status"       text NOT NULL DEFAULT 'published',
  "is_featured"  boolean NOT NULL DEFAULT false,
  "created_at"   timestamp NOT NULL DEFAULT now(),

  CONSTRAINT proposal_media_kind_check CHECK ("kind" IN ('podcast', 'video')),
  CONSTRAINT proposal_media_status_check CHECK ("status" IN ('published', 'hidden'))
);

CREATE INDEX "proposal_media_proposal_idx" ON "proposal_media" ("proposal_id");
CREATE INDEX "proposal_media_feed_idx" ON "proposal_media" ("status", "created_at");

-- Only one featured media per (proposal, kind). Featuring a different
-- one un-features the previous in application code; this partial unique
-- index is the belt-and-braces guarantee.
CREATE UNIQUE INDEX "proposal_media_featured_unique"
  ON "proposal_media" ("proposal_id", "kind")
  WHERE "is_featured" = true;

COMMIT;
