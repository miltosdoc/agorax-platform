-- Migration 0005: Sortition member feedback
-- Created: 2026-04-26
--
-- Persists the written justification a sortition member submits alongside
-- their numeric score. The scoring UI already collects this text — without
-- the column the value was silently dropped on submit.

ALTER TABLE "sortition_members"
  ADD COLUMN IF NOT EXISTS "feedback" text;
