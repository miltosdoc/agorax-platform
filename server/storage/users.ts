/**
 * User Repository
 *
 * Handles all user-related database operations: CRUD, authentication,
 * Gov.gr verification, account activity tracking, location verification,
 * and duplicate account detection.
 */

import { db } from '../db';
import {
  users,
  accountActivity,
  userConsents,
  erasureRequests,
  type User,
  type InsertUser,
  type InsertAccountActivity,
  type SelectAccountActivity,
  type UserConsent,
  type ErasureRequest,
} from '../../shared/schema';
import { eq, and, ilike, desc, sql, isNull } from 'drizzle-orm';

export class UserRepository {

  /** Get user by ID. */
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  /** Get user by username (case-insensitive). */
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.username}) = LOWER(${username})`);
    return user;
  }

  /** Get user by email (case-insensitive). */
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = LOWER(${email})`);
    return user;
  }

  /** Get user by OAuth provider ID. */
  async getUserByProviderId(providerId: string, provider: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(
        eq(users.providerId, providerId),
        eq(users.provider, provider)
      ));
    return user;
  }

  /** Get user by Gov.gr voter hash. */
  async getUserByVoterHash(voterHash: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.govgrVoterHash, voterHash));
    return user;
  }

  /** Create a new user. */
  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  /** Record an explicit consent acceptance (GDPR Art. 7 + Art. 9(2)(a)). */
  async recordConsent(args: {
    userId: number;
    consentVersion: string;
    consentTextHash: string;
    locale: string;
  }): Promise<UserConsent> {
    const [row] = await db.insert(userConsents).values(args).returning();
    return row;
  }

  /** Return the member's current non-withdrawn consent, if any. */
  async getActiveConsent(userId: number): Promise<UserConsent | undefined> {
    const [row] = await db
      .select()
      .from(userConsents)
      .where(and(eq(userConsents.userId, userId), isNull(userConsents.withdrawnAt)))
      .orderBy(desc(userConsents.acceptedAt))
      .limit(1);
    return row;
  }

  /** Withdraw all active consents for a member (Art. 7(3)). */
  async withdrawConsent(userId: number): Promise<number> {
    const result = await db
      .update(userConsents)
      .set({ withdrawnAt: new Date() })
      .where(and(eq(userConsents.userId, userId), isNull(userConsents.withdrawnAt)))
      .returning({ id: userConsents.id });
    return result.length;
  }

  /** Clear the consent-required flag — called after recordConsent succeeds. */
  async clearRequiresConsent(userId: number): Promise<void> {
    await db.update(users).set({ requiresConsent: false }).where(eq(users.id, userId));
  }

  /** Re-arm the consent gate for a member (used on consent withdrawal). */
  async setRequiresConsent(userId: number, value: boolean): Promise<void> {
    await db.update(users).set({ requiresConsent: value }).where(eq(users.id, userId));
  }

  /** GDPR Art. 17 — record a pending right-to-be-forgotten request. */
  async createErasureRequest(args: { userId: number; reason?: string }): Promise<ErasureRequest> {
    const [row] = await db.insert(erasureRequests).values(args).returning();
    return row;
  }

  /** Return the member's still-open (unprocessed) erasure request, if any. */
  async getPendingErasureRequest(userId: number): Promise<ErasureRequest | undefined> {
    const [row] = await db
      .select()
      .from(erasureRequests)
      .where(and(eq(erasureRequests.userId, userId), isNull(erasureRequests.processedAt)))
      .orderBy(desc(erasureRequests.requestedAt))
      .limit(1);
    return row;
  }

  /** GDPR Art. 15 — full export of everything we hold about a member. */
  async exportUserData(userId: number): Promise<{
    profile: User | undefined;
    consents: UserConsent[];
    activity: SelectAccountActivity[];
    erasureRequests: ErasureRequest[];
  }> {
    const [profile, consents, activity, erasures] = await Promise.all([
      this.getUser(userId),
      db.select().from(userConsents).where(eq(userConsents.userId, userId)).orderBy(desc(userConsents.acceptedAt)),
      this.getUserAccountActivity(userId),
      db.select().from(erasureRequests).where(eq(erasureRequests.userId, userId)).orderBy(desc(erasureRequests.requestedAt)),
    ]);
    return { profile, consents, activity, erasureRequests: erasures };
  }


  /** Update user fields. */
  async updateUser(userId: number, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
    if (!user) throw new Error("User not found");
    return user;
  }

  /** Delete a user and optionally their polls. */
  async deleteUser(userId: number, deletePolls: boolean): Promise<boolean> {
    // TODO: Implement with transaction for data integrity
    await db.delete(users).where(eq(users.id, userId));
    return true;
  }

  /** Check for duplicate accounts by device fingerprint and IP. */
  async checkDuplicateAccounts(deviceFingerprint: string, ip: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(
        eq(users.deviceFingerprint, deviceFingerprint),
        eq(users.registrationIp, ip)
      ));
    return result[0]?.count || 0;
  }

  /** Create an account activity record. */
  async createAccountActivity(activity: InsertAccountActivity): Promise<void> {
    await db.insert(accountActivity).values(activity);
  }

  /** Update user login info (IP, timestamp). */
  async updateUserLoginInfo(userId: number, data: { lastLoginIp: string }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ lastLoginIp: data.lastLoginIp })
      .where(eq(users.id, userId))
      .returning();
    if (!user) throw new Error("User not found");
    return user;
  }

  /** Get user account activity history. */
  async getUserAccountActivity(userId: number): Promise<SelectAccountActivity[]> {
    return await db
      .select()
      .from(accountActivity)
      .where(eq(accountActivity.userId, userId))
      .orderBy(desc(accountActivity.timestamp));
  }

  /** Get all users with optional filters. */
  async getAllUsersWithAccountInfo(filters?: { status?: string; search?: string }): Promise<User[]> {
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(users.accountStatus, filters.status));
    }
    if (filters?.search) {
      conditions.push(ilike(users.username, `%${filters.search}%`));
    }
    return await db
      .select()
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(users.id));
  }

  /** Update account status (active, suspended, etc.). */
  async updateAccountStatus(userId: number, status: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ accountStatus: status })
      .where(eq(users.id, userId))
      .returning();
    if (!user) throw new Error("User not found");
    return user;
  }

}

