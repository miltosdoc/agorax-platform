import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';
(async () => {
  console.log('=== latest jobs across all proposals ===');
  const j = await db.execute(sql`
    SELECT to_char(created_at,'HH24:MI:SS') as created, type, status, error,
           (payload->'data'->>'proposalId')::int as proposal_id,
           payload->'data'->>'purpose' as purpose
    FROM jobs ORDER BY created_at DESC LIMIT 12
  `);
  console.table(j.rows);
  process.exit(0);
})();
