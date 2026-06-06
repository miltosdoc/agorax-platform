import 'dotenv/config';
import { db } from '../server/db';
import { sortitionNotifications } from '../shared/schema';
import { desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

async function main(): Promise<void> {
  console.log('=== Node process ===');
  console.log('Date.now() ISO :', new Date().toISOString());
  console.log('Local time     :', new Date().toString());
  console.log('TZ env         :', process.env.TZ ?? '(unset)');
  console.log();

  console.log('=== Postgres clock ===');
  const r1 = await db.execute(sql`
    SELECT
      now()                      AS now_ts_tz,
      now() AT TIME ZONE 'UTC'   AS now_utc,
      current_setting('TIMEZONE') AS db_tz
  `);
  console.log(r1.rows[0]);
  console.log();

  console.log('=== Latest 3 notifications (raw from DB) ===');
  const r2 = await db.execute(sql`
    SELECT id, type, title, created_at,
           created_at AT TIME ZONE 'UTC' AS created_at_utc
    FROM sortition_notifications
    ORDER BY id DESC LIMIT 3
  `);
  for (const row of r2.rows) {
    console.log(`#${row.id} type=${row.type}`);
    console.log(`  raw created_at:`, row.created_at);
    console.log(`  utc:           `, row.created_at_utc);
  }
  console.log();

  console.log('=== Same notifications via drizzle (what API returns) ===');
  const r3 = await db
    .select({ id: sortitionNotifications.id, createdAt: sortitionNotifications.createdAt })
    .from(sortitionNotifications)
    .orderBy(desc(sortitionNotifications.id))
    .limit(3);
  for (const n of r3) {
    console.log(`#${n.id} createdAt =`, n.createdAt, '| ISO:', n.createdAt?.toISOString?.());
  }
  process.exit(0);
}
void main().catch((e) => { console.error(e); process.exit(1); });
