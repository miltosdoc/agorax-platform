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
import { User as SelectUser } from "@shared/schema";
import { db } from "./db";
import { users, User, SafeUser } from "@shared/schema";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
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
      const returnTo = req.body.returnTo || '/home';

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

      // Check for existing user
      const existingUsername = await storage.getUserByUsername(req.body.username);
      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingUsername || existingEmail) {
        return res.status(400).send("Invalid registration data");
      }

      // Remove non-user fields from the data saved to the database
      const { returnTo: _, deviceFingerprint: __, consent: ___, ...userData } = req.body;

      const user = await storage.createUser({
        ...userData,
        password: await hashPassword(req.body.password),
        deviceFingerprint: deviceFingerprint || null,
        registrationIp: clientIp || null,
        lastLoginIp: clientIp || null,
        accountStatus: 'active',
        // Member came through the consent gate at registration — clear the
        // default-true flag set by the column default.
        requiresConsent: false,
      });

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
        }
      } catch (enrolErr) {
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

  app.post("/api/login", authLimiter, (req, res, next) => {
    // Store any returnTo info from the session or request body
    const returnTo = req.body.returnTo || '/home';

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

    passport.authenticate('google', {
      scope: ['profile', 'email']
    })(req, res, next);
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

        // Get the returnTo URL from the session and clear it
        const returnTo = req.session.returnTo || '/home';
        delete req.session.returnTo;

        // Redirect to the original URL or homepage after successful authentication
        return res.redirect(returnTo);
      });
    })(req, res, next);
  });
}
