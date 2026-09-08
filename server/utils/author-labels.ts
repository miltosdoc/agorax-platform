/**
 * Attach the author's public label to anything that carries an authorId.
 *
 * Several surfaces built their own author identity, or none at all: the
 * proposal list sent nothing, the amendment list sent nothing, deliberation
 * threads sent nothing, and the amendment comments joined the users table
 * themselves. So the same member read as their name in one panel and
 * "Χρήστης #6" in the panel beside it, on the same page.
 *
 * One batched query per call, and one place to change when the label changes.
 * A missing row means a deleted account, whose arguments stay on the record —
 * callers render the numeric fallback for those.
 */

import { db } from '../db';
import { users } from '@shared/schema';
import { inArray } from 'drizzle-orm';

export interface AuthorLabel {
  authorName: string | null;
  authorUsername: string | null;
}

/** Look up labels for a set of user ids. */
export async function authorLabelsFor(ids: number[]): Promise<Map<number, AuthorLabel>> {
  const unique = [...new Set(ids.filter((id) => typeof id === 'number' && Number.isFinite(id)))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, name: users.name, username: users.username })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, { authorName: r.name ?? null, authorUsername: r.username ?? null }]));
}

/** Attach labels to a flat list. */
export async function withAuthorLabels<T extends { authorId: number }>(rows: T[]): Promise<(T & AuthorLabel)[]> {
  if (rows.length === 0) return [];
  const labels = await authorLabelsFor(rows.map((r) => r.authorId));
  return rows.map((r) => ({
    ...r,
    ...(labels.get(r.authorId) ?? { authorName: null, authorUsername: null }),
  }));
}

/**
 * Attach labels through a tree, in one query for the whole tree.
 *
 * Deliberation threads nest, and a reply's author is as worth naming as the
 * thread's — walking the tree per node would turn one debate into dozens of
 * queries.
 */
export async function withAuthorLabelsDeep<T extends { authorId: number; replies?: T[] }>(
  nodes: T[],
  childKey: keyof T = 'replies' as keyof T,
): Promise<T[]> {
  if (nodes.length === 0) return [];
  const ids: number[] = [];
  const collect = (list: any[]) => {
    for (const n of list) {
      ids.push(n.authorId);
      const kids = n[childKey];
      if (Array.isArray(kids)) collect(kids);
    }
  };
  collect(nodes);

  const labels = await authorLabelsFor(ids);
  const apply = (list: any[]): any[] => list.map((n) => {
    const kids = n[childKey];
    return {
      ...n,
      ...(labels.get(n.authorId) ?? { authorName: null, authorUsername: null }),
      ...(Array.isArray(kids) ? { [childKey]: apply(kids) } : {}),
    };
  });
  return apply(nodes);
}
