import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Express } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { DatabaseStorage } from "./storage";
export const storage = new DatabaseStorage();
import { User as SelectUser, registerUserSchema } from "@shared/schema";
import { isAccentTheme } from "@shared/theme";
import { db } from "./db";
import {
  users,
  passwordResetTokens,
  passwordResetRequests,
  emailVerificationTokens,
  passwordPolicySchema,
  User,
  SafeUser,
} from "@shared/schema";
import { eq, and, isNull, gte, count, desc } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { addMember as addCommunityMember, getGeneralCommunity } from "./utils/community-manager";
import {
  CURRENT_CONSENT_VERSION,
  validateConsent,
} from "../shared/consent";
import { consentTextHash } from "./utils/consent-hash";
import {
  hmacIdentifier,
  sendSecurityEmail,
  sendSecurityEmailInBackground,
} from "./utils/email-service";
import { publicUrl } from "./utils/mailer";
import {
  ADMIN_RESET_TTL_MS,
  RESET_REQUESTS_PER_EMAIL_PER_HOUR,
  RESET_REQUESTS_PER_IP_PER_HOUR,
  SELF_RESET_TTL_MINUTES,
  SELF_RESET_TTL_MS,
  generateResetToken,
  hashResetToken,
  isResetTokenLive,
} from "./utils/password-reset";
import {
  VERIFICATION_RESENDS_PER_HOUR,
  VERIFICATION_TTL_HOURS,
  VERIFICATION_TTL_MS,
  generateVerificationToken,
  hashVerificationToken,
  isVerificationTokenLive,
} from "./utils/email-verification";

// Extend session interface to include returnTo property
declare module "express-session" {
  interface SessionData {
    returnTo?: string;
  }
}

// ─── Mobile OAuth handoff ────────────────────────────────────────────────────
// Google blocks OAuth inside webviews, so the Android app completes the flow
// in the system browser. The callback then redirects to agorax://auth?code=…
// which reopens the app; the app exchanges the one-time code for a session
// via POST /api/auth/mobile-exchange. Codes are single-use and short-lived.
const MOBILE_CODE_TTL_MS = 2 * 60 * 1000;
const mobileAuthCodes = new Map<string, { userId: number; returnTo: string; expires: number }>();

function issueMobileAuthCode(userId: number, returnTo: string): string {
  // Opportunistic sweep so the map can't grow unbounded
  const now = Date.now();
  for (const [k, v] of mobileAuthCodes) {
    if (v.expires < now) mobileAuthCodes.delete(k);
  }
  const code = randomBytes(32).toString("hex");
  mobileAuthCodes.set(code, { userId, returnTo, expires: now + MOBILE_CODE_TTL_MS });
  return code;
}

function consumeMobileAuthCode(code: string): { userId: number; returnTo: string } | null {
  const entry = mobileAuthCodes.get(code);
  if (!entry) return null;
  mobileAuthCodes.delete(code);
  if (entry.expires < Date.now()) return null;
  return { userId: entry.userId, returnTo: entry.returnTo };
}

declare global {
  namespace Express {
    interface User extends SelectUser { }
  }
}

const scryptAsync = promisify(scrypt);

function sanitizeUser(user: User): SafeUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    profilePicture: user.profilePicture,
    isAdmin: user.isAdmin,
    accountStatus: user.accountStatus,
    requiresConsent: user.requiresConsent,
    govgrVerified: user.govgrVerified,
    govgrVerifiedAt: user.govgrVerifiedAt,
    govgrFirstName: user.govgrFirstName,
    govgrLastName: user.govgrLastName,
    govgrMunicipality: user.govgrMunicipality,
    govgrPostcode: user.govgrPostcode,
    locale: user.locale,
    theme: user.theme,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}


async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) {
    // Stored value isn't in the scrypt "<hex>.<salt>" format we produce.
    // This includes legacy/demo placeholder hashes (e.g. "$2b$10$demo").
    // Fail closed — never accept a password against a malformed hash, regardless of env.
    return false;
  }
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  if (hashedBuf.length !== suppliedBuf.length) return false;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}


/**
 * Require authentication middleware.
 * In demo mode, creates a fake user for testing.
 */
/**
 * Require admin authentication middleware.
 */
export const requireAdmin = (req: any, res: any, next: any) => {
  if (req.isAuthenticated() && req.user.isAdmin) {
    return next();
  }
  res.status(403).json({ message: 'Admin access required' });
};

/**
 * GDPR Art. 9 gate. Use AFTER requireAuth on any route that processes
 * special-category data (votes, proposal text, debate contributions).
 * Members who have not accepted the current canonical consent are blocked
 * with a 403 carrying the required version so the client can interstitial.
 *
 * Cleared by /api/user/consent/accept once the member accepts.
 */
export const requireConsent = (req: any, res: any, next: any) => {
  if (req.user?.requiresConsent === true) {
    return res.status(403).json({
      code: 'consent_required',
      currentVersion: CURRENT_CONSENT_VERSION,
      message: 'Explicit consent to the current privacy text is required before this action.',
    });
  }
  next();
};

