import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// ─── Vote-path connection (B3: DB-grant enforcement) ────────────────────────
//
// The anonymous vote path runs under a dedicated DB role (agorax_vote) that
// physically cannot read identity tables. Separation enforced by PostgreSQL,
// not code convention. See docs/compliance/COMPLIANCE_STATUS.md §B3.
//
// VOTE_DATABASE_URL should use the agorax_vote role:
//   postgresql://agorax_vote@db:5432/agorax
//
// Falls back to the main pool if not configured (backward compat for
// deployments that haven't applied the grants yet).

let votePool: Pool | null = null;
let configuredVoteDb: ReturnType<typeof drizzle> | null = null;

if (process.env.VOTE_DATABASE_URL) {
  votePool = new Pool({ connectionString: process.env.VOTE_DATABASE_URL });
  configuredVoteDb = drizzle(votePool, { schema });
}

export const votePoolConn = votePool ?? pool;
export const voteDb = configuredVoteDb ?? db;
