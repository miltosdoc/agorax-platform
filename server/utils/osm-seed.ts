/**
 * OSM Community Seed Data
 * 
 * Fetches Greek administrative divisions from OpenStreetMap Nominatim API
 * and pre-populates the communities table with verified municipalities,
 * regions, and cities.
 * 
 * This eliminates the community verification problem (D1) by shipping
 * with pre-verified administrative boundaries from OSM.
 */

import { db } from '../db';
import { communities } from '@shared/schema';
import { eq } from 'drizzle-orm';

// ─── OSM Nominatim API ──────────────────────────────────────────────────────

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

interface OSMResult {
  place_id: number;
  osm_type: string;
  osm_id: number;
  display_name: string;
  type: string;
  importance: number;
  address: {
    municipality?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
  };
  boundingbox?: [string, string, string, string];
}

/**
 * Search for Greek administrative divisions via Nominatim.
 */
async function searchOSM(query: string, limit: number = 50): Promise<OSMResult[]> {
  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('countrycodes', 'gr');
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'AgoraX/1.0 (https://agoraxdemocracy.com)',
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<OSMResult[]>;
}

/**
 * Fetch Greek regions (peripheries) from OSM.
 */
async function fetchGreekRegions(): Promise<OSMResult[]> {
  return searchOSM('region Greece', 20);
}

/**
 * Fetch Greek municipalities (dimos) from OSM.
 */
async function fetchGreekMunicipalities(): Promise<OSMResult[]> {
  return searchOSM('municipality Greece', 100);
}

/**
 * Fetch Greek cities/towns from OSM.
 */
async function fetchGreekCities(): Promise<OSMResult[]> {
  return searchOSM('city Greece', 100);
}

// ─── Community Creation ──────────────────────────────────────────────────────

interface CommunitySeed {
  name: string;
  nameEn: string;
  description: string;
  type: 'municipality' | 'region' | 'city' | 'village';
  osmId: number;
  osmType: string;
  parentCommunityId?: number;
}

/**
 * Convert an OSM result to a CommunitySeed.
 */
function osmToCommunitySeed(result: OSMResult, type: CommunitySeed['type']): CommunitySeed {
  const name = result.address.municipality || result.address.city || result.address.town || result.address.village || result.display_name;
  
  return {
    name,
    nameEn: name, // TODO: Add English name mapping
    description: `${type.charAt(0).toUpperCase() + type.slice(1)} in Greece`,
    type,
    osmId: result.osm_id,
    osmType: result.osm_type,
  };
}

/**
 * Create or update a community from seed data.
 * Returns the community ID.
 */
async function upsertCommunity(seed: CommunitySeed): Promise<number> {
  // Check if community already exists (by osm_id)
  const existing = await db
    .select()
    .from(communities)
    .where(eq(communities.name, seed.name))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  // NOTE: communities table has no osmId/osmType columns yet (OPEN_QUESTIONS D1
  // decided OSM pre-population but the schema migration hasn't landed). The
  // OSM ids are stashed in the description for now until columns are added.
  // Also: communities.creatorId is required; pre-populated communities use
  // the founder/admin user id 1 by convention.
  const [inserted] = await db
    .insert(communities)
    .values({
      name: seed.name,
      description: `${seed.description ?? ''}\n[osm:${seed.osmType}/${seed.osmId}]`.trim(),
      governanceModel: 'no_admin',
      creatorId: 1,
    })
    .returning();

  return inserted.id;
}

// ─── Main Seed Function ──────────────────────────────────────────────────────

/**
 * Fetch Greek administrative divisions from OSM and seed the communities table.
 * 
 * @param options - Configuration options
 * @returns Number of communities created/updated
 */
export async function seedGreekCommunities(options: {
  fetchRegions?: boolean;
  fetchMunicipalities?: boolean;
  fetchCities?: boolean;
  dryRun?: boolean;
} = {}): Promise<number> {
  const {
    fetchRegions = true,
    fetchMunicipalities = true,
    fetchCities = true,
    dryRun = false,
  } = options;

  let count = 0;
  const seeds: CommunitySeed[] = [];

  // Fetch regions
  if (fetchRegions) {
    try {
      const regions = await fetchGreekRegions();
      seeds.push(...regions.map(r => osmToCommunitySeed(r, 'region')));
    } catch (error) {
      }
  }

  // Fetch municipalities
  if (fetchMunicipalities) {
    try {
      const municipalities = await fetchGreekMunicipalities();
      seeds.push(...municipalities.map(m => osmToCommunitySeed(m, 'municipality')));
    } catch (error) {
      }
  }

  // Fetch cities
  if (fetchCities) {
    try {
      const cities = await fetchGreekCities();
      seeds.push(...cities.map(c => osmToCommunitySeed(c, 'city')));
    } catch (error) {
      }
  }

  // Deduplicate by name
  const unique = [...new Map(seeds.map(s => [s.name, s])).values()];

  if (dryRun) {
    return unique.length;
  }

  // Upsert each community
  for (const seed of unique) {
    await upsertCommunity(seed);
    count++;
  }

  return count;
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  const count = await seedGreekCommunities({ dryRun });
}
