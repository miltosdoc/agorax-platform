/**
 * Amendment Merger
 *
 * Detects overlap between amendments targeting the same proposal so the
 * author can review groups of duplicates instead of identical text twice.
 * Pure similarity helpers live in `amendment-similarity.ts`; this module
 * glues them to the database.
 *
 * (Merging accepted amendments into the final text lives in `ai-merger.ts`;
 * the legacy string-concatenation merge that used to live here is gone.)
 */

import { db } from '../db';
import { proposalAmendments } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  groupDuplicates,
  type DuplicateGroup,
} from './amendment-similarity';

export type { DuplicateGroup } from './amendment-similarity';
export { DEFAULT_SIMILARITY_THRESHOLD } from './amendment-similarity';

/**
 * Find groups of amendments on the same proposal whose normalized word sets
 * exceed the similarity threshold. Used to flag duplicates for the author
 * before they review each amendment one by one.
 */
export async function findDuplicateAmendments(
  proposalId: number,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): Promise<DuplicateGroup[]> {
  const amendments = await db.query.proposalAmendments.findMany({
    where: eq(proposalAmendments.proposalId, proposalId),
  });

  return groupDuplicates(
    amendments.map(a => ({ id: a.id, type: a.type, text: a.text })),
    threshold,
  );
}
