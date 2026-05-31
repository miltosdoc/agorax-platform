/**
 * Ballot Router — DEPRECATED FOR BINDING VOTES
 *
 * Handles ballot routes. Uses deterministic AFM hash (SHA256(AFM + SALT))
 * which is brute-forceable at ~30 bits entropy. Pseudonymous, not anonymous.
 *
 * ⚠️  DISABLED IN PRODUCTION — see docs/compliance/DEPLOYMENT_HARDENING.md
 *
 * For binding votes, use the blind-signature anonymous voting flow:
 *   /api/proposals/:id/blind-sign  →  /api/proposals/:id/anonymous-vote
 *
 * Ballot voting is retained for consultative purposes only.
 * Gate: ENABLE_BALLOT_VOTING env var (default: disabled in production).
 */

import type { Express, Request, Response } from 'express';
import multer from 'multer';
import { votingRepo } from '../storage';
import { ballotUpload } from '../utils/ballot-client';
import { requireAuth } from '../auth';

// Production gate: ballot voting is disabled by default.
// Set ENABLE_BALLOT_VOTING=true ONLY for explicit consultative use.
const BALLOT_VOTING_ENABLED = (process.env.ENABLE_BALLOT_VOTING || 'false') === 'true';

function ballotDisabledResponse(res: Response): void {
  res.status(501).json({
    message: "Ballot voting is disabled in this deployment. Use anonymous voting (/blind-sign + /anonymous-vote) for binding votes.",
    error: "BALLOT_VOTING_DISABLED",
    consultative_only: true,
  });
}

export function registerBallotRoutes(app: Express): void {
  // Health check and stats are always available (read-only, no privacy impact)
  app.get("/api/ballot/health", async (req, res) => {
    try {
      const { checkBallotServiceHealth } = await import('../utils/ballot-client');
      const isHealthy = await checkBallotServiceHealth();
      res.json({
        status: isHealthy ? 'healthy' : 'unavailable',
        service: 'ballot-validator'
      });
    } catch (error) {
      res.json({ status: 'unavailable', service: 'ballot-validator' });
    }
  });
  app.get("/api/ballot/stats/:pollId", async (req, res) => {
    try {
      const pollId = req.params.pollId;
      const { getBallotStats } = await import('../utils/ballot-client');
      const stats = await getBallotStats(pollId);
      if (!stats) {
        return res.status(503).json({
          message: "Ballot service unavailable or no votes yet."
        });
      }
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Σφάλμα κατά την ανάκτηση στατιστικών" });
    }
  });

  // Write operations gated by ENABLE_BALLOT_VOTING
  app.post("/api/ballot/token", requireAuth, async (req, res) => {
    if (!BALLOT_VOTING_ENABLED) return ballotDisabledResponse(res);
    try {
      const { pollId } = req.body;
      if (!pollId) {
        return res.status(400).json({ message: "Poll ID is required" });
      }
      const poll = await votingRepo.getPoll(parseInt(pollId));
      if (!poll) {
        return res.status(404).json({ message: "Η ψηφοφορία δεν βρέθηκε" });
      }
      const { generatePollToken } = await import('../utils/ballot-client');
      const token = generatePollToken();
      res.json({ token, pollId: String(pollId) });
    } catch (error) {
      res.status(500).json({ message: "Σφάλμα κατά τη δημιουργία token" });
    }
  });
  app.get("/api/ballot/instructions", requireAuth, async (req, res) => {
    if (!BALLOT_VOTING_ENABLED) return ballotDisabledResponse(res);
    try {
      const { pollId, pollToken } = req.query;
      if (!pollId || !pollToken) {
        return res.status(400).json({ message: "Poll ID and token are required" });
      }
      const { getBallotInstructions } = await import('../utils/ballot-client');
      const instructions = await getBallotInstructions(
        String(pollId),
        String(pollToken)
      );
      if (!instructions) {
        return res.status(503).json({
          message: "Ballot service unavailable. Please try again later."
        });
      }
      res.json(instructions);
    } catch (error) {
      res.status(500).json({ message: "Σφάλμα κατά την ανάκτηση οδηγιών" });
    }
  });
  app.post("/api/ballot/validate", requireAuth, multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single('file'), async (req: any, res) => {
    if (!BALLOT_VOTING_ENABLED) return ballotDisabledResponse(res);
    try {
      const file = req.file;
      const { pollId, pollToken } = req.body;
      if (!file) {
        return res.status(400).json({ message: "PDF file is required" });
      }
      if (!pollId || !pollToken) {
        return res.status(400).json({ message: "Poll ID and token are required" });
      }
      const poll = await votingRepo.getPoll(parseInt(pollId));
      if (!poll) {
        return res.status(404).json({ message: "Η ψηφοφορία δεν βρέθηκε" });
      }
      if (!poll.isActive) {
        return res.status(400).json({ message: "Η ψηφοφορία έχει ολοκληρωθεί" });
      }
      const { validateBallot } = await import('../utils/ballot-client');
      const result = await validateBallot(
        file.buffer,
        String(pollId),
        String(pollToken),
      );
      if (result.success) {
        return res.status(201).json({
          success: true,
          message: "Η ψήφος σας καταχωρήθηκε επιτυχώς μέσω Gov.gr",
          vote_choice: result.vote_choice,
          signer_name: result.signer_name,
        });
      } else {
        const statusMap: Record<string, number> = {
          'invalid_signature': 403,
          'no_signature': 403,
          'unknown_signer': 403,
          'duplicate_file': 409,
          'already_voted': 409,
          'invalid_token': 400,
          'token_not_found': 400,
          'afm_not_found': 400,
          'vote_choice_not_found': 400,
          'pdf_read_error': 400,
        };
        const status = result.rejection_reason
          ? (statusMap[result.rejection_reason] || 400)
          : 400;
        return res.status(status).json({
          success: false,
          message: result.message,
          rejection_reason: result.rejection_reason,
        });
      }
    } catch (error) {
      res.status(500).json({ message: "Σφάλμα κατά την επαλήθευση της ψήφου" });
    }
  });
}