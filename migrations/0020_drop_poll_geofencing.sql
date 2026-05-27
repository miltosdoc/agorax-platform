-- Migration 0020: Drop poll geofencing surface (GDPR Art. 5(1)(c))
--
-- The earlier audit (02_DATA_MINIMIZATION_AUDIT.md §4.4) showed that
-- server-side geofencing enforcement (isUserEligibleForPoll) was never
-- called. The user-side GPS columns were dropped in migration 0014, but
-- the polls-side columns remained as display/filter theatre. Per the
-- controller decision they are now removed in full.
--
-- The four geofencing-adjacent code modules (server/utils/geo-region-
-- detector.ts, client/src/lib/geofencing.ts, client/src/lib/dynamic-
-- locations.ts, client/src/components/map/geofence-map.tsx) are deleted
-- in the same commit; none had any live import.

BEGIN;

ALTER TABLE "polls"
  DROP COLUMN IF EXISTS "location_scope",
  DROP COLUMN IF EXISTS "center_lat",
  DROP COLUMN IF EXISTS "center_lng",
  DROP COLUMN IF EXISTS "radius_km",
  DROP COLUMN IF EXISTS "city",
  DROP COLUMN IF EXISTS "region",
  DROP COLUMN IF EXISTS "country",
  DROP COLUMN IF EXISTS "location_city",
  DROP COLUMN IF EXISTS "location_region",
  DROP COLUMN IF EXISTS "location_country",
  DROP COLUMN IF EXISTS "location_city_id",
  DROP COLUMN IF EXISTS "location_region_id",
  DROP COLUMN IF EXISTS "location_country_id",
  DROP COLUMN IF EXISTS "geo_region";

COMMIT;
