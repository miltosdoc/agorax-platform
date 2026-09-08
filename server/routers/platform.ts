/**
 * Platform Router
 *
 * Handles platform routes.
 */

import type { Express, Request, Response } from 'express';
import { platformRepo } from '../storage';
import { isWritablePlatformSettingKey } from '@shared/platform-setting-keys';
import { requireAuth, requireAdmin } from '../auth';

export function registerPlatformRoutes(app: Express): void {
  // Get platform settings
  app.get("/api/platform-settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const settings = await platformRepo.getPlatformSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to get platform settings" });
    }
  });
  /**
   * Write a platform setting. Administrators only.
   *
   * This was gated on requireAuth alone, which made it a privilege
   * escalation: any signed-in member could write any key. The storage layer
   * upserts whatever it is handed, so that included keys no screen exposes —
   * `economy.phase` among them, which is the gate holding Democracy Points
   * redemption closed at `pre_revenue`. Turning that to `early_revenue` is a
   * financial control, and it was one PATCH away from any account.
   */
  const updatePlatformSettingHandler = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user!.id;
      const { key, value } = req.body;
      if (!key || value === undefined || value === null) {
        return res.status(400).json({ message: "key and value are required" });
      }
      // An allowlist as well as the admin gate. The write is an upsert, so an
      // unknown key does not fail loudly — it quietly creates a setting that
      // nothing reads, or worse, one that something reads and nobody meant to
      // set. A typo should be a 400, not a new row.
      if (!isWritablePlatformSettingKey(key)) {
        return res.status(400).json({ message: `Unknown platform setting: ${key}` });
      }
      const setting = await platformRepo.updatePlatformSetting(key, String(value), userId);
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to update platform setting" });
    }
  };
  app.put("/api/platform-settings", requireAuth, requireAdmin, updatePlatformSettingHandler);
  app.patch("/api/platform-settings", requireAuth, requireAdmin, updatePlatformSettingHandler);
  // Search members and communities
  app.get("/api/search", requireAuth, async (req: any, res: Response) => {
    try {
      const query = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 10;
      if (!query) {
        return res.json({ proposals: [], members: [], communities: [] });
      }
      const { proposalRepo } = await import('../storage');
      const { visibleCommunityIdSet } = await import('../utils/community-visibility');
      const [members, communities, rawProposals] = await Promise.all([
        platformRepo.searchMembers(query, limit),
        platformRepo.searchCommunities(query, limit),
        proposalRepo.searchProposals(query, limit * 2),
      ]);
      // Proposals respect content visibility and draft/archived privacy —
      // same rules as every other read surface.
      const visible = await visibleCommunityIdSet(rawProposals.map((p: any) => p.communityId), req.user?.id);
      const proposals = rawProposals
        .filter((p: any) => visible.has(p.communityId))
        .filter((p: any) => p.status !== 'draft' || p.authorId === req.user?.id)
        .filter((p: any) => p.status !== 'archived')
        .slice(0, limit);
      res.json({
        proposals: proposals.map((p: any) => ({
          id: p.id,
          question: p.question,
          status: p.status,
          communityId: p.communityId,
          category: p.category ?? null,
        })),
        members: members.map(m => ({
          id: m.id,
          name: m.name ?? m.username,
          username: m.username,
          profilePicture: m.profilePicture,
        })),
        communities: communities.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description,
        })),
      });
    } catch (error) {
      console.error('search failed:', error);
      res.status(500).json({ message: "Search failed" });
    }
  });
}