-- Migration 0014: Drop unused personal-data columns (GDPR Art. 5(1)(c) — minimisation)
--
-- Removes columns whose collection cannot be justified against any working
-- feature in the codebase. Verified-dead audit lives at
-- docs/compliance/02_DATA_MINIMIZATION_AUDIT.md.
--
-- Drops:
--
-- 1. users.latitude / longitude / location_confirmed / location_verified
--    The user-location vertical is orphaned:
--      - LocationDetector component is defined but never imported.
--      - isUserEligibleForPoll() is exported but never called — geofencing
--        has zero server-side enforcement.
--      - Storing precise GPS coords next to a Gov.gr-verified identity is
--        a disproportionate Art. 9-adjacent risk for no working feature.
--
-- 2. users.govgr_dob / users.govgr_place_of_birth
--    Only consumers are the profile-page display block. No age gate, no
--    geographic-scope logic, no audit trail uses them. Place-of-birth in
--    particular is a known proxy for ethnic origin (Art. 9 special-category
--    adjacency) and has no offsetting feature value here.
--
-- All other Gov.gr fields (first_name, last_name, municipality, postcode,
-- voter_hash, doc_code_hash, verified_at) are retained — they are either
-- load-bearing (voter_hash for one-person-one-vote) or have plausible
-- product uses (municipality for future geographic scope of votes).

BEGIN;

ALTER TABLE "users"
  DROP COLUMN IF EXISTS "latitude",
  DROP COLUMN IF EXISTS "longitude",
  DROP COLUMN IF EXISTS "location_confirmed",
  DROP COLUMN IF EXISTS "location_verified",
  DROP COLUMN IF EXISTS "govgr_dob",
  DROP COLUMN IF EXISTS "govgr_place_of_birth";

COMMIT;
