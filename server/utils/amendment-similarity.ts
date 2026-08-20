/**
 * Pure text-similarity helpers for amendment dedup.
 *
 * Lives in its own module so it can be imported from test files without
 * pulling in the database connection that `amendment-merger.ts` requires.
 *
 * Duplicate detection uses TF-IDF + cosine similarity. Smoothed IDF
 * (`log((N+1)/(df+1)) + 1`) keeps shared terms from being zeroed out on
 * tiny corpora — paraphrases that share most of their vocabulary still
 * score well above the threshold. Jaccard is kept as a low-level helper
 * for callers that want a corpus-free pairwise score.
 */

export const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

/**
 * Lowercase, strip diacritics + punctuation, split on whitespace, drop
 * single-letter tokens. Shared by every similarity measure here so the
 * tokenization stays identical across helpers.
 */
export function normalizeForSimilarity(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1);
}

/**
 * Pairwise Jaccard similarity on two token lists. Kept exported because
 * tests and ad-hoc callers use it as a corpus-free baseline.
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Build a TF-IDF matrix from a list of raw amendment texts.
 *
 * Returns one vector per input text, indexed over the corpus-wide
 * vocabulary (in insertion order). IDF is smoothed sklearn-style —
 * `log((N+1)/(df+1)) + 1` — so terms that appear in every document still
 * carry positive weight. Without smoothing, a 2-doc corpus where both
 * docs share most tokens would zero out the shared terms and collapse
 * cosine similarity to 0, defeating the dedup pass.
 *
 * Term frequency is raw count (not normalized) — cosine similarity
 * normalizes by vector length anyway, so the extra scaling is redundant.
 */
export function computeTFIDF(texts: string[]): number[][] {
  if (texts.length === 0) return [];

  const tokenized = texts.map(normalizeForSimilarity);

  const vocabulary = new Map<string, number>();
  for (const tokens of tokenized) {
    for (const token of tokens) {
      if (!vocabulary.has(token)) {
        vocabulary.set(token, vocabulary.size);
      }
    }
  }

  const vocabSize = vocabulary.size;
  if (vocabSize === 0) {
    return texts.map(() => []);
  }

  const docFreq = new Array<number>(vocabSize).fill(0);
  const termFreqs: number[][] = tokenized.map(tokens => {
    const tf = new Array<number>(vocabSize).fill(0);
    const seen = new Set<number>();
    for (const token of tokens) {
      const idx = vocabulary.get(token)!;
      tf[idx] += 1;
      seen.add(idx);
    }
    for (const idx of seen) {
      docFreq[idx] += 1;
    }
    return tf;
  });

  const N = texts.length;
  const idf = docFreq.map(df => Math.log((N + 1) / (df + 1)) + 1);

  return termFreqs.map(tf => tf.map((count, idx) => count * idf[idx]));
}

/**
 * Standard cosine similarity on two equal-length numeric vectors.
 * Returns 0 when either vector has zero magnitude.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: vector length mismatch (${a.length} vs ${b.length})`);
  }
  if (a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface SimilarityCandidate {
  id: number;
  type: string;
  text: string;
}

export interface DuplicateGroup {
  representativeId: number;
  amendmentIds: number[];
  similarity: number;
  type: string;
}

/**
 * Group candidates whose TF-IDF cosine similarity exceeds the threshold.
 * Only candidates of the same `type` are compared — an `improvement` and
 * a `counter_proposal` saying similar things are not redundant.
 *
 * The TF-IDF matrix is computed once over the full candidate list so all
 * pairs share the same IDF weighting. Candidates with empty token sets
 * (e.g. punctuation-only text) are never grouped.
 */
export function groupDuplicates(
  candidates: SimilarityCandidate[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): DuplicateGroup[] {
  if (candidates.length < 2) return [];

  const vectors = computeTFIDF(candidates.map(c => c.text));

  const groupedById = new Set<number>();
  const groups: DuplicateGroup[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    if (groupedById.has(candidates[i].id)) continue;
    if (vectors[i].length === 0) continue;

    const group: DuplicateGroup = {
      representativeId: candidates[i].id,
      amendmentIds: [candidates[i].id],
      similarity: 1,
      type: candidates[i].type,
    };

    let minSimilarity = 1;

    for (let j = i + 1; j < candidates.length; j += 1) {
      if (groupedById.has(candidates[j].id)) continue;
      if (candidates[j].type !== candidates[i].type) continue;
      if (vectors[j].length === 0) continue;

      const sim = cosineSimilarity(vectors[i], vectors[j]);
      if (sim >= threshold) {
        group.amendmentIds.push(candidates[j].id);
        groupedById.add(candidates[j].id);
        if (sim < minSimilarity) minSimilarity = sim;
      }
    }

    if (group.amendmentIds.length > 1) {
      group.similarity = minSimilarity;
      groupedById.add(group.representativeId);
      groups.push(group);
    }
  }

  return groups;
}
