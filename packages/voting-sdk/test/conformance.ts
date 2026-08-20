/**
 * Conformance test-vector harness.
 *
 * Loads JSON vector files from `test/vectors/` and exposes them to the test
 * suite. Vectors are grouped by a `type` tag so each protocol element can
 * own its own vector files: Phase 0 ships `group-parameters`; later phases
 * drop in published ElectionGuard 2.1 vectors for `elgamal`,
 * `chaum-pedersen`, `disjunctive-proof`, `tally`, `decryption`, etc.
 *
 * The harness only loads and shapes data — each test file decides how to
 * assert against it. Keeping that split means new vectors never require
 * harness changes.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VECTORS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'vectors');

/** A single conformance vector file. */
export interface ConformanceVectorFile<TCase = unknown> {
  /** Category tag — selects which protocol element the vectors exercise. */
  type: string;
  /** Human-readable summary of what the file covers. */
  description: string;
  /** Where the expected values come from (spec section, reference impl). */
  source: string;
  /** The individual cases; shape is defined per `type` by its test file. */
  cases: TCase[];
}

/** Load one vector file by name (e.g. `group-parameters.json`). */
export function loadVectorFile<TCase = unknown>(
  filename: string,
): ConformanceVectorFile<TCase> {
  const raw = readFileSync(join(VECTORS_DIR, filename), 'utf8');
  const parsed = JSON.parse(raw) as ConformanceVectorFile<TCase>;
  if (typeof parsed.type !== 'string' || !Array.isArray(parsed.cases)) {
    throw new Error(`malformed conformance vector file: ${filename}`);
  }
  return parsed;
}

/** Load every vector file carrying the given `type` tag. */
export function loadVectorsByType<TCase = unknown>(
  type: string,
): ConformanceVectorFile<TCase>[] {
  return readdirSync(VECTORS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => loadVectorFile<TCase>(f))
    .filter((v) => v.type === type);
}
