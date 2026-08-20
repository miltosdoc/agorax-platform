import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Express } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { scrypt, randomBytes, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import { DatabaseStorage } from "./storage";
export const storage = new DatabaseStorage();
import { User as SelectUser, registerUserSchema } from "@shared/schema";
import { db } from "./db";
import { users, passwordResetTokens, User, SafeUser } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { throttledFor, recordLoginFailure, clearLoginFailures } from "./utils/login-throttle";
import { isPasswordBreached } from "./utils/password-breach";
import { addMember as addCommunityMember, getGeneralCommunity } from "./utils/community-manager";
import {
  CURRENT_CONSENT_VERSION,
  validateConsent,
} from "../shared/consent";
import { consentTextHash } from "./utils/consent-hash";

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

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.DEMO_MODE === "true" ? 999 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === "GET" || process.env.DEMO_MODE === "true",
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
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
                const [updatedUser] = await db
                  .update(users)
                  .set({
                    providerId: profile.id,
                    provider: 'google',
                    profilePicture: profile.photos?.[0]?.value || null
                  })
                  .where(eq(users.id, existingUser.id))
                  .returning();

                return done(null, updatedUser);
              }
            }

            // Create a new user with Google profile info
            const name = profile.displayName || 'User';
            const email = profile.emails?.[0]?.value || `${profile.id}@gmail.com`;

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
            const newUser = await storage.createUser({
              username,
              name,
              email,
              provider: 'google',
              providerId: profile.id,
              profilePicture: profile.photos?.[0]?.value || null
            });

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

  app.post("/api/register", authLimiter, async (req, res, next) => {
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

      // Length alone lets `Password123456` through. Reject passwords already
      // known from breach corpora — see utils/password-breach.ts for the
      // k-anonymity lookup (the password never leaves this server) and for why
      // this fails open on error.
      if (await isPasswordBreached(parsed.data.password)) {
        return res.status(400).json({
          message: "Ελέγξτε τα στοιχεία σας",
          errors: {
            password:
              "Αυτός ο κωδικός εμφανίζεται σε γνωστές διαρροές δεδομένων και δεν είναι ασφαλής. Επιλέξτε άλλον.",
          },
        });
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

  // ── Admin-issued password reset ──────────────────────────────────────
  // No mail service exists on this deployment, so there is no self-service
  // "forgot my password". An admin mints a single-use link and delivers it
  // out of band. Until this existed, a forgotten password meant a lost
  // account: nothing in the UI or the API could set a new one.

  const RESET_TTL_MS = 24 * 60 * 60_000;

  const hashResetToken = (token: string) =>
    createHash('sha256').update(token).digest('hex');

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
      await db.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));

      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + RESET_TTL_MS);
      await db.insert(passwordResetTokens).values({
        userId,
        tokenHash: hashResetToken(token),
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
    if (!row) return null;
    if (row.usedAt) return null;
    if (new Date(row.expiresAt).getTime() <= Date.now()) return null;
    return row;
  }

  // Lets the page say "this link is expired" before someone types a new
  // password twice for nothing.
  app.post("/api/password-reset/check", authLimiter, async (req, res) => {
    const row = await findLiveResetToken(req.body?.token);
    res.json({ valid: !!row });
  });

  app.post("/api/password-reset", authLimiter, async (req, res) => {
    try {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (password.length < 8) {
        return res.status(400).json({
          message: "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες",
          errors: { password: "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες" },
        });
      }
      if (await isPasswordBreached(password)) {
        return res.status(400).json({
          message: "Επιλέξτε άλλον κωδικό",
          errors: {
            password:
              "Αυτός ο κωδικός εμφανίζεται σε γνωστές διαρροές δεδομένων και δεν είναι ασφαλής. Επιλέξτε άλλον.",
          },
        });
      }

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

      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: "Η επαναφορά απέτυχε. Δοκιμάστε ξανά." });
    }
  });

  app.post("/api/login", authLimiter, (req, res, next) => {
    // Store any returnTo info from the session or request body
    const returnTo = req.body.returnTo || '/feed';

    // Per-account throttle: the IP limiter above does nothing against a botnet
    // trying one password per address against the same account.
    const attemptedUsername = typeof req.body?.username === 'string' ? req.body.username : '';
    const retryAfter = throttledFor(attemptedUsername);
    if (retryAfter !== null) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        message: 'Πολλές αποτυχημένες προσπάθειες για αυτόν τον λογαριασμό. Δοκιμάστε ξανά αργότερα.',
        retryAfter,
      });
    }

    // Extract client IP and device fingerprint
    const clientIp = (req.ip || req.headers['x-forwarded-for'] || (req.connection as any).remoteAddress) as string;
    const deviceFingerprint = req.body.deviceFingerprint;

    passport.authenticate("local", async (err: Error | null, user: User | false, info: any) => {
      if (err) return next(err);
      if (!user) {
        recordLoginFailure(attemptedUsername);
        return res.status(401).json({ message: "Authentication failed" });
      }
      // Correct credentials clear the account's failure history immediately,
      // so an attacker's noise never keeps the real member out.
      clearLoginFailures(attemptedUsername);

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
  app.post('/api/auth/mobile-exchange', authLimiter, async (req, res) => {
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
