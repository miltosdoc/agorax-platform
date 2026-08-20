/**
 * Democracy Score Calculator
 * 
 * Measures how democratic a community's governance is on a 0-100 scale.
 * 
 * Higher score = more democratic (horizontal governance, minimal admin intervention)
 * Lower score = more centralized (admin-heavy, opaque decision-making)
 * 
 * The score is calculated from multiple factors, each weighted differently.
 * It's a reputational mechanism — not a hard limit, but an early warning system.
 * 
 * Factors considered:
 * 1. Admin action frequency (negative weight)
 * 2. Sortition usage (positive weight)
 * 3. Member participation rate (positive weight)
 * 4. Transparency of decisions (positive weight)
 * 5. Proposal success rate (positive weight)
 * 6. Amendment adoption rate (positive weight)
 */

import type { IStorage } from '../storage';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DemocracyScoreResult {
  /** Overall score (0-100) */
  score: number;
  
  /** Breakdown by factor */
  factors: {
    adminIntervention: number;    // 0-20 (lower is better)
    sortitionUsage: number;       // 0-20 (higher is better)
    participation: number;        // 0-20 (higher is better)
    transparency: number;         // 0-20 (higher is better)
    deliberation: number;         // 0-20 (higher is better)
  };
  
  /** Human-readable recommendations for improvement */
  recommendations: string[];
  
  /** Timestamp of calculation */
  calculatedAt: Date;
}

// ─── Factor Calculations ────────────────────────────────────────────────────

/**
 * Admin Intervention Factor (0-20)
 * 
 * Measures how much admins intervene in community governance.
 * Lower intervention = higher score.
 * 
 * Factors that reduce the score:
 * - Admin overriding sortition timeouts
 * - Admin blocking proposals
 * - Admin banning members without community vote
 * - Admin having weighted votes
 * - Admin deleting content without public reason
 * 
 * Factors that preserve/increase the score:
 * - Admin actions logged and visible to all members
 * - Admin decisions subject to community appeal
 * - Sortition panels making decisions, not admins
 * - Transparent moderation with stated reasons
 */
async function calculateAdminIntervention(
  communityId: number,
  storage: IStorage,
): Promise<number> {
  // Start with maximum score
  let score = 20;
  
  // Get community members to count admins
  const members = await storage.getCommunityMembers(communityId);
  const adminCount = members.filter(m => m.role === 'admin' || m.role === 'founder').length;
  const totalMembers = members.length;
  
  if (totalMembers === 0) return 20; // No members = no admin actions
  
  // Penalize high admin-to-member ratio
  const adminRatio = adminCount / totalMembers;
  if (adminRatio > 0.3) { // More than 30% admins
    score -= 10;
  } else if (adminRatio > 0.1) { // More than 10% admins
    score -= 5;
  }
  
  // TODO: Track admin actions in a separate table and penalize based on frequency
  // For now, we only consider the admin ratio
  
  return Math.max(0, Math.min(20, score));
}

/**
 * Sortition Usage Factor (0-20)
 * 
 * Measures how often the community uses sortition for decision-making.
 * More sortition usage = higher score.
 * 
 * Sortition is a key mechanism for horizontal governance — it ensures
 * that deliberative power is distributed randomly, not concentrated.
 */
async function calculateSortitionUsage(
  communityId: number,
  storage: IStorage,
): Promise<number> {
  // TODO: Query sortition bodies for this community and calculate usage rate
  // For now, return a baseline score
  return 10; // Neutral baseline until we have sortition data
}

/**
 * Participation Factor (0-20)
 * 
 * Measures how actively community members participate in governance.
 * Higher participation = higher score.
 * 
 * Factors considered:
 * - Percentage of members who have submitted proposals
 * - Percentage of members who have voted in proposals
 * - Percentage of members who have added debate arguments
 */
async function calculateParticipation(
  communityId: number,
  storage: IStorage,
): Promise<number> {
  const members = await storage.getCommunityMembers(communityId);
  const proposals = await storage.getProposals(communityId);
  
  if (members.length === 0) return 0;
  if (proposals.length === 0) return 5; // No proposals yet, neutral
  
  // Calculate unique authors
  const uniqueAuthors = new Set(proposals.map(p => p.authorId));
  const authorRate = uniqueAuthors.size / members.length;
  
  // Score based on author participation rate
  let score = 0;
  if (authorRate > 0.5) score = 20;      // 50%+ members have authored
  else if (authorRate > 0.3) score = 15;  // 30%+ members have authored
  else if (authorRate > 0.1) score = 10;  // 10%+ members have authored
  else if (authorRate > 0.05) score = 5;  // 5%+ members have authored
  else score = 2;                          // Very low participation
  
  return Math.max(0, Math.min(20, score));
}

