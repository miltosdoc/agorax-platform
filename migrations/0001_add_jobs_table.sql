-- Migration 0001: Add jobs table for async job queue
-- Created: 2026-04-23

CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"result" jsonb,
	"error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
-- Index for efficient job polling
CREATE INDEX "jobs_status_priority_created_at_idx" ON "jobs" ("status", "priority", "created_at");
--> statement-breakpoint
-- Index for cleanup old jobs
CREATE INDEX "jobs_status_completed_at_idx" ON "jobs" ("status", "completed_at");
