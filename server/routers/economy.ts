/**
 * Economy Router — Democracy Points.
 *
 * Read surface for civic-participation credit: the published point schedule
 * (public) and the current user's balance + ledger. Redemption routes land
 * in a later phase.
 */

import type { Express } from 'express';
import { requireAuth } from '../auth';
import { getPointSummary } from '../economy/points';
import { publishedSchedule } from '../economy/schedule';
import { getEconomyPhase, getPointsPerEur, redemptionOpen } from '../economy/config';

export function registerEconomyRoutes(app: Express): void {
  // The published participation → points schedule + economy phase. Public,
  // so anyone can audit what civic action earns what.
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

  // The current user's Democracy Points — balance, lifetime earned, ledger.
  app.get('/api/me/points', requireAuth, async (req: any, res) => {
    try {
      res.json(await getPointSummary(req.user.id));
    } catch {
      res.status(500).json({ message: 'Failed to load points' });
    }
  });
}
