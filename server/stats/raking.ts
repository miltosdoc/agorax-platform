/**
 * Raking (iterative proportional fitting) — the deterministic stats layer.
 *
 * In-process TypeScript implementation of post-stratification raking on
 * the panel profile strata, with the standard hygiene steps:
 *   - margins with no sample members are dropped and the remaining target
 *     mass renormalized (IPF cannot rake onto an empty cell);
 *   - converged weights are trimmed to [WEIGHT_MIN, WEIGHT_MAX] and
 *     re-normalized to mean 1 (variance control over purity);
 *   - effective sample size (Kish) and design effect always travel with
 *     the weights — no weighted number ships without them.
 *
 * MRP-ready by construction: the input shape is one row per respondent
 * with clean categorical strata; swapping this engine for a hierarchical
 * model changes computeWeights, not the callers.
 *
 * Hybrid architecture hook: when STATS_SIDECAR_URL is set, the same
 * payload is POSTed to `<url>/rake` (Python sidecar, see stats-sidecar/)
 * and its weights are used; any sidecar failure falls back to this
 * implementation. The result records which engine produced it.
 */
import { POPULATION_MARGINS, DEFAULT_RAKING_VARS, type Margin } from './population-margins';

export interface RespondentStrata {
  /** Caller-side key (e.g. panelistId) to map weights back. */
  key: number;
  /** variable → category, e.g. { ageBand: '35-44', gender: 'female', … } */
  strata: Record<string, string>;
}

export interface RakingResult {
  /** key → weight (mean 1 across respondents). */
  weights: Map<number, number>;
  n: number;
  effectiveN: number;
  designEffect: number;
  variablesUsed: string[];
  variablesDropped: string[];
  trimmedCount: number;
  iterations: number;
  converged: boolean;
  engine: 'ts-inprocess' | 'python-sidecar';
}

export const WEIGHT_MIN = 0.3;
export const WEIGHT_MAX = 3.0;
const MAX_ITER = 100;
const TOLERANCE = 1e-6;

function kish(weights: number[]): { effectiveN: number; designEffect: number } {
  const n = weights.length;
  if (n === 0) return { effectiveN: 0, designEffect: 1 };
  const sum = weights.reduce((a, b) => a + b, 0);
  const sumSq = weights.reduce((a, b) => a + b * b, 0);
  const effectiveN = (sum * sum) / sumSq;
  return { effectiveN, designEffect: n / effectiveN };
}

/**
 * Restrict a target margin to categories present in the sample and
 * renormalize. Returns null if fewer than 2 categories survive (a
 * one-category variable cannot be raked — it is dropped).
 */
function usableMargin(target: Margin, sampleCategories: Set<string>): Margin | null {
  const present: Margin = {};
  for (const [cat, share] of Object.entries(target)) {
    if (sampleCategories.has(cat)) present[cat] = share;
  }
  const cats = Object.keys(present);
  if (cats.length < 2) return null;
  const sum = cats.reduce((a, c) => a + present[c], 0);
  for (const c of cats) present[c] /= sum;
  return present;
}

function rakeInProcess(
  rows: RespondentStrata[],
  vars: string[],
  margins: Record<string, Margin>,
): Omit<RakingResult, 'engine'> {
  const n = rows.length;
  const variablesUsed: string[] = [];
  const variablesDropped: string[] = [];
  const activeMargins: Array<{ variable: string; margin: Margin }> = [];

  for (const variable of vars) {
    const target = margins[variable];
    if (!target) { variablesDropped.push(variable); continue; }
    const sampleCats = new Set(rows.map((r) => r.strata[variable]).filter(Boolean));
    const usable = usableMargin(target, sampleCats);
    if (!usable) { variablesDropped.push(variable); continue; }
    variablesUsed.push(variable);
    activeMargins.push({ variable, margin: usable });
  }

  let weights = rows.map(() => 1);
  let iterations = 0;
  let converged = activeMargins.length === 0; // nothing to rake = trivially done

  for (let iter = 0; iter < MAX_ITER && !converged; iter++) {
    iterations = iter + 1;
    let maxShift = 0;
    for (const { variable, margin } of activeMargins) {
      // Weighted share per category under current weights.
      const totals: Record<string, number> = {};
      let grand = 0;
      for (let i = 0; i < n; i++) {
        const cat = rows[i].strata[variable];
        if (cat in margin) {
          totals[cat] = (totals[cat] ?? 0) + weights[i];
          grand += weights[i];
        }
      }
      for (let i = 0; i < n; i++) {
        const cat = rows[i].strata[variable];
        if (cat in margin && totals[cat] > 0) {
          const factor = (margin[cat] * grand) / totals[cat];
          maxShift = Math.max(maxShift, Math.abs(factor - 1));
          weights[i] *= factor;
        }
      }
    }
    if (maxShift < TOLERANCE) converged = true;
  }

  // Trim, then renormalize to mean 1.
  let trimmedCount = 0;
  weights = weights.map((w) => {
    if (w < WEIGHT_MIN) { trimmedCount++; return WEIGHT_MIN; }
    if (w > WEIGHT_MAX) { trimmedCount++; return WEIGHT_MAX; }
    return w;
  });
  const mean = weights.reduce((a, b) => a + b, 0) / Math.max(1, n);
  weights = weights.map((w) => w / mean);

  const { effectiveN, designEffect } = kish(weights);
  const map = new Map<number, number>();
  rows.forEach((r, i) => map.set(r.key, weights[i]));

  return {
    weights: map, n, effectiveN, designEffect,
    variablesUsed, variablesDropped, trimmedCount, iterations, converged,
  };
}

async function rakeViaSidecar(
  rows: RespondentStrata[],
  vars: string[],
  margins: Record<string, Margin>,
): Promise<Omit<RakingResult, 'engine'> | null> {
  const base = process.env.STATS_SIDECAR_URL;
  if (!base) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(`${base.replace(/\/$/, '')}/rake`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: rows.map((r) => ({ key: r.key, strata: r.strata })),
        variables: vars,
        margins,
        weightMin: WEIGHT_MIN,
        weightMax: WEIGHT_MAX,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      weights: Record<string, number>;
      effectiveN: number; designEffect: number;
      variablesUsed: string[]; variablesDropped: string[];
      trimmedCount: number; iterations: number; converged: boolean;
    };
    const map = new Map<number, number>();
    for (const [k, w] of Object.entries(json.weights)) map.set(Number(k), w);
    if (map.size !== rows.length) return null;
    return {
      weights: map, n: rows.length,
      effectiveN: json.effectiveN, designEffect: json.designEffect,
      variablesUsed: json.variablesUsed, variablesDropped: json.variablesDropped,
      trimmedCount: json.trimmedCount, iterations: json.iterations, converged: json.converged,
    };
  } catch {
    return null;
  }
}

export interface RakeOptions {
  /** Include past-vote weighting (opt-in per analysis; recall-biased). */
  includePastVote?: boolean;
  margins?: Record<string, Margin>;
}

/** Rake a respondent set against the population margins. */
export async function computeWeights(
  rows: RespondentStrata[],
  opts: RakeOptions = {},
): Promise<RakingResult> {
  const vars = [...DEFAULT_RAKING_VARS, ...(opts.includePastVote ? ['pastVote2023'] : [])];
  const margins = opts.margins ?? POPULATION_MARGINS;

  const sidecar = await rakeViaSidecar(rows, vars, margins);
  if (sidecar) return { ...sidecar, engine: 'python-sidecar' };
  return { ...rakeInProcess(rows, vars, margins), engine: 'ts-inprocess' };
}
