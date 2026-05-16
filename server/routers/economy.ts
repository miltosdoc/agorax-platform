/**
 * Economy Router — Democracy Points.
 *
 * Read surface (schedule, balances), the redemption request path, and the
 * admin decision routes. Redemption is honestly gated — see economy/config
 * (phase) and economy/redemption (verification).
 */

import type { Express } from 'express';
import { requireAuth, requireAdmin } from '../auth';
import { getPointSummary } from '../economy/points';
import { publishedSchedule } from '../economy/schedule';
import { getEconomyPhase, getPointsPerEur, redemptionOpen } from '../economy/config';
import {
  requestRedemption,
  listRedemptions,
  decideRedemption,
  isVerified,
  treasurySummary,
} from '../economy/redemption';

export function registerEconomyRoutes(app: Express): void {
  // The published participation → points schedule + economy phase. Public.
  app.get('/api/economy/schedule', async (_req, res) => {
    try {
      const [phase, pointsPerEur] = await Promise.all([
        getEconomyPhase(),
        getPointsPerEur(),
      ]);
      res.json({
        phase,
        pointsPerEur,
        redemptionOpen: redemptionOpen(phase),
        schedule: publishedSchedule(),
      });
    } catch {
      res.status(500).json({ message: 'Failed to load economy schedule' });
    }
  });

  // Public, transparent treasury totals.
  app.get('/api/economy/treasury', async (_req, res) => {
    try {
      res.json(await treasurySummary());
    } catch {
      res.status(500).json({ message: 'Failed to load treasury' });
    }
  });

  // The current user's Democracy Points — balance, ledger, redeem-eligibility.
  app.get('/api/me/points', requireAuth, async (req: any, res) => {
    try {
      const [summary, verified, phase] = await Promise.all([
        getPointSummary(req.user.id),
        isVerified(req.user.id),
        getEconomyPhase(),
      ]);
      res.json({ ...summary, verified, redemptionOpen: redemptionOpen(phase) });
    } catch {
      res.status(500).json({ message: 'Failed to load points' });
    }
  });

  // Request a redemption (phase- and verification-gated).
  app.post('/api/me/points/redeem', requireAuth, async (req: any, res) => {
    const result = await requestRedemption(req.user.id, Number(req.body?.points));
    if (!result.ok) {
      return res
        .status(result.reason === 'error' ? 500 : 400)
        .json({ message: result.reason ?? 'failed' });
    }
    res.status(201).json(result);
  });

  // The current user's own redemption requests.
  app.get('/api/me/redemptions', requireAuth, async (req: any, res) => {
    try {
      res.json(await listRedemptions(req.user.id));
    } catch {
      res.status(500).json({ message: 'Failed to load redemptions' });
    }
  });

  // Admin: list every redemption request.
  app.get('/api/admin/redemptions', requireAdmin, async (_req, res) => {
    try {
      res.json(await listRedemptions());
    } catch {
      res.status(500).json({ message: 'Failed to load redemptions' });
    }
  });

  // Admin: approve / reject / mark-paid a redemption.
  app.post('/api/admin/redemptions/:id', requireAdmin, async (req: any, res) => {
    const id = parseInt(req.params.id, 10);
    const decision = req.body?.decision;
    if (!Number.isFinite(id) || !['approve', 'reject', 'pay'].includes(decision)) {
      return res.status(400).json({ message: 'id and decision (approve|reject|pay) required' });
    }
    const result = await decideRedemption(id, decision);
    if (!result.ok) {
      return res
        .status(result.reason === 'error' ? 500 : 400)
        .json({ message: result.reason ?? 'failed' });
    }
    res.json(result);
  });
}
