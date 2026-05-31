/**
 * Voting Repository — Legacy Polls
 *
 * Handles voting operations: poll creation, survey polls, vote casting,
 * results calculation, and participant tracking.
 *
 * ⚠️  DEPRECATED FOR BINDING VOTES — see docs/compliance/DEPLOYMENT_HARDENING.md
 *
 * This module stores votes with user_id + option_id in cleartext.
 * The operator can see who voted for what — pseudonymous, not anonymous.
 *
 * For binding votes, use the blind-signature anonymous voting flow:
 *   /api/proposals/:id/blind-sign  →  /api/proposals/:id/anonymous-vote
 *
 * Legacy polls are retained for consultative purposes only (surveys,
 * preference gathering, non-binding opinions).
 */

import { db } from '../db';
import { polls, pollOptions, votes, pollQuestions, pollAnswers, pollUserResponses, 
         type Poll, type InsertPoll, type PollWithOptions, type Vote, type InsertVote, 
         type RankingVote, type PollWithQuestions, type PollUserResponse } from '../../shared/schema';
import { eq, and, desc, sql, inArray, count, asc } from 'drizzle-orm';

export class VotingRepository {

  /** Create a new poll with options. */
  async createPoll(poll: InsertPoll, options?: { text: string; order: number }[]): Promise<Poll> {
    const [createdPoll] = await db
      .insert(polls)
      .values(poll)
      .returning();
    
    if (options && options.length > 0) {
      await db
        .insert(pollOptions)
        .values(options.map(o => ({ ...o, pollId: createdPoll.id })));
    }
    
    return createdPoll;
  }