/**
 * Transparency Factor (0-20)
 * 
 * Measures how transparent the community's decision-making is.
 * Higher transparency = higher score.
 * 
 * Factors considered:
 * - Are admin actions logged and visible?
 * - Are proposal decisions public?
 * - Is the sortition selection process transparent?
 */
async function calculateTransparency(
  communityId: number,
  storage: IStorage,
): Promise<number> {
  // TODO: Implement transparency tracking
  // For now, return a baseline score
  return 15; // Assume basic transparency is in place
}

/**
 * Deliberation Factor (0-20)
 * 
 * Measures how thoroughly proposals are deliberated before voting.
 * More deliberation = higher score.
 * 
 * Factors considered:
 * - Average number of amendments per proposal
 * - Average number of debate arguments per proposal
 * - Time spent in deliberation phase
 */
async function calculateDeliberation(
  communityId: number,
  storage: IStorage,
): Promise<number> {
  const proposals = await storage.getProposals(communityId);
  
  if (proposals.length === 0) return 10; // No proposals yet, neutral
  
  let totalAmendments = 0;
  let totalArguments = 0;
  let deliberatedCount = 0;
  
  for (const proposal of proposals) {
    const amendments = await storage.getAmendments(proposal.id);
    const arguments_ = await storage.getDebateArguments(proposal.id);
    
    totalAmendments += amendments.length;
    totalArguments += arguments_.length;
    
    if (proposal.status === 'deliberation' || proposal.status === 'voting' || proposal.status === 'decided') {
      deliberatedCount++;
    }
  }
  
  const avgAmendments = totalAmendments / proposals.length;
  const avgArguments = totalArguments / proposals.length;
  const deliberationRate = deliberatedCount / proposals.length;
  
  let score = 0;
  
  // Score based on amendment activity
  if (avgAmendments > 3) score += 5;
  else if (avgAmendments > 1) score += 3;
  else if (avgAmendments > 0) score += 1;
  
  // Score based on debate activity
  if (avgArguments > 5) score += 5;
  else if (avgArguments > 3) score += 3;
  else if (avgArguments > 1) score += 1;
  
  // Score based on deliberation rate
  if (deliberationRate > 0.8) score += 10;
  else if (deliberationRate > 0.5) score += 7;
  else if (deliberationRate > 0.2) score += 4;
  else score += 2;
  
  return Math.max(0, Math.min(20, score));
}

// ─── Main Calculator ────────────────────────────────────────────────────────

/**
 * Calculate the democracy score for a community.
 * 
 * @param communityId - The community to evaluate
 * @param storage - Storage interface for database access
 * 
 * @returns DemocracyScoreResult with overall score, factor breakdown, and recommendations
 */
export async function calculateDemocracyScore(
  communityId: number,
  storage: IStorage,
): Promise<DemocracyScoreResult> {
  // Calculate each factor in parallel
  const [adminIntervention, sortitionUsage, participation, transparency, deliberation] = await Promise.all([
    calculateAdminIntervention(communityId, storage),
    calculateSortitionUsage(communityId, storage),
    calculateParticipation(communityId, storage),
    calculateTransparency(communityId, storage),
    calculateDeliberation(communityId, storage),
  ]);
  
  // Overall score is the sum of all factors (max 100)
  const score = adminIntervention + sortitionUsage + participation + transparency + deliberation;
  
  // Generate recommendations based on low-scoring factors
  const recommendations: string[] = [];
  
  if (adminIntervention < 10) {
    recommendations.push('Reduce admin-to-member ratio or document admin actions more transparently');
  }
  if (sortitionUsage < 10) {
    recommendations.push('Use sortition panels more frequently for proposal review');
  }
  if (participation < 10) {
    recommendations.push('Encourage more members to submit proposals and participate in deliberation');
  }
  if (transparency < 10) {
    recommendations.push('Improve transparency of admin actions and decision-making');
  }
  if (deliberation < 10) {
    recommendations.push('Encourage more amendments and debate arguments on proposals');
  }
  
  return {
    score,
    factors: {
      adminIntervention,
      sortitionUsage,
      participation,
      transparency,
      deliberation,
    },
    recommendations,
    calculatedAt: new Date(),
  };
}

/**
 * Get a human-readable grade for a democracy score.
 */
export function getDemocracyGrade(score: number): string {
  if (score >= 90) return 'Excellent — Highly democratic governance';
  if (score >= 80) return 'Very Good — Strong democratic practices';
  if (score >= 70) return 'Good — Democratic with room for improvement';
  if (score >= 60) return 'Fair — Some centralization of power';
  if (score >= 50) return 'Below Average — Significant admin control';
  if (score >= 40) return 'Poor — Highly centralized governance';
  return 'Critical — Authoritarian governance structure';
}
