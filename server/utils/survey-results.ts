/**
 * Survey results — raw + weighted marginals, computed together, stored
 * together. No weighted number ever ships without raw, n, effective n and
 * design effect alongside it (transparency is the brand).
 *
 * Cohort discipline: 'published' results draw ONLY from organic+paid
 * panelists (PUBLISHABLE_CHANNELS) — partner-recruited cohorts are usable
 * solely in private client products ('all' cohort, never rendered as a
 * finding).
 *
 * Quality discipline: only completed responses with quality_passed=true
 * enter any marginal; the number excluded is reported in the methodology
 * block, never hidden.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db, voteDb } from '../db';
import {
  surveyPolls, surveyItems, surveyResponses, surveyItemAnswers,
  panelists, panelProfiles,
  type SurveyPoll, type SurveyItem,
} from '@shared/schema';
import { PUBLISHABLE_CHANNELS, MIN_WEIGHTED_N } from '@shared/polling';
import { surveyResults } from '@shared/schema';
import { computeWeights, type RespondentStrata } from '../stats/raking';
import { DEFAULT_RAKING_VARS } from '../stats/population-margins';

export interface ItemMarginal {
  itemId: number;
  text: string;
  itemType: string;
  isModuleItem: boolean;
  options: string[] | null;
  /** Respondents who answered this item (module items: assigned subset only). */
  answered: number;
  /** Raw counts per canonical option index (multi_choice: selection counts). */
  counts: number[] | null;
  /** Raw shares (counts/answered). */
  shares: number[] | null;
  /** Weighted shares — null when below MIN_WEIGHTED_N. */
  weightedShares: number[] | null;
  /** open_text: number of non-empty texts (texts themselves not aggregated). */
  openTextCount?: number;
}

export interface ComputedResults {
  pollId: number;
  cohort: 'published' | 'all';
  completes: number;
  qualityExcluded: number;
  marginals: ItemMarginal[];
  weighting: {
    applied: boolean;
    effectiveN: number | null;
    designEffect: number | null;
    variablesUsed: string[];
    variablesDropped: string[];
    trimmedCount: number;
    engine: string | null;
    reason?: string;
  };
}

export async function computeResults(
  poll: SurveyPoll,
  cohort: 'published' | 'all' = 'published',
): Promise<ComputedResults> {
  // ── Respondent set: completed, quality-passed, cohort-filtered ──
  const respondentRows = await voteDb
    .select({
      responseId: surveyResponses.id,
      panelistId: surveyResponses.panelistId,
      qualityPassed: surveyResponses.qualityPassed,
      sourceChannel: panelists.sourceChannel,
      profile: panelProfiles,
    })
    .from(surveyResponses)
    .innerJoin(panelists, eq(surveyResponses.panelistId, panelists.id))
    .leftJoin(panelProfiles, eq(panelProfiles.panelistId, panelists.id))
    .where(and(eq(surveyResponses.pollId, poll.id), eq(surveyResponses.status, 'completed')));

  const cohortRows = respondentRows.filter((r) =>
    cohort === 'all' ? true : PUBLISHABLE_CHANNELS.includes(r.sourceChannel as any),
  );
  const qualityRows = cohortRows.filter((r) => r.qualityPassed === true);
  const qualityExcluded = cohortRows.length - qualityRows.length;
  const completes = qualityRows.length;

  // ── Weights (raking on profile strata) ──
  let weights = new Map<number, number>(); // responseId → weight
  let weighting: ComputedResults['weighting'] = {
    applied: false, effectiveN: null, designEffect: null,
    variablesUsed: [], variablesDropped: [...DEFAULT_RAKING_VARS],
    trimmedCount: 0, engine: null,
    reason: completes < MIN_WEIGHTED_N
      ? `below MIN_WEIGHTED_N (${completes} < ${MIN_WEIGHTED_N})`
      : undefined,
  };

  if (completes >= MIN_WEIGHTED_N) {
    const strata: RespondentStrata[] = qualityRows
      .filter((r) => r.profile)
      .map((r) => ({
        key: r.responseId,
        strata: {
          ageBand: r.profile!.ageBand,
          gender: r.profile!.gender,
          region: r.profile!.region,
          education: r.profile!.education,
          urbanity: r.profile!.urbanity,
          pastVote2023: r.profile!.pastVote2023,
        },
      }));
    const raked = await computeWeights(strata);
    weights = raked.weights;
    weighting = {
      applied: true,
      effectiveN: Math.round(raked.effectiveN * 10) / 10,
      designEffect: Math.round(raked.designEffect * 100) / 100,
      variablesUsed: raked.variablesUsed,
      variablesDropped: raked.variablesDropped,
      trimmedCount: raked.trimmedCount,
      engine: raked.engine,
    };
  }

  // ── Marginals per item ──
  const items: SurveyItem[] = await db
    .select()
    .from(surveyItems)
    .where(eq(surveyItems.pollId, poll.id));
  items.sort((a, b) => a.position - b.position);

  const responseIds = qualityRows.map((r) => r.responseId);
  const answers = responseIds.length > 0
    ? await voteDb
        .select()
        .from(surveyItemAnswers)
        .where(inArray(surveyItemAnswers.responseId, responseIds))
    : [];

  const answersByItem = new Map<number, typeof answers>();
  for (const a of answers) {
    const list = answersByItem.get(a.itemId) ?? [];
    list.push(a);
    answersByItem.set(a.itemId, list);
  }

  const marginals: ItemMarginal[] = items.map((item) => {
    const itemAnswers = answersByItem.get(item.id) ?? [];
    const options = (item.options as string[] | null) ?? null;
    const base: ItemMarginal = {
      itemId: item.id,
      text: item.text,
      itemType: item.itemType,
      isModuleItem: item.isModuleItem,
      options,
      answered: itemAnswers.length,
      counts: null,
      shares: null,
      weightedShares: null,
    };

    if (item.itemType === 'open_text') {
      base.openTextCount = itemAnswers.filter((a) => typeof a.value === 'string' && (a.value as string).trim().length > 0).length;
      return base;
    }
    if (!options) return base;

    const counts = options.map(() => 0);
    const wsums = options.map(() => 0);
    let wTotal = 0;
    for (const a of itemAnswers) {
      const w = weights.get(a.responseId) ?? 1;
      const v = a.value as unknown;
      if (typeof v === 'number' && v >= 0 && v < options.length) {
        counts[v]++;
        wsums[v] += w;
        wTotal += w;
      } else if (Array.isArray(v)) {
        for (const idx of v) {
          if (typeof idx === 'number' && idx >= 0 && idx < options.length) {
            counts[idx]++;
            wsums[idx] += w;
          }
        }
        wTotal += w; // multi_choice shares are per-respondent
      }
    }
    base.counts = counts;
    base.shares = itemAnswers.length > 0 ? counts.map((c) => c / itemAnswers.length) : null;
    base.weightedShares = weighting.applied && wTotal > 0 ? wsums.map((s) => s / wTotal) : null;
    return base;
  });

  return { pollId: poll.id, cohort, completes, qualityExcluded, marginals, weighting };
}

