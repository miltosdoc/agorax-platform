import 'dotenv/config';
import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { createNotification } from '../server/utils/notifications';

const TITLE = 'Αποδοχή τροπολογιών';
const MESSAGE =
  'Όσες τροπολογίες δεν αποδεχτείτε δεν μπαίνουν στο τελικό κείμενο. '
  + 'Κρίνετέ τες πριν λήξει η διαβούλευση.';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.accountStatus, 'active'));

  console.log(`${dryRun ? '[dry-run] ' : ''}${recipients.length} active recipients`);
  console.log(`title  (${TITLE.length} chars): ${TITLE}`);
  console.log(`message (${MESSAGE.length} chars): ${MESSAGE}`);
  if (MESSAGE.length > 110) {
    console.error('ABORT: message exceeds the 110-char clamp threshold.');
    process.exit(1);
  }
  if (dryRun) process.exit(0);

  let sent = 0;
  for (const user of recipients) {
    await createNotification({
      userId: user.id,
      type: 'amendment_ready',
      title: TITLE,
      message: MESSAGE,
      actionUrl: '/feed',
    });
    sent++;
  }
  console.log(`sent ${sent}/${recipients.length}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
