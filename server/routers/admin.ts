/**
 * Admin Router
 *
 * Handles admin routes.
 */

import type { Express, Request, Response } from 'express';
import multer from 'multer';
import { userRepo } from '../storage';
import { requireAdmin } from '../auth';

export function registerAdminRoutes(app: Express): void {
  app.get("/api/admin/accounts", requireAdmin, async (req, res) => {
    try {
      const { status, search } = req.query;
      const filters = {
        status: status && status !== 'undefined' ? status as string : undefined,
        search: search && search !== 'undefined' ? search as string : undefined
      };
      const users = await userRepo.getAllUsersWithAccountInfo(filters);
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ message: "Σφάλμα κατά την ανάκτηση των λογαριασμών χρηστών" });
    }
  });
  app.get("/api/admin/accounts/:userId/activity", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Μη έγκυρο αναγνωριστικό χρήστη" });
      }
      const activity = await userRepo.getUserAccountActivity(userId);
      res.json(activity);
    } catch (error: any) {
      res.status(500).json({ message: "Σφάλμα κατά την ανάκτηση του ιστορικού δραστηριότητας" });
    }
  });
  app.post("/api/admin/accounts/:userId/ban", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Μη έγκυρο αναγνωριστικό χρήστη" });
      }
      const updatedUser = await userRepo.updateAccountStatus(userId, 'banned');
      res.json({
        success: true,
        message: "Ο λογαριασμός χρήστη έχει αποκλειστεί επιτυχώς",
        user: updatedUser
      });
    } catch (error: any) {
      res.status(500).json({ message: "Σφάλμα κατά τον αποκλεισμό του λογαριασμού χρήστη" });
    }
  });
  app.post("/api/admin/accounts/:userId/approve", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Μη έγκυρο αναγνωριστικό χρήστη" });
      }
      const updatedUser = await userRepo.updateAccountStatus(userId, 'active');
      res.json({
        success: true,
        message: "Ο λογαριασμός χρήστη έχει εγκριθεί επιτυχώς",
        user: updatedUser
      });
    } catch (error: any) {
      res.status(500).json({ message: "Σφάλμα κατά την έγκριση του λογαριασμού χρήστη" });
    }
  });
  // ============================================
  // GOV.GR BALLOT VOTING ROUTES
  // ============================================
  // These routes proxy to the Python ballot validation service
  // for verifying Gov.gr Solemn Declaration PDFs as certified ballots
  // multer imported at top
  const ballotUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: async (req, file, cb) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed'));
      }
    }
  });
}