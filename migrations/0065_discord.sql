-- 0065_discord
--
-- Discord bridge (server/utils/discord.ts).
--
--   community_discord — a community's Discord channel webhook. Kept off the
--                       communities row on purpose: that row is served
--                       publicly, and a webhook URL is a secret (anyone who
--                       holds it can post into the channel).
--   discord_posts     — what was already announced, so a retry, a restart or
--                       the reminder sweep never posts the same thing twice.
--
-- Safe to run twice.

CREATE TABLE IF NOT EXISTS "community_discord" (
  "community_id" integer PRIMARY KEY REFERENCES "communities"("id") ON DELETE CASCADE,
  "webhook_url" text NOT NULL,
  "channel_id" text,
  "guild_id" text,
  "webhook_name" text,
  "allow_private" boolean NOT NULL DEFAULT false,
  "set_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "last_error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "discord_posts" (
  "id" serial PRIMARY KEY,
  "community_id" integer NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "event" text NOT NULL,
  "subject_id" integer NOT NULL,
  "posted_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "discord_posts_once"
  ON "discord_posts" ("community_id", "event", "subject_id");