export const requireAuth = (req: any, res: any, next: any) => {
  // Demo mode: bypass auth, use user 3 (maria) as demo user
  if (process.env.DEMO_MODE === 'true') {
    if (!req.user) {
      req.user = {
        id: 3,
        username: 'demo',
        email: 'demo@agorax.gr',
        name: 'Demo User',
        profilePicture: null,
        isAdmin: true,
        govgrVerified: true,
      };
    }
    return next();
  }

  if (req.isAuthenticated()) {
    return next();
  }

  res.status(401).json({ message: 'Authentication required' });
};


export function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required");
  }

  const isProduction = process.env.APP_ENV === "production";

  // Persist sessions in Postgres so restarts don't log everyone out and
  // multi-instance deployments share state. Table is auto-created on first
  // run; we use the same pool the rest of the app already opens.
  const PgStore = connectPgSimple(session);
  const sessionStore = new PgStore({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
  });

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // ── Rate limits ──────────────────────────────────────────────────────
  //
  // These used to be one bucket of 10 per quarter-hour shared by login,
  // registration, both reset endpoints and address confirmation. That was
  // fine while the only way to spend it was to try passwords. It stopped
  // being fine the moment reset-by-email existed, because the recovery flow
  // now spends the login budget on the way through: opening the reset page
  // costs a check, saving the password costs another, clicking the
  // confirmation link costs a third — and then the member, having done
  // everything right, is told "too many requests" the first time they try
  // the password they just set. Locking someone out at the end of account
  // recovery is the exact failure recovery exists to prevent.
  //
  // So: three buckets, each sized for what it protects.
  const limiterBase = {
    standardHeaders: true as const,
    legacyHeaders: false as const,
    skip: (req: any) => req.method === "GET" || process.env.DEMO_MODE === "true",
  };

  const demo = process.env.DEMO_MODE === "true";

  /**
   * Password guessing. Successful sign-ins are not counted — the limit
   * exists to slow down someone trying passwords, and a correct password is
   * not an attempt at guessing. Without this, a shared office address burns
   * its allowance on people simply signing in.
   */
  const loginLimiter = rateLimit({
    ...limiterBase,
    windowMs: 15 * 60 * 1000,
    max: demo ? 999 : 10,
    skipSuccessfulRequests: true,
  });

  /**
   * State-changing account actions: registration, setting a new password,
   * the mobile OAuth handoff. Rare per person, expensive to get wrong.
   */
  const sensitiveLimiter = rateLimit({
    ...limiterBase,
    windowMs: 15 * 60 * 1000,
    max: demo ? 999 : 10,
  });

  /**
   * Landing on a link from an email: "is this token still good?".
   *
   * Fires on every page load, including a reload and a mail client's own
   * prefetch, so it needs headroom. It is also the cheapest thing here to
   * get wrong from an attacker's side — the tokens are 256 bits, so this
   * limit is about noise, not about guessing.
   */
  const tokenCheckLimiter = rateLimit({
    ...limiterBase,
    windowMs: 15 * 60 * 1000,
    max: demo ? 999 : 40,
  });

  passport.use(
    new LocalStrategy(async (identifier, password, done) => {
      try {
        // Username *or* email address.
        //
        // Self-service reset is keyed on the address — that is the only
        // thing a member who has forgotten their password reliably knows.
        // Sending them back to a login form that accepts only a username
        // hands them a new password and no way to use it: nothing in the
        // reset flow ever shows them the username, and for anyone who set
        // one up years ago, it is simply gone.
        //
        // Username first, so a username is never shadowed by someone
        // else's address, and the email lookup only runs for input that
        // could be an address at all.
        const user = await storage.getUserByUsername(identifier)
          ?? (identifier.includes('@') ? await storage.getUserByEmail(identifier) : undefined);
        if (!user) return done(null, false);

        // Demo mode: allow login by username alone for seeded demo accounts.
        // APP_ENV=production blocks DEMO_MODE in config.ts, so this branch is
        // unreachable in production by construction.
        if (process.env.DEMO_MODE === "true") {
          return done(null, user);
        }

        if (!user.password || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );

  // Google OAuth Strategy — only register when credentials are configured
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback",
        scope: ["profile", "email"],
        proxy: true // This helps with proxied requests
      },
        async (accessToken, refreshToken, profile, done) => {
          try {
            // First check if user exists with this Google ID
            let user = await storage.getUserByProviderId(profile.id, 'google');

            if (user) {
              // User already exists, return it
              return done(null, user);
            }

            // Check if user exists with this email
            if (profile.emails && profile.emails.length > 0) {
              const email = profile.emails[0].value;
              const existingUser = await storage.getUserByEmail(email);

              if (existingUser) {
                // Update existing user with Google provider details
                // Signing in through Google proves the same mailbox our own
                // confirmation link would have proved, so an account that
                // arrives this way stops being "unverified" on the spot.
                const linkVerified = profile._json?.email_verified === true
                  || (profile.emails?.[0] as { verified?: boolean | string } | undefined)?.verified === true
                  || (profile.emails?.[0] as { verified?: boolean | string } | undefined)?.verified === 'true';

                const [updatedUser] = await db
                  .update(users)
                  .set({
                    providerId: profile.id,
                    provider: 'google',
                    profilePicture: profile.photos?.[0]?.value || null,
                    ...(linkVerified && !existingUser.emailVerifiedAt
                      ? { emailVerifiedAt: new Date() }
                      : {}),
                  })
                  .where(eq(users.id, existingUser.id))
                  .returning();

                return done(null, updatedUser);
              }
            }

            // Create a new user with Google profile info.
            //
            // There is no separate "sign up with Google" — this callback is
            // the sign-up. Which is fine, and normal for OAuth, but it means
            // the address arriving here is the only one this account will
            // ever have.
            //
            // It used to fall back to the numeric Google profile id at
            // gmail.com when Google returned no address: a fabricated mailbox
            // belonging to nobody, or to a stranger. That was survivable only
            // while AgoraX sent no mail at all. It now sends password-reset
            // links, so an invented address is a reset link posted to someone
            // else. Refuse instead.
            const name = profile.displayName || 'User';
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(null, false, {
                message: 'Η Google δεν επέστρεψε διεύθυνση email. '
                  + 'Επιτρέψτε την πρόσβαση στο email σας ή εγγραφείτε με email και κωδικό.',
              });
            }

            // Generate a unique username
            const baseUsername = (profile.displayName || 'user').toLowerCase().replace(/\s+/g, '');
            let username = baseUsername;
            let attempt = 1;

            // Find a unique username
            while (true) {
              const existingUser = await storage.getUserByUsername(username);
              if (!existingUser) break;
              username = `${baseUsername}${attempt}`;
              attempt++;
            }

            // Create the new user
            // Google states whether it has verified the address. When it
            // has, asking the member to prove the same mailbox to us again
            // is ceremony: Google's check is the stronger of the two, and a
            // confirmation email nobody needed is still a confirmation email
            // in their inbox.
            const googleVerified = profile._json?.email_verified === true
              || (profile.emails?.[0] as { verified?: boolean | string } | undefined)?.verified === true
              || (profile.emails?.[0] as { verified?: boolean | string } | undefined)?.verified === 'true';

            const newUser = await storage.createUser({
              username,
              name,
              email,
              provider: 'google',
              providerId: profile.id,
              profilePicture: profile.photos?.[0]?.value || null,
              emailVerifiedAt: googleVerified ? new Date() : null,
            } as any);

            // Auto-enrol in the General community, same as local
            // registration. Best-effort: never block a Google signup.
            try {
              const general = await getGeneralCommunity();
              if (general) {
                await addCommunityMember(general.id, newUser.id);
              } else {
                console.warn(`[enrol] no General community exists — user ${newUser.id} signed up with no community`);
              }
            } catch (enrolErr: any) {
              // Swallowed on purpose, but never silently: a user outside the
              // General community sees an empty platform, and the only clue
              // this happened is the log line.
              console.error(`[enrol] General-community enrolment failed for Google user ${newUser.id}: ${enrolErr?.message}`);
            }

            return done(null, newUser);
          } catch (error) {
            return done(error);
          }
        })
    );
  } else {
  }

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", sensitiveLimiter, async (req, res, next) => {
    try {
      // GDPR Art. 9(2)(a) — registration requires explicit consent to the
      // current canonical privacy text. Reject before any DB work so a
      // missing/stale consent block never leaves us with a registered
      // member who hasn't agreed.
      const consent = validateConsent(req.body.consent);
      if (!consent) {
        return res.status(400).json({
          message: "Consent required",
          required: { version: CURRENT_CONSENT_VERSION, locales: ['el', 'en'] },
        });
      }

      // Store any returnTo info
      const returnTo = req.body.returnTo || '/feed';

      // Extract client IP
      const clientIp = (req.ip || req.headers['x-forwarded-for'] || (req.connection as any).remoteAddress) as string;
      const deviceFingerprint = req.body.deviceFingerprint;

      // Check for duplicate accounts if we have fingerprint and IP
      if (deviceFingerprint && clientIp) {
        const duplicateCount = await storage.checkDuplicateAccounts(deviceFingerprint, clientIp);
        if (duplicateCount >= 3) {
          return res.status(400).send("Έχετε φτάσει το όριο λογαριασμών από αυτήν τη συσκευή");
        }
      }

      // Shape and length checks. Until now nothing validated the body on this
      // side at all — the client's zod resolver was the only gate, which a
      // direct POST simply skips.
      const parsed = registerUserSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (typeof field === 'string' && !errors[field]) errors[field] = issue.message;
        }
        return res.status(400).json({ message: "Ελέγξτε τα στοιχεία σας", errors });
      }

      // Duplicate checks, reported separately. "Invalid registration data" for
      // both was unactionable: a real person had no idea what to change, and
      // no way to find out.
      //
      // Usernames are public on the platform, so saying one is taken discloses
      // nothing new. The email branch deliberately does NOT confirm that an
      // account exists — it tells the owner what to do without answering the
      // question for a stranger probing addresses.
      const existingUsername = await storage.getUserByUsername(parsed.data.username);
      if (existingUsername) {
        return res.status(400).json({
          message: "Το όνομα χρήστη χρησιμοποιείται ήδη",
          errors: { username: "Αυτό το όνομα χρήστη χρησιμοποιείται ήδη. Δοκιμάστε άλλο." },
        });
      }
      const existingEmail = await storage.getUserByEmail(parsed.data.email);
      if (existingEmail) {
        return res.status(400).json({
          message: "Δεν ολοκληρώθηκε η εγγραφή",
          errors: {
            email: "Δεν μπορούμε να χρησιμοποιήσουμε αυτή τη διεύθυνση. "
              + "Αν έχετε ήδη λογαριασμό, δοκιμάστε σύνδεση· διαφορετικά χρησιμοποιήστε άλλη διεύθυνση.",
          },
        });
      }

      // Explicit whitelist. Spreading the request body let a caller set ANY
      // users column that this handler didn't happen to override — verified:
      // a plain POST with govgrVerified:true produced an identity-verified
      // account, and isAdmin sits on the same path. Never spread req.body
      // into an insert.
      const user = await storage.createUser({
        username: parsed.data.username,
        email: parsed.data.email,
        name: parsed.data.name,
        password: await hashPassword(parsed.data.password),
        deviceFingerprint: deviceFingerprint || null,
        registrationIp: clientIp || null,
        lastLoginIp: clientIp || null,
        accountStatus: 'active',
        // The language they were reading the site in when they signed up.
        // Falls back to the consent locale, then to the platform default.
        locale: parsed.data.locale ?? consent.locale ?? 'el',
        // Member came through the consent gate at registration — clear the
        // default-true flag set by the column default.
        requiresConsent: false,
      } as any);

      // Record the consent acceptance against the freshly created user.
      // Failure here must roll back: a registered user with no consent row
      // is the exact state this whole gate exists to prevent.
      try {
        await storage.recordConsent({
          userId: user.id,
          consentVersion: consent.version,
          consentTextHash: consentTextHash(consent.locale),
          locale: consent.locale,
        });
      } catch (consentErr) {
        // Best-effort rollback of the user row.
        try { await storage.deleteUser(user.id, false); } catch {}
        throw consentErr;
      }

      // Log account activity
      await storage.createAccountActivity({
        userId: user.id,
        deviceFingerprint: deviceFingerprint || null,
        ipAddress: clientIp || null,
        action: 'registration',
        userAgent: req.headers['user-agent'] || null,
      });

      // Auto-enrol new users in the General community so they have at least
      // one place to deliberate from day one. Best-effort: a missing General
      // community (e.g. fresh install before seed) must not block signup.
      try {
        const general = await getGeneralCommunity();
        if (general) {
          await addCommunityMember(general.id, user.id);
        } else {
          console.warn(`[enrol] no General community exists — user ${user.id} registered with no community`);
        }
      } catch (enrolErr: any) {
        console.error(`[enrol] General-community enrolment failed for user ${user.id}: ${enrolErr?.message}`);
      }

      // Prove the address. Best-effort and off the critical path: a mail
      // server that is down or unconfigured must not turn a completed
      // registration into a failed one. The member can ask for another link
      // from their account at any time.
      void issueVerificationEmail(user.id).catch(() => { /* resend exists */ });

      req.login(user, (err) => {
        if (err) return next(err);

        // Also store in session for redundancy
        req.session.returnTo = returnTo;

        // Include returnTo in the response without leaking sensitive user fields.
        res.status(201).json({
          ...sanitizeUser(user),
          returnTo
        });
      });
    } catch (error) {
      next(error);
    }
  });

  // ── Email verification ───────────────────────────────────────────────
  // Proof that the address on an account is real and read by its owner.
  //
  // Nothing is gated on it. Every account that predates this feature is
  // unverified, and refusing them the platform until they click a link would
  // be a self-inflicted outage; the admin page shows who has confirmed and
  // who has not, and gating stays a separate decision.

  /**
   * Mint a link and mail it. Retires any outstanding link first, so the most
   * recent message is always the one that works — the same rule as reset.
   *
   * Returns false when there is nothing to do (no account, already verified),
   * which the resend endpoint uses without telling the caller which it was.
   */
  async function issueVerificationEmail(userId: number): Promise<boolean> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user?.email) return false;
    if (user.emailVerifiedAt) return false;

    await db.update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(and(
        eq(emailVerificationTokens.userId, userId),
        isNull(emailVerificationTokens.usedAt),
      ));

    const { token, tokenHash } = generateVerificationToken();
    await db.insert(emailVerificationTokens).values({
      userId,
      tokenHash,
      email: user.email,
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });

    // The token exists here and in the member's inbox. Nowhere else.
    await sendSecurityEmail({
      userId,
      template: 'email_verification',
      idempotencyKey: `email_verification:${tokenHash.slice(0, 32)}`,
      verifyUrl: `${publicUrl()}/verify-email?token=${encodeURIComponent(token)}`,
      expiresInHours: VERIFICATION_TTL_HOURS,
    });
    return true;
  }

  /**
   * Confirm an address.
   *
   * Unauthenticated on purpose: the link is opened from an inbox, often in a
   * different browser from the one that registered, and demanding a session
   * first would strand exactly the people whose address needs confirming.
   * The token is the proof; it grants nothing except setting this one flag.
   */
  app.post("/api/email-verification/verify", tokenCheckLimiter, async (req, res) => {
    try {
      const token = typeof req.body?.token === 'string' ? req.body.token : '';
      if (!token) return res.json({ ok: false });

      const [row] = await db.select()
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.tokenHash, hashVerificationToken(token)));

      if (!row) return res.json({ ok: false });

      const [user] = await db.select().from(users).where(eq(users.id, row.userId));

      // Already confirmed, by this link or another one. Report success:
      // the member's question is "is my address confirmed", and the answer
      // is yes. A failure here would send them chasing a fixed problem.
      if (user?.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });

      if (!isVerificationTokenLive(row, user?.email)) return res.json({ ok: false });

      await db.update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, row.userId));

      await db.update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(eq(emailVerificationTokens.id, row.id));

      await storage.createAccountActivity({
        userId: row.userId,
        deviceFingerprint: null,
        ipAddress: (req.ip as string) || null,
        action: 'email_verified',
        userAgent: req.headers['user-agent'] || null,
      });

      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false });
    }
  });

  /** Ask for another link. Signed in, so there is no address to disclose. */
  app.post("/api/email-verification/resend", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const [{ recent }] = await db
        .select({ recent: count() })
        .from(emailVerificationTokens)
        .where(and(
          eq(emailVerificationTokens.userId, userId),
          gte(emailVerificationTokens.createdAt, new Date(Date.now() - 60 * 60_000)),
        ));

      if (Number(recent) >= VERIFICATION_RESENDS_PER_HOUR) {
        return res.status(429).json({
          message: "Ζητήσατε πολλούς συνδέσμους. Δοκιμάστε ξανά σε λίγο.",
        });
      }

      await issueVerificationEmail(userId);
      // Same answer whether a link went out or the address was already
      // confirmed — neither is an error the member needs to act on.
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Δεν στάλθηκε ο σύνδεσμος. Δοκιμάστε ξανά." });
    }
  });

  /**
   * The language the member reads AgoraX in, and therefore the language
   * every email to them is written in. Set by the language switcher, so
   * choosing a language once covers both without a second setting to find.
   */
  app.put("/api/user/locale", requireAuth, async (req: any, res) => {
    const locale = req.body?.locale;
    if (locale !== 'el' && locale !== 'en') {
      return res.status(400).json({ message: "Μη υποστηριζόμενη γλώσσα" });
    }
    try {
      await db.update(users).set({ locale }).where(eq(users.id, req.user.id));
      res.json({ ok: true, locale });
    } catch {
      res.status(500).json({ message: "Η γλώσσα δεν αποθηκεύτηκε" });
    }
  });

  /**
   * The member's colour theme. Set from the header picker; the interface has
   * already switched by the time this lands, so this only makes the choice
   * follow them to the next device.
   */
  app.put("/api/user/theme", requireAuth, async (req: any, res) => {
    const theme = req.body?.theme;
    if (!isAccentTheme(theme)) {
      return res.status(400).json({ message: "Μη υποστηριζόμενο θέμα" });
    }
    try {
      await db.update(users).set({ theme }).where(eq(users.id, req.user.id));
      res.json({ ok: true, theme });
    } catch {
      res.status(500).json({ message: "Το θέμα δεν αποθηκεύτηκε" });
    }
  });

  // ── Password reset ───────────────────────────────────────────────────
  // Two ways to get a link. A member asks for one themselves and it is
  // mailed to them (30 minutes, `issued_by_id` NULL); or an admin mints one
  // and delivers it out of band (24 hours), which is still the only route
  // for someone who has lost access to their address.
  //
  // Both land on the same /reset-password page and burn the same single-use
  // token. Only the SHA-256 is ever stored.


  /**
   * Retire every live link for an account.
   *
   * Asking for a new link must invalidate the old one: otherwise a message
   * intercepted weeks ago stays usable for as long as its own expiry, and
   * "I already reset it" gives no protection at all.
   */
  const retireLiveTokens = async (userId: number) => {
    await db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
  };

  app.post("/api/admin/accounts/:userId/reset-link", requireAdmin, async (req: any, res) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      if (!Number.isFinite(userId)) {
        return res.status(400).json({ message: "Μη έγκυρο αναγνωριστικό χρήστη" });
      }
      const [target] = await db.select().from(users).where(eq(users.id, userId));
      if (!target) return res.status(404).json({ message: "Ο χρήστης δεν βρέθηκε" });

      // One live link per account: minting a new one retires any outstanding
      // link, so a stale message can't be used later to take the account.
      await retireLiveTokens(userId);

      const { token, tokenHash } = generateResetToken();
      const expiresAt = new Date(Date.now() + ADMIN_RESET_TTL_MS);
      await db.insert(passwordResetTokens).values({
        userId,
        tokenHash,
        issuedById: req.user.id,
        expiresAt,
      });

      await storage.createAccountActivity({
        userId,
        deviceFingerprint: null,
        ipAddress: (req.ip as string) || null,
        action: 'password_reset_link_issued',
        userAgent: req.headers['user-agent'] || null,
      });

      const proto = (req.headers['x-forwarded-proto'] as string | undefined) || req.protocol;
      const host = req.get('host');
      // Returned exactly once — only the hash is stored, so this response is
      // the only copy. Losing it means minting another link.
      res.json({
        url: `${proto}://${host}/reset-password?token=${encodeURIComponent(token)}`,
        expiresAt: expiresAt.toISOString(),
        username: target.username,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Δεν δημιουργήθηκε σύνδεσμος επαναφοράς" });
    }
  });

  /** Look up a live token. Returns null for missing, used, or expired. */
  async function findLiveResetToken(token: string) {
    if (typeof token !== 'string' || !token) return null;
    const [row] = await db.select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, hashResetToken(token)));
    return isResetTokenLive(row) ? row : null;
  }

  // ── Self-service "I forgot my password" ──────────────────────────────

  // Tighter than the login bucket: a login attempt costs the attacker a guess,
  // but a reset request costs us an email and costs the account holder an
  // unwanted message, so the ceiling per address is lower. Both ceilings
  // live in utils/password-reset.ts alongside the token rules.
  const resetRequestLimiter = rateLimit({
    windowMs: 60 * 60_000,
    max: process.env.DEMO_MODE === "true" ? 999 : RESET_REQUESTS_PER_IP_PER_HOUR,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.DEMO_MODE === "true",
  });

  /**
   * The same answer, always.
   *
   * Whether the address has an account, whether it is over its own limit,
   * whether the mail server accepted the message — none of it changes what
   * comes back. Anything else turns this endpoint into a way to ask "does
   * this person have an AgoraX account?", which for a political platform is
   * a question worth more than the password it protects.
   */
  const RESET_REQUEST_ACK = {
    message: "Αν υπάρχει λογαριασμός με αυτή τη διεύθυνση, θα λάβετε σύντομα email επαναφοράς κωδικού.",
  };

  app.post("/api/password-reset/request", resetRequestLimiter, async (req, res) => {
    // Answer first, work after: the response must not be timed. A caller who
    // can tell "took 40ms" from "took 300ms" learns exactly what the uniform
    // message is there to hide.
    res.json(RESET_REQUEST_ACK);

    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      if (!email || email.length > 320 || !email.includes('@')) return;

      const emailHmac = hmacIdentifier('reset-email', email);
      const ip = (req.ip as string) || null;
      const ipHmac = ip ? hmacIdentifier('reset-ip', ip) : null;

      // Counted before the account lookup, so a nonexistent address is
      // rate-limited exactly like a real one.
      const [{ recent }] = await db
        .select({ recent: count() })
        .from(passwordResetRequests)
        .where(and(
          eq(passwordResetRequests.emailHmac, emailHmac),
          gte(passwordResetRequests.requestedAt, new Date(Date.now() - 60 * 60_000)),
        ));

      await db.insert(passwordResetRequests).values({ emailHmac, ipHmac });

      if (Number(recent) >= RESET_REQUESTS_PER_EMAIL_PER_HOUR) return;

      const user = await storage.getUserByEmail(email);
      if (!user) return;

      // An account that signed up through Google has no password to reset,
      // and minting a link that sets one would quietly convert it into a
      // password account behind the member's back.
      //
      // But silence here is its own failure: about a third of this platform
      // signs in with Google, and every one of them would get the uniform
      // "check your inbox" and then wait for a link that by design never
      // arrives. The form still cannot say so — that would disclose the
      // account — but an email to the address discloses nothing to anyone
      // except the person who can already read that mailbox.
      if (!user.password) {
        sendSecurityEmailInBackground({
          userId: user.id,
          template: 'google_account',
          // One per hour per account: enough that a second honest attempt
          // gets an answer, not so many that this becomes a way to post
          // mail to someone repeatedly.
          idempotencyKey: `google_account:${user.id}:${Math.floor(Date.now() / 3_600_000)}`,
        });
        return;
      }

      if (user.accountStatus === 'banned') return;

      await retireLiveTokens(user.id);

      const { token, tokenHash } = generateResetToken();
      const expiresAt = new Date(Date.now() + SELF_RESET_TTL_MS);
      const [row] = await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        issuedById: null,
        requestedIp: ip,
        expiresAt,
      }).returning({ id: passwordResetTokens.id });

      await storage.createAccountActivity({
        userId: user.id,
        deviceFingerprint: null,
        ipAddress: ip,
        action: 'password_reset_requested',
        userAgent: req.headers['user-agent'] || null,
      });

      // The token appears here and nowhere else — not in the jobs table, not
      // in a log line, not in the activity row above.
      sendSecurityEmailInBackground({
        userId: user.id,
        template: 'password_reset',
        idempotencyKey: `password_reset:${row.id}`,
        resetUrl: `${publicUrl()}/reset-password?token=${encodeURIComponent(token)}`,
        expiresInMinutes: SELF_RESET_TTL_MINUTES,
      });
    } catch {
      // The member already has their answer. A failure here must not change
      // it, and must not say anything about which address was involved.
    }
  });

  // Lets the page say "this link is expired" before someone types a new
  // password twice for nothing.
  app.post("/api/password-reset/check", tokenCheckLimiter, async (req, res) => {
    const row = await findLiveResetToken(req.body?.token);
    res.json({ valid: !!row });
  });

  app.post("/api/password-reset", sensitiveLimiter, async (req, res) => {
    try {
      // Same rule as registration — the shared policy, not a copy of it.
      const parsedPassword = passwordPolicySchema.safeParse(req.body?.password);
      if (!parsedPassword.success) {
        const message = parsedPassword.error.issues[0]?.message
          ?? "Ο κωδικός δεν πληροί τις προϋποθέσεις";
        return res.status(400).json({ message, errors: { password: message } });
      }
      const password = parsedPassword.data;
      const row = await findLiveResetToken(req.body?.token);
      if (!row) {
        return res.status(400).json({ message: "Ο σύνδεσμος δεν ισχύει ή έχει λήξει." });
      }

      await db.update(users)
        .set({ password: await hashPassword(password) })
        .where(eq(users.id, row.userId));

      // Burn the token before anything else can go wrong with the response.
      await db.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, row.id));

      // Drop every existing session for this account. Whoever the password
      // was being taken back from must not stay signed in on their device.
      try {
        await pool.query(
          `DELETE FROM user_sessions WHERE (sess->'passport'->>'user')::int = $1`,
          [row.userId],
        );
      } catch { /* store shape differs — the password change still stands */ }

      await storage.createAccountActivity({
        userId: row.userId,
        deviceFingerprint: null,
        ipAddress: (req.ip as string) || null,
        action: 'password_reset_completed',
        userAgent: req.headers['user-agent'] || null,
      });

      // Tell the account holder their password moved. If the reset was not
      // theirs, this is the only thing that will tell them — and it is why
      // it must not be switchable off in notification settings.
      sendSecurityEmailInBackground({
        userId: row.userId,
        template: 'password_changed',
        idempotencyKey: `password_changed:${row.id}`,
        changedAt: new Date(),
      });

      // No session is created here. Someone holding a link that arrived in
      // an inbox they may not own must still prove they can sign in.
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: "Η επαναφορά απέτυχε. Δοκιμάστε ξανά." });
    }
  });

  app.post("/api/login", loginLimiter, (req, res, next) => {
    // Store any returnTo info from the session or request body
    const returnTo = req.body.returnTo || '/feed';

    // Extract client IP and device fingerprint
    const clientIp = (req.ip || req.headers['x-forwarded-for'] || (req.connection as any).remoteAddress) as string;
    const deviceFingerprint = req.body.deviceFingerprint;

    passport.authenticate("local", async (err: Error | null, user: User | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: "Authentication failed" });

      // Check if account is banned
      if (user.accountStatus === 'banned') {
        return res.status(403).send("Ο λογαριασμός σας έχει αποκλειστεί");
      }

      // Update last login IP
      try {
        if (clientIp) {
          await storage.updateUserLoginInfo(user.id, { lastLoginIp: clientIp });
        }

        // Log account activity
        await storage.createAccountActivity({
          userId: user.id,
          deviceFingerprint: deviceFingerprint || null,
          ipAddress: clientIp || null,
          action: 'login',
          userAgent: req.headers['user-agent'] || null,
        });
      } catch (updateErr) {
        }

      req.login(user, (err) => {
        if (err) return next(err);

        // Store the redirect URL in the session as well, for redundancy
        req.session.returnTo = returnTo;

        // Include returnTo in the response so client can redirect, without leaking sensitive user fields.
        return res.status(200).json({
          ...sanitizeUser(user),
          returnTo: returnTo
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(sanitizeUser(req.user as User));
  });

  // Delete user account endpoint
  app.delete("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Πρέπει να είστε συνδεδεμένοι για να διαγράψετε τον λογαριασμό σας" });
    }

    try {
      const userId = req.user.id;
      const { deletePolls } = req.query;

      // Convert query param to boolean
      const shouldDeletePolls = deletePolls === 'true';

      // Delete the user and handle their polls according to preference
      const success = await storage.deleteUser(userId, shouldDeletePolls);

      if (success) {
        // Log the user out after successful deletion
        req.logout((err) => {
          if (err) {
            // Still return success even if logout fails
          }

          res.json({
            success: true,
            message: shouldDeletePolls
              ? "Ο λογαριασμός σας και όλες οι ψηφοφορίες σας έχουν διαγραφεί επιτυχώς"
              : "Ο λογαριασμός σας έχει διαγραφεί επιτυχώς. Οι ψηφοφορίες σας έχουν μεταφερθεί στην κοινότητα"
          });
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Υπήρξε πρόβλημα κατά τη διαγραφή του λογαριασμού σας"
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Σφάλμα κατά τη διαγραφή του λογαριασμού"
      });
    }
  });

  // Google OAuth routes
  app.get('/auth/google', (req, res, next) => {
    // Store the returnTo URL in the session
    if (req.query.returnTo) {
      req.session.returnTo = req.query.returnTo as string;
    }
    // The Android app appends mobile=1. The flow starts in the app's webview
    // but Google's callback lands in the system browser — a different cookie
    // jar — so the flag must ride the OAuth state parameter, not the session.
    const state = Buffer.from(JSON.stringify({
      m: req.query.mobile === '1' ? 1 : 0,
      r: typeof req.query.returnTo === 'string' ? req.query.returnTo : '/feed',
    })).toString('base64url');

    passport.authenticate('google', {
      scope: ['profile', 'email'],
      state,
    } as any)(req, res, next);
  });

  app.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', (err: Error | null, user: User | false, info: any) => {
      if (err) {
        return res.redirect('/?error=authentication_failed');
      }

      if (!user) {
        return res.redirect('/?error=authentication_failed');
      }

      req.login(user, (err) => {
        if (err) {
          return res.redirect('/?error=login_failed');
        }

        // The state parameter round-trips through Google and is the only
        // context that survives the webview → system-browser cookie switch.
        let mobileAuth = false;
        let stateReturnTo: string | undefined;
        try {
          const parsed = JSON.parse(Buffer.from(String(req.query.state ?? ''), 'base64url').toString());
          mobileAuth = parsed?.m === 1;
          if (typeof parsed?.r === 'string' && parsed.r.startsWith('/')) stateReturnTo = parsed.r;
        } catch { /* absent or malformed state → normal web flow */ }

        const returnTo = stateReturnTo || req.session.returnTo || '/feed';
        delete req.session.returnTo;

        // Mobile flow: this response renders in the system browser, but the
        // session must reach the app's webview. Hand over a one-time code via
        // the agorax:// deep link, which Android routes back into the app.
        if (mobileAuth) {
          const code = issueMobileAuthCode(user.id, returnTo);
          // Chrome blocks plain 302 redirects to custom schemes without a
          // user gesture, so serve a tiny interstitial: JS tries the deep
          // link immediately and a visible button guarantees a tappable
          // fallback. intent:// is the Chrome-native form of the same link.
          const deepLink = `agorax://auth?code=${code}`;
          const intentLink = `intent://auth?code=${code}#Intent;scheme=agorax;package=gr.agorax.app;end`;
          res.setHeader('Cache-Control', 'no-store');
          return res.send(`<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AgoraX</title>
  <style>
    body { font-family: -apple-system, Roboto, sans-serif; display: flex; flex-direction: column;
           align-items: center; justify-content: center; min-height: 90vh; gap: 1.5rem; margin: 0; padding: 1rem; text-align: center; }
    a.btn { background: #1d4ed8; color: #fff; padding: 1rem 2.5rem; border-radius: 0.75rem;
            text-decoration: none; font-size: 1.15rem; font-weight: 600; }
    p { color: #555; max-width: 30rem; }
  </style>
</head>
<body>
  <h1>Επιτυχής σύνδεση ✓</h1>
  <p>Επιστρέψτε στην εφαρμογή AgoraX για να συνεχίσετε. / Return to the AgoraX app to continue.</p>
  <a class="btn" href="${deepLink}">Άνοιγμα εφαρμογής / Open app</a>
  <script>
    setTimeout(function () { window.location.href = ${JSON.stringify(intentLink)}; }, 150);
  </script>
</body>
</html>`);
        }

        // Redirect to the original URL or homepage after successful authentication
        return res.redirect(returnTo);
      });
    })(req, res, next);
  });

  // Exchange a deep-link one-time code for a webview session (mobile app).
  app.post('/api/auth/mobile-exchange', sensitiveLimiter, async (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    const entry = code ? consumeMobileAuthCode(code) : null;
    if (!entry) {
      return res.status(401).json({ message: 'Invalid or expired code' });
    }
    const user = await storage.getUser(entry.userId);
    if (!user) {
      return res.status(401).json({ message: 'Invalid or expired code' });
    }
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ message: 'Login failed' });
      }
      const { password: _pw, ...safeUser } = user as any;
      res.json({ ...safeUser, returnTo: entry.returnTo });
    });
  });
}
