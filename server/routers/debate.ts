/**
 * Debate Router
 *
 * Handles debate routes.
 */

import type { Express, Request, Response } from 'express';
import { communityRepo, debateRepo, proposalRepo } from '../storage';
import { requireAuth, requireConsent } from '../auth';
import * as debateService from '../utils/debate';
import { requireProposalContentAccess } from '../utils/community-visibility';
import { db } from '../db';
import { debateArguments, debateThreads } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Voting on debate content is participation, same as writing it: it
 * requires community membership (which also stops non-members of a
 * members-only community from reading argument text echoed back by the
 * vote response). Resolves the argument/thread to its proposal's
 * community and 403s non-members; 404s missing rows.
 */
async function debateVoteMembershipGate(
  kind: 'argument' | 'thread',
  id: number,
  userId: number,
  res: Response,
): Promise<boolean> {
  const table = kind === 'argument' ? debateArguments : debateThreads;
  const [row] = await db
    .select({ proposalId: table.proposalId })
    .from(table)
    .where(eq(table.id, id));
  if (!row) {
    res.status(404).json({ message: `${kind === 'argument' ? 'Argument' : 'Thread'} not found` });
    return false;
  }
  const proposal = await proposalRepo.getProposal(row.proposalId);
  if (!proposal) {
    res.status(404).json({ message: 'Proposal not found' });
    return false;
  }
  const isMember = await communityRepo.isCommunityMember(proposal.communityId, userId);
  if (!isMember) {
    res.status(403).json({ message: 'Must be a community member' });
    return false;
  }
  return true;
}

export function registerDebateRoutes(app: Express): void {
  app.get("/api/proposals/:id/arguments", requireProposalContentAccess(), async (req, res) => {
    try {
      const arguments_ = await debateRepo.getDebateArguments(parseInt(req.params.id));
      res.json(arguments_);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch arguments" });
    }
  });
  app.post("/api/proposals/:id/arguments", requireAuth, requireConsent, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      const isMember = await communityRepo.isCommunityMember(proposal.communityId, req.user.id);
      if (!isMember) return res.status(403).json({ message: "Must be a community member" });
      const { side, text } = req.body;
      if (!side || !text) {
        return res.status(400).json({ message: "Side and text are required" });
      }
      const argument = await debateRepo.createDebateArgument({
        proposalId,
        authorId: req.user.id,
        side,
        text,
      });
      res.status(201).json(argument);
    } catch (error) {
      res.status(500).json({ message: "Failed to create argument" });
    }
  });
  app.post("/api/arguments/:id/support", requireAuth, async (req: any, res) => {
    try {
      const argumentId = parseInt(req.params.id);
      if (Number.isNaN(argumentId)) {
        return res.status(400).json({ message: "Invalid argument id" });
      }
      if (!(await debateVoteMembershipGate('argument', argumentId, req.user.id, res))) return;
      const argument = await debateRepo.supportDebateArgument(argumentId, req.user.id);
      res.json(argument);
    } catch (error) {
      res.status(500).json({ message: "Failed to support argument" });
    }
  });
  app.post("/api/arguments/:id/oppose", requireAuth, async (req: any, res) => {
    try {
      const argumentId = parseInt(req.params.id);
      if (Number.isNaN(argumentId)) {
        return res.status(400).json({ message: "Invalid argument id" });
      }
      if (!(await debateVoteMembershipGate('argument', argumentId, req.user.id, res))) return;
      const argument = await debateRepo.opposeDebateArgument(argumentId, req.user.id);
      res.json(argument);
    } catch (error) {
      res.status(500).json({ message: "Failed to oppose argument" });
    }
  });
  // ─── Debate Threads (Διάλογος σε νήματα) ───────────────────────
  app.get("/api/proposals/:id/debate", requireProposalContentAccess(), async (req, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      if (Number.isNaN(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const threads = await debateService.getThreads(proposalId);
      res.json(threads);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch debate threads" });
    }
  });
  app.get("/api/proposals/:id/debate/stats", requireProposalContentAccess(), async (req, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      if (Number.isNaN(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const stats = await debateService.getThreadStats(proposalId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch debate stats" });
    }
  });
  app.post("/api/proposals/:id/debate", requireAuth, requireConsent, async (req: any, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      if (Number.isNaN(proposalId)) {
        return res.status(400).json({ message: "Invalid proposal id" });
      }
      const proposal = await proposalRepo.getProposal(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      const isMember = await communityRepo.isCommunityMember(proposal.communityId, req.user.id);
      if (!isMember) return res.status(403).json({ message: "Must be a community member" });
      const { content, parentId } = req.body ?? {};
      if (typeof content !== 'string' || content.trim() === '') {
        return res.status(400).json({ message: "Content is required" });
      }
      const thread = parentId
        ? await debateService.replyToThread(Number(parentId), req.user.id, content)
        : await debateService.createThread(proposalId, req.user.id, content);
      res.status(201).json(thread);
    } catch (error) {
      if (error instanceof debateService.DebateError) {
        const status = error.code === 'not_found' ? 404 : error.code === 'closed' ? 409 : 400;
        return res.status(status).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to create debate thread" });
    }
  });
  app.post("/api/debate/:id/vote", requireAuth, async (req: any, res) => {
    try {
      const threadId = parseInt(req.params.id);
      if (Number.isNaN(threadId)) {
        return res.status(400).json({ message: "Invalid thread id" });
      }
      const direction = req.body?.direction;
      if (direction !== 'up' && direction !== 'down') {
        return res.status(400).json({ message: "direction must be 'up' or 'down'" });
      }
      if (!(await debateVoteMembershipGate('thread', threadId, req.user.id, res))) return;
      const updated = await debateService.voteThread(threadId, req.user.id, direction);
      res.json(updated);
    } catch (error) {
      if (error instanceof debateService.DebateError) {
        const status = error.code === 'not_found' ? 404 : error.code === 'closed' ? 409 : 400;
        return res.status(status).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to vote on debate thread" });
    }
  });
  // ─── Proposal Support Routes ────────────────────────────────────
}