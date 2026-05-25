/**
 * Debate Router
 *
 * Handles debate routes.
 */

import type { Express, Request, Response } from 'express';
import { communityRepo, debateRepo, proposalRepo } from '../storage';
import { requireAuth, requireConsent } from '../auth';
import * as debateService from '../utils/debate';

export function registerDebateRoutes(app: Express): void {
  app.get("/api/proposals/:id/arguments", async (req, res) => {
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
      const argument = await debateRepo.supportDebateArgument(parseInt(req.params.id), req.user.id);
      res.json(argument);
    } catch (error) {
      res.status(500).json({ message: "Failed to support argument" });
    }
  });
  app.post("/api/arguments/:id/oppose", requireAuth, async (req: any, res) => {
    try {
      const argument = await debateRepo.opposeDebateArgument(parseInt(req.params.id), req.user.id);
      res.json(argument);
    } catch (error) {
      res.status(500).json({ message: "Failed to oppose argument" });
    }
  });
  // ─── Demopolis: Debate Threads (Διάλογος σε νήματα) ───────────────────────
  app.get("/api/proposals/:id/debate", async (req, res) => {
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
  app.get("/api/proposals/:id/debate/stats", async (req, res) => {
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
  // ─── Demopolis: Proposal Support Routes ────────────────────────────────────
}