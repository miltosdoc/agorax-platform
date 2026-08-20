-- Migration: Sortition Notification System
-- Adds: unified notification table for sortition + proposal lifecycle events,
--        notification preferences per user, deadline reminder support

-- 1. Sortition Notifications: Rich notification types beyond just poll_id
CREATE TABLE sortition_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'sortition_assigned', 'sortition_deadline', 'sortition_reminder',
                       -- 'proposal_advanced', 'amendment_ready', 'vote_started'
  title TEXT NOT NULL,
  message TEXT,
  sortition_body_id INTEGER REFERENCES sortition_bodies(id) ON DELETE CASCADE,
  proposal_id INTEGER REFERENCES proposals(id) ON DELETE CASCADE,
  community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  action_url TEXT,  -- e.g. '/sortition/5' or '/proposals/12'
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP
);

CREATE INDEX sortition_notif_user ON sortition_notifications (user_id, read, created_at DESC);
CREATE INDEX sortition_notif_type ON sortition_notifications (user_id, type);

-- 2. Notification Preferences: Per-user opt-in/out
CREATE TABLE notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  sortition_assigned BOOLEAN NOT NULL DEFAULT TRUE,
  sortition_deadline BOOLEAN NOT NULL DEFAULT TRUE,
  sortition_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  proposal_advanced BOOLEAN NOT NULL DEFAULT TRUE,
  amendment_ready BOOLEAN NOT NULL DEFAULT TRUE,
  vote_started BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_hours_before INTEGER NOT NULL DEFAULT 24,  -- hours before deadline to send reminder
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Comments
COMMENT ON TABLE sortition_notifications IS 'Rich notification system for sortition and proposal lifecycle events';
COMMENT ON COLUMN sortition_notifications.type IS 'Notification type: sortition_assigned, sortition_deadline, sortition_reminder, proposal_advanced, amendment_ready, vote_started';
COMMENT ON COLUMN sortition_notifications.action_url IS 'Frontend route to navigate to when notification is clicked';
COMMENT ON TABLE notification_preferences IS 'Per-user notification opt-in/out preferences with reminder timing';
