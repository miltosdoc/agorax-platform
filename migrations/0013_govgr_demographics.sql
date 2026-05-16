-- Migration 0013: Gov.gr verified demographics
--
-- Stores the minimal verified-identity set extracted from a Gov.gr
-- Responsible Declaration: first/last name, date of birth, place of birth,
-- residence municipality + postcode, plus a per-document anti-replay hash.
-- By data-minimisation, ID-card number, parents' names, phone and full
-- street address are deliberately NOT stored. Purely additive.

BEGIN;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "govgr_doc_code_hash" text,
  ADD COLUMN IF NOT EXISTS "govgr_first_name" text,
  ADD COLUMN IF NOT EXISTS "govgr_last_name" text,
  ADD COLUMN IF NOT EXISTS "govgr_dob" text,
  ADD COLUMN IF NOT EXISTS "govgr_place_of_birth" text,
  ADD COLUMN IF NOT EXISTS "govgr_municipality" text,
  ADD COLUMN IF NOT EXISTS "govgr_postcode" text;

COMMIT;
