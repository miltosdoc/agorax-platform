-- 0038_conference_description
-- Conferences carried only a title, so anyone calling a meeting had nowhere
-- to put an agenda or a link. Add free-text description.
--
-- PLAIN TEXT by contract: any community member can create a conference, so
-- this value is never rendered as HTML. The client linkifies URLs into
-- anchors from the text itself.

ALTER TABLE livekit_rooms ADD COLUMN IF NOT EXISTS description TEXT;