  /** Get all polls with optional filters. */
  async getPolls(filters?: { status?: string; communityId?: number }): Promise<Poll[]> {
    const conditions = [];
    if (filters?.status) {
// TODO: Add status filter when column exists
    }
    if (filters?.communityId) {
      conditions.push(eq(polls.communityId, filters.communityId));
    }
    
    return await db
      .select()
      .from(polls)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(polls.createdAt));
  }

  /** Get polls created by a user. */
  async getUserPolls(userId: number): Promise<Poll[]> {
    return await db
      .select()
      .from(polls)
      .where(eq(polls.creatorId, userId))
      .orderBy(desc(polls.createdAt));
  }

  /** Get polls a user has participated in. */
  async getParticipatedPolls(userId: number): Promise<Poll[]> {
    const participated = await db
      .select({ pollId: votes.pollId })
      .from(votes)
      .where(eq(votes.userId, userId));
    
    const pollIds = [...new Set(participated.map(p => p.pollId))];
    if (pollIds.length === 0) return [];
    
    return await db
      .select()
      .from(polls)
      .where(inArray(polls.id, pollIds))
      .orderBy(desc(polls.createdAt));
  }

  /** Get a single poll by ID. */
  async getPoll(id: number, userId?: number): Promise<Poll | undefined> {
    const [poll] = await db
      .select()
      .from(polls)
      .where(eq(polls.id, id));
    return poll;
  }

  /** Update a poll. */
  async updatePoll(id: number, updates: Partial<Poll>): Promise<Poll> {
    const [poll] = await db
      .update(polls)
      .set(updates)
      .where(eq(polls.id, id))
      .returning();
    if (!poll) throw new Error("Poll not found");
    return poll;
  }

  /** Extend poll duration. */
  async extendPollDuration(id: number, newEndDate: Date): Promise<Poll> {
    const [poll] = await db
      .update(polls)
      .set({ endDate: newEndDate })
      .where(eq(polls.id, id))
      .returning();
    if (!poll) throw new Error("Poll not found");
    return poll;
  }

  /** Delete a poll. */
  async deletePoll(id: number): Promise<boolean> {
    await db.delete(polls).where(eq(polls.id, id));
    return true;
  }

  /** Create a survey poll with questions. */
  async createSurveyPoll(poll: InsertPoll, questions: any[]): Promise<Poll> {
    const [createdPoll] = await db
      .insert(polls)
      .values({ ...poll, type: 'survey' } as any)
      .returning();
    
    if (questions && questions.length > 0) {
      await db
        .insert(pollQuestions)
        .values(questions.map(q => ({ ...q, pollId: createdPoll.id })));
    }
    
    return createdPoll;
  }

  /** Get a survey poll with questions. */
  async getSurveyPoll(id: number, userId?: number): Promise<Poll | undefined> {
    const [poll] = await db
      .select()
      .from(polls)
      .where(eq(polls.id, id));
    return poll;
  }

  /** Update survey structure (questions/answers). */
  async updateSurveyStructure(id: number, updates: Partial<Poll>, questions: any[]): Promise<Poll> {
    const [poll] = await db
      .update(polls)
      .set(updates)
      .where(eq(polls.id, id))
      .returning();
    if (!poll) throw new Error("Poll not found");
    return poll;
  }

  /** Update survey metadata. */
  async updateSurveyMetadata(id: number, updates: Partial<Poll>): Promise<Poll> {
    return this.updatePoll(id, updates);
  }

  /** Create survey responses. */
  async createSurveyResponse(responses: any[]): Promise<any[]> {
    await db
      .insert(pollUserResponses)
      .values(responses);
    return responses;
  }

  /** Get survey results. */
  async getSurveyResults(pollId: number): Promise<any> {
    // TODO: Implement survey results aggregation
    return { pollId, responses: [] };
  }

  /** Check if user has responded to a survey. */
  async hasUserRespondedToSurvey(pollId: number, userId: number): Promise<boolean> {
    const [response] = await db
      .select()
      .from(pollUserResponses)
      .where(and(
        eq(pollUserResponses.pollId, pollId),
        eq(pollUserResponses.userId, userId)
      ));
    return !!response;
  }

  /** Check if poll has any responses. */
  async hasAnyResponses(pollId: number): Promise<boolean> {
    const [result] = await db
      .select({ count: count() })
      .from(pollUserResponses)
      .where(eq(pollUserResponses.pollId, pollId));
    return (result?.count || 0) > 0;
  }

  /** Create a vote. */
  async createVote(vote: InsertVote | RankingVote): Promise<Vote> {
    const [createdVote] = await db
      .insert(votes)
      .values(vote as any)
      .returning();
    return createdVote;
  }

  /** Check if user has voted in a poll. */
  async hasUserVoted(pollId: number, userId: number): Promise<boolean> {
    const [vote] = await db
      .select()
      .from(votes)
      .where(and(
        eq(votes.pollId, pollId),
        eq(votes.userId, userId)
      ));
    return !!vote;
  }

  /** Get poll participant count. */
  async getPollParticipantCount(pollId: number): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(votes)
      .where(eq(votes.pollId, pollId));
    return result?.count || 0;
  }

  /** Check if user can edit their vote. */
  async canEditVote(pollId: number, userId: number): Promise<boolean> {
    const poll = await this.getPoll(pollId);
    if (!poll) return false;
    
    // Can edit if poll is still active and user has voted
    const now = new Date();
    if (poll.endDate && now > poll.endDate) {
      return false;
    }
    
    return this.hasUserVoted(pollId, userId);
  }

  /** Get poll results. */
  async getPollResults(pollId: number): Promise<any[]> {
    const options = await db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.pollId, pollId))
      .orderBy(asc(pollOptions.order));
    
    const results = [];
    for (const option of options) {
      const [result] = await db
        .select({ count: count() })
        .from(votes)
        .where(and(
          eq(votes.pollId, pollId),
          eq(votes.optionId, option.id)
        ));
      
      results.push({
        optionId: option.id,
        text: option.text,
        voteCount: result?.count || 0
      });
    }
    
    return results;
  }

}

