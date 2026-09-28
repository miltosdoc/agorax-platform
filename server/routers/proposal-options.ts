/**
 * Candidacies and poll answers during an election's or a poll's co-drafting
 * phase — see server/utils/option-collection.ts.
 *
 *   GET    /api/proposals/:id/options               the list as it stands
 *   POST   /api/proposals/:id/options               add { label } or stand { self: true }
 *   DELETE /api/proposals/:id/options/:optionId     withdraw an entry
 *
 * Who put a name forward is not shown: in a small association, "who nominated
 * whom" is exactly the kind of detail that makes people hesitate. Each viewer
 * only learns which entries are theirs to withdraw.
 */
import type { Express } from 'express';
import { communityRepo, proposalRepo } from '../storage';
import { requireAuth, requireConsent } from '../auth';
import { requireProposalContentAccess } from '../utils/community-visibility';
import { activeOptions, addOption, isCollecting, removeOption } from '../utils/option-collection';
import { kindCollectsOptions, proposalKindOf, voteRulesFor } from '@shared/proposal-kinds';

export function registerProposalOptionRoutes(app: Express): void {
  app.get('/api/proposals/:id/options', requireProposalContentAccess(), async (req: any, res) => {
    try {
      const proposal = await proposalRepo.getProposal(parseInt(req.params.id, 10));
      if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
      if (proposal.status === 'draft' && proposal.authorId !== req.user?.id) {
        return res.status(404).json({ message: 'Proposal not found' });
      }
      const me: number | null = req.user?.id ?? null;
      const isAuthor = me !== null && proposal.authorId === me;
      const options = await activeOptions(proposal.id);
      const items = options.map((o) => ({
        id: o.id,
        label: o.label,
        standing: o.nomineeUserId !== null,
        mine: me !== null && (o.userId === me || o.nomineeUserId === me),
        canRemove: me !== null && (isAuthor || o.userId === me || o.nomineeUserId === me),
      }));
      res.json({
        open: isCollecting(proposal as any),
        closesAt: (proposal as any).phaseDeadline ?? null,
        iAmStanding: me !== null && options.some((o) => o.nomineeUserId === me),
        items,
      });
    } catch (error) {
      console.error('list-options failed:', error);
      res.status(500).json({ message: 'Failed to load options' });
    }
  });

  app.post('/api/proposals/:id/options', requireAuth, requireConsent, async (req: any, res) => {
    try {
      const proposal = await proposalRepo.getProposal(parseInt(req.params.id, 10));
      if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
      if (!isCollecting(proposal as any)) {
        return res.status(409).json({ message: 'Η λίστα δεν είναι ανοιχτή.' });
      }
      const userId: number = req.user.id;
      if (!(await communityRepo.isCommunityMember(proposal.communityId, userId))) {
        return res.status(403).json({ message: 'Στη λίστα προσθέτουν μόνο τα μέλη της κοινότητας.' });
      }
      // The community may have switched the phase off after it opened; the
      // list then stops growing, though what is on it stays.
      const community = await communityRepo.getCommunity(proposal.communityId);
      const kind = proposalKindOf((proposal as any).kind);
      if (!voteRulesFor(community as unknown as Record<string, unknown>, kind).codrafting) {
        return res.status(403).json({ message: 'Η κοινότητα έχει κλείσει αυτή τη φάση.' });
      }
      const standing = req.body?.self === true;
      if (standing && kind !== 'election') {
        return res.status(400).json({ message: 'Υποψήφιους έχει μόνο η εκλογή.' });
      }
      const label = standing
        ? String(req.user.name || req.user.username || '').trim()
        : typeof req.body?.label === 'string' ? req.body.label : '';
      const result = await addOption({
        proposalId: proposal.id,
        userId,
        label,
        nomineeUserId: standing ? userId : null,
      });
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      res.status(201).json({ id: result.option.id, label: result.option.label });
    } catch (error) {
      console.error('add-option failed:', error);
      res.status(500).json({ message: 'Failed to add option' });
    }
  });

  app.delete('/api/proposals/:id/options/:optionId', requireAuth, async (req: any, res) => {
    try {
      const proposal = await proposalRepo.getProposal(parseInt(req.params.id, 10));
      if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
      if (!kindCollectsOptions(proposalKindOf((proposal as any).kind)) || !isCollecting(proposal as any)) {
        return res.status(409).json({ message: 'Η λίστα έχει κλειδώσει.' });
      }
      const result = await removeOption({
        proposalId: proposal.id,
        optionId: parseInt(req.params.optionId, 10),
        userId: req.user.id,
        isAuthor: proposal.authorId === req.user.id,
      });
      if (!result.ok) return res.status(result.status ?? 400).json({ message: result.message });
      res.json({ ok: true });
    } catch (error) {
      console.error('remove-option failed:', error);
      res.status(500).json({ message: 'Failed to remove option' });
    }
  });
}
