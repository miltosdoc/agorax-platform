/**
 * Users Router
 *
 * Handles users routes.
 */

import type { Express, Request, Response } from 'express';
import multer from 'multer';
import { userRepo } from '../storage';
import { requireAuth } from '../auth';
import { verifyLocationSchema, locationSchema } from '../utils/location-validator';
import { ballotUpload } from '../utils/ballot-client';
import { requireAdmin } from '../auth';

export function registerUsersRoutes(app: Express): void {
  app.patch("/api/user/verify-location", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Δεν είστε συνδεδεμένοι" });
      }
      const parsedData = verifyLocationSchema(req.body);
      if (!parsedData.success) {
        return res.status(400).json({
          message: "Λανθασμένα δεδομένα επαλήθευσης",
          errors: JSON.stringify(parsedData.error || "Validation failed")
        });
      }
      // Update the user's location verification status
      const updated = await userRepo.verifyUserLocation(userId, parsedData.data.verified);
      // If verification is false, reset the location confirmation as well
      if (!parsedData.data.verified) {
        await userRepo.updateUserLocation(userId, {
          locationConfirmed: false,
          locationVerified: false
        });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Σφάλμα κατά την επαλήθευση τοποθεσίας" });
    }
  });
  app.patch("/api/user/location", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const parsedData = verifyLocationSchema(req.body);
      if (!parsedData.success) {
        return res.status(400).json({
          message: "Λανθασμένα δεδομένα τοποθεσίας",
          errors: JSON.stringify(parsedData.error || "Validation failed")
        });
      }
      const updatedUser = await userRepo.updateUserLocation(userId, parsedData.data);
      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ message: "Σφάλμα κατά την ενημέρωση της τοποθεσίας" });
    }
  });
  // Admin-only access control middleware
  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };
  // Analytics Dashboard Endpoints (Public - Platform Statistics)
  app.post("/api/user/verify-govgr", requireAuth, multer({ storage: multer.memoryStorage() }).single('file'), async (req: any, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "PDF file is required" });
      }
      // Verify identity via Python ballot service
      const { verifyIdentity } = await import('../utils/ballot-client');
      const result = await verifyIdentity(file.buffer);
      if (result.success) {
        const voterHash = result.voter_hash || "";
        const docCodeHash = result.doc_code_hash || "";
        const demo = result.demographics || {};

        // One person = one account: the AFM hash must not already belong to
        // a different account.
        if (voterHash) {
          const existingUser = await userRepo.getUserByVoterHash(voterHash);
          if (existingUser && existingUser.id !== req.user.id) {
            return res.status(400).json({
              success: false,
              message: "Αυτή η ταυτότητα είναι ήδη συνδεδεμένη με άλλο λογαριασμό",
              rejection_reason: "already_verified"
            });
          }
        }

        // Anti-replay: the same declaration document cannot verify two accounts.
        if (docCodeHash) {
          const { db } = await import('../db');
          const { users } = await import('@shared/schema');
          const { and, eq, ne } = await import('drizzle-orm');
          const [reused] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.govgrDocCodeHash, docCodeHash), ne(users.id, req.user.id)))
            .limit(1);
          if (reused) {
            return res.status(400).json({
              success: false,
              message: "Αυτή η δήλωση έχει ήδη χρησιμοποιηθεί για επαλήθευση",
              rejection_reason: "duplicate_file"
            });
          }
        }

        // Store verification + the minimal verified demographics.
        await userRepo.updateUser(req.user.id, {
          govgrVerified: true,
          govgrVerifiedAt: new Date(),
          govgrVoterHash: voterHash || "hash-missing",
          govgrDocCodeHash: docCodeHash || null,
          govgrFirstName: demo.first_name ?? null,
          govgrLastName: demo.last_name ?? null,
          govgrDob: demo.date_of_birth ?? null,
          govgrPlaceOfBirth: demo.place_of_birth ?? null,
          govgrMunicipality: demo.municipality ?? null,
          govgrPostcode: demo.postcode ?? null,
        });
        return res.status(200).json({
          success: true,
          message: "Η ταυτότητά σας επαληθεύτηκε επιτυχώς μέσω Gov.gr",
          signer_name: result.signer_name,
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.message,
          rejection_reason: result.rejection_reason,
        });
      }
    } catch (error) {
      res.status(500).json({ message: "Σφάλμα κατά την επαλήθευση ταυτότητας" });
    }
  });
  // ─── Demopolis: Community Routes ────────────────────────────────────────────
}