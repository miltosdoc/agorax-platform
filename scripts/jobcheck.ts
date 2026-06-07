import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';
(async () => {
  console.log('=== sortition_bodies for community 10 ===');
  const b = await db.execute(sql`
    SELECT id, proposal_id, status, size, purpose, selected_at, completed_at
    FROM sortition_bodies WHERE community_id = 10 ORDER BY id DESC
  `);
  for (const row of b.rows) console.log(row);
  process.exit(0);
})();
