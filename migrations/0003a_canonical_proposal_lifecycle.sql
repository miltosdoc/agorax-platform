-- Migration 0003: Canonical proposal lifecycle defaults
-- Created: 2026-04-25
--
-- Aligns the database default with the canonical lifecycle in
-- shared/proposal-lifecycle.ts. Existing rows are intentionally not rewritten:
-- legacy demo/status data should be normalized deliberately in a separate data
-- migration after UI/API consumers have been audited.

ALTER TABLE "proposals" ALTER COLUMN "status" SET DEFAULT 'draft';
