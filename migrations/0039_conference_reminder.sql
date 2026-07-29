-- 0039_conference_reminder
-- Members were notified once, when a meeting was created, and never again —
-- a meeting announced two weeks ahead was forgotten by the day it ran.
-- Track whether the "starts soon" fan-out has gone out so the sweep can be
-- idempotent. Reset to NULL when the organiser moves the meeting, so the new
-- time earns its own reminder.

ALTER TABLE livekit_rooms ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;

-- The reminder sweep looks for scheduled rooms coming due; without this it is
-- a full scan of every room ever created on every pass.
CREATE INDEX IF NOT EXISTS livekit_rooms_reminder_idx
  ON livekit_rooms(status, scheduled_at)
  WHERE reminder_sent_at IS NULL;
