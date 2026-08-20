/**
 * Platform Repository
 *
 * Handles platform-wide operations: settings management, member search, and community search.
 */

import { db } from '../db';
import { platformSettings, users, communities, type PlatformSetting, type User, type Community } from '../../shared/schema';
import { eq, ilike, desc, or, sql, inArray } from 'drizzle-orm';

export class PlatformRepository {

async getPlatformSettings(): Promise<PlatformSetting[]> {
  return await db.select().from(platformSettings);
}

async updatePlatformSetting(key: string, value: string, userId: number): Promise<PlatformSetting> {
  const [existing] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, key));

  if (existing) {
    const [updated] = await db
      .update(platformSettings)
      .set({ value, lastChangedBy: userId, lastChangedAt: new Date() })
      .where(eq(platformSettings.key, key))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(platformSettings)
    .values({ key, value, lastChangedBy: userId })
    .returning();
  return created;
}

async searchMembers(query: string, limit = 10): Promise<User[]> {
  const term = `%${query.toLowerCase()}%`;
  return await db
    .select()
    .from(users)
    .where(or(
      sql`LOWER(${users.name}) LIKE ${term}`,
      sql`LOWER(${users.username}) LIKE ${term}`,
    ))
    .limit(limit);
}

async searchCommunities(query: string, limit = 10): Promise<Community[]> {
  const term = `%${query.toLowerCase()}%`;
  return await db
    .select()
    .from(communities)
    .where(or(
      sql`LOWER(${communities.name}) LIKE ${term}`,
      sql`LOWER(COALESCE(${communities.description}, '')) LIKE ${term}`,
    ))
    .limit(limit);
}

}