/** Compute, persist (upsert per cohort), and return results for a poll. */
export async function computeAndStoreResults(
  poll: SurveyPoll,
  cohort: 'published' | 'all' = 'published',
): Promise<ComputedResults> {
  const results = await computeResults(poll, cohort);
  await db.insert(surveyResults).values({
    pollId: poll.id,
    cohort,
    completes: results.completes,
    raw: results.marginals,
    weighted: results.weighting.applied ? results.marginals.map((m) => ({ itemId: m.itemId, weightedShares: m.weightedShares })) : null,
    effectiveN: results.weighting.effectiveN?.toString() ?? null,
    designEffect: results.weighting.designEffect?.toString() ?? null,
    weightingVars: results.weighting.variablesUsed,
    weightSummary: { trimmedCount: results.weighting.trimmedCount, engine: results.weighting.engine, qualityExcluded: results.qualityExcluded },
  }).onConflictDoUpdate({
    target: [surveyResults.pollId, surveyResults.cohort],
    set: {
      completes: results.completes,
      raw: results.marginals,
      weighted: results.weighting.applied ? results.marginals.map((m) => ({ itemId: m.itemId, weightedShares: m.weightedShares })) : null,
      effectiveN: results.weighting.effectiveN?.toString() ?? null,
      designEffect: results.weighting.designEffect?.toString() ?? null,
      weightingVars: results.weighting.variablesUsed,
      weightSummary: { trimmedCount: results.weighting.trimmedCount, engine: results.weighting.engine, qualityExcluded: results.qualityExcluded },
      computedAt: new Date(),
    },
  });
  return results;
}

/**
 * The auto-generated methodology block, frozen onto the poll row at close.
 * Everything a reader needs to judge the number: n, field dates, wording,
 * weighting variables, effective n, design effect, quality exclusions,
 * compiler provenance.
 */
export function buildMethodology(poll: SurveyPoll, results: ComputedResults) {
  return {
    tier: poll.tier,
    n: results.completes,
    qualityExcluded: results.qualityExcluded,
    fieldStart: poll.opensAt,
    fieldEnd: new Date(),
    cohort: results.cohort,
    cohortNote: results.cohort === 'published'
      ? 'Μόνο μέλη πάνελ με οργανική ή διαφημιστική προέλευση (organic+paid).'
      : 'Όλες οι κοόρτες — μη δημοσιεύσιμο.',
    weighting: results.weighting.applied
      ? {
          method: 'raking (iterative proportional fitting)',
          variables: results.weighting.variablesUsed,
          variablesDropped: results.weighting.variablesDropped,
          effectiveN: results.weighting.effectiveN,
          designEffect: results.weighting.designEffect,
          weightsTrimmed: results.weighting.trimmedCount,
          engine: results.weighting.engine,
          marginsSource: 'ELSTAT Census 2021 (προσεγγιστικά περιθώρια — βλ. server/stats/population-margins.ts)',
        }
      : { method: 'none', reason: results.weighting.reason ?? 'below minimum n' },
    questionWording: results.marginals.map((m) => ({
      itemId: m.itemId,
      text: m.text,
      itemType: m.itemType,
      options: m.options,
      isModuleItem: m.isModuleItem,
    })),
    compiler: poll.compilerMeta ?? null,
    gatekeeper: poll.gatekeeperVerdict ?? null,
    disclosure: 'Κάθε δημοσκόπηση περιλαμβάνει 2–3 πάγιες ερωτήσεις πλατφόρμας στην αρχή του ερωτηματολογίου (piggyback module), με σταθερή εσωτερική σειρά, πριν εμφανιστεί το θέμα της δημοσκόπησης.',
    generatedAt: new Date(),
  };
}
