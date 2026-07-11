/**
 * Analytics Router — platform-wide aggregates over the REAL data model
 * (communities, proposals, ratification votes, amendments, debate, surveys,
 * conferences). Replaces the legacy polls-era stubs that fed the dashboard
 * empty objects. Aggregate counts only — nothing member-identifying — so the
 * endpoints stay public, in keeping with the platform's transparency ethos.
 */

import type { Express } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

export function registerAnalyticsRoutes(app: Express): void {
  app.get('/api/analytics/overview', async (_req, res) => {
    try {
      const one = async (q: ReturnType<typeof sql>): Promise<number> => {
        const r: any = await db.execute(q);
        const rows = r.rows ?? r;
        return Number(rows[0]?.c ?? 0);
      };

      const [
        totalUsers, newUsers7, newUsers30,
        totalCommunities, totalProposals, directVoteProposals,
        decidedProposals, activeVotes,
        totalBallots, totalAmendments, acceptedAmendments, rejectedAmendments,
        totalDebate, totalSurveyPolls, totalSurveyResponses, conferences,
      ] = await Promise.all([
        one(sql`SELECT count(*) c FROM users`),
        one(sql`SELECT count(DISTINCT user_id) c FROM user_consents WHERE accepted_at > now() - interval '7 days'`),
        one(sql`SELECT count(DISTINCT user_id) c FROM user_consents WHERE accepted_at > now() - interval '30 days'`),
        one(sql`SELECT count(*) c FROM communities WHERE merged_into IS NULL`),
        one(sql`SELECT count(*) c FROM proposals WHERE status <> 'draft'`),
        one(sql`SELECT count(*) c FROM proposals WHERE track = 'vote' AND status <> 'draft'`),
        one(sql`SELECT count(*) c FROM proposals WHERE status = 'decided'`),
        one(sql`SELECT count(*) c FROM proposals WHERE status = 'voting'`),
        one(sql`SELECT count(*) c FROM proposal_votes WHERE superseded_by_id IS NULL AND erased_at IS NULL`),
        one(sql`SELECT count(*) c FROM proposal_amendments WHERE type <> 'sortition_revision'`),
        one(sql`SELECT count(*) c FROM proposal_amendments WHERE author_decision = 'accepted'`),
        one(sql`SELECT count(*) c FROM proposal_amendments WHERE author_decision = 'rejected'`),
        one(sql`SELECT (SELECT count(*) FROM debate_threads) + (SELECT count(*) FROM debate_arguments) c`),
        one(sql`SELECT count(*) c FROM survey_polls WHERE status IN ('live','closed')`),
        one(sql`SELECT count(*) c FROM survey_responses`),
        one(sql`SELECT count(*) c FROM livekit_rooms`),
      ]);

      const statusRows: any = await db.execute(
        sql`SELECT status, count(*) c FROM proposals WHERE status <> 'draft' GROUP BY status`,
      );
      const proposalsByStatus: Record<string, number> = {};
      for (const r of statusRows.rows ?? statusRows) proposalsByStatus[r.status] = Number(r.c);

      const reviewed = acceptedAmendments + rejectedAmendments;
      res.json({
        totalUsers, newUsers7, newUsers30,
        totalCommunities, totalProposals, directVoteProposals,
        decidedProposals, activeVotes, proposalsByStatus,
        totalBallots, totalAmendments,
        amendmentAcceptRate: reviewed > 0 ? acceptedAmendments / reviewed : null,
        totalDebate, totalSurveyPolls, totalSurveyResponses, conferences,
      });
    } catch (err: any) {
      console.error('analytics overview failed:', err?.message);
      res.status(500).json({ error: 'Failed to fetch analytics overview' });
    }
  });

  // Daily activity for the last 30 days: proposals entering deliberation,
  // amendments, ballots, debate posts.
  app.get('/api/analytics/activity-trends', async (_req, res) => {
    try {
      const daily = async (table: string, tsCol = 'created_at'): Promise<Map<string, number>> => {
        const r: any = await db.execute(sql.raw(
          `SELECT to_char(date(${tsCol}), 'YYYY-MM-DD') d, count(*) c
             FROM ${table}
            WHERE ${tsCol} > now() - interval '30 days'
            GROUP BY 1`,
        ));
        return new Map((r.rows ?? r).map((row: any) => [row.d, Number(row.c)]));
      };
      const [proposals, amendments, votes, threads, args_] = await Promise.all([
        daily('proposals'), daily('proposal_amendments'), daily('proposal_votes', 'cast_at'),
        daily('debate_threads'), daily('debate_arguments'),
      ]);

      const days: Array<{ date: string; proposals: number; amendments: number; votes: number; debate: number }> = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400_000).toISOString().slice(0, 10);
        days.push({
          date: d,
          proposals: proposals.get(d) ?? 0,
          amendments: amendments.get(d) ?? 0,
          votes: votes.get(d) ?? 0,
          debate: (threads.get(d) ?? 0) + (args_.get(d) ?? 0),
        });
      }
      res.json(days);
    } catch (err: any) {
      console.error('analytics trends failed:', err?.message);
      res.status(500).json({ error: 'Failed to fetch activity trends' });
    }
  });

  // Community leaderboard: public identity fields + aggregate counts only.
  app.get('/api/analytics/communities', async (_req, res) => {
    try {
      const r: any = await db.execute(sql`
        SELECT c.id, c.name, c.democracy_score,
               (SELECT count(*) FROM community_members m WHERE m.community_id = c.id) members,
               (SELECT count(*) FROM proposals p WHERE p.community_id = c.id AND p.status <> 'draft') proposals,
               (SELECT count(*) FROM proposals p WHERE p.community_id = c.id AND p.status = 'decided') decided
          FROM communities c
         WHERE c.merged_into IS NULL
         ORDER BY members DESC, proposals DESC
         LIMIT 20`);
      res.json((r.rows ?? r).map((row: any) => ({
        id: row.id,
        name: row.name,
        democracyScore: row.democracy_score != null ? Number(row.democracy_score) : null,
        members: Number(row.members),
        proposals: Number(row.proposals),
        decided: Number(row.decided),
      })));
    } catch (err: any) {
      console.error('analytics communities failed:', err?.message);
      res.status(500).json({ error: 'Failed to fetch community stats' });
    }
  });
}
