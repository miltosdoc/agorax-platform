/**
 * One-off smoke test for the ElectionGuard voting backend against the dev DB.
 * Run: npx tsx scripts/eg-smoke.ts   (cleans up after itself)
 */
import { ElectionGuardBackend } from '../server/voting/electionguard-backend';
import { db } from '../server/db';
import { egElections } from '@shared/schema';
import { eq } from 'drizzle-orm';

const PROPOSAL_ID = 1;

async function main() {
  const backend = new ElectionGuardBackend();
  let pass = true;
  const assert = (label: string, cond: boolean) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
    if (!cond) pass = false;
  };

  try {
    await backend.startElection({ proposalId: PROPOSAL_ID });
    await backend.castSignedBallot({ proposalId: PROPOSAL_ID, userId: 1, choice: 'yes' });
    await backend.castSignedBallot({ proposalId: PROPOSAL_ID, userId: 2, choice: 'yes' });
    await backend.castSignedBallot({ proposalId: PROPOSAL_ID, userId: 3, choice: 'no' });

    const t1 = await backend.getTally({ proposalId: PROPOSAL_ID });
    assert(`tally after 3 ballots = 2/1/0 (got ${t1.yes}/${t1.no}/${t1.abstain})`,
      t1.yes === 2 && t1.no === 1 && t1.abstain === 0 && t1.total === 3);

    // Re-vote: user 3 changes no -> abstain; supersedes the prior ballot.
    await backend.castSignedBallot({ proposalId: PROPOSAL_ID, userId: 3, choice: 'abstain' });
    const t2 = await backend.getTally({ proposalId: PROPOSAL_ID });
    assert(`tally after re-vote = 2/0/1 (got ${t2.yes}/${t2.no}/${t2.abstain})`,
      t2.yes === 2 && t2.no === 0 && t2.abstain === 1 && t2.total === 3);

    const closed = await backend.closeAndTally({ proposalId: PROPOSAL_ID });
    assert(`closeAndTally = 2/0/1 (got ${closed.yes}/${closed.no}/${closed.abstain})`,
      closed.yes === 2 && closed.no === 0 && closed.abstain === 1);
    assert('election record verifies', closed.proof.payload.recordVerified === true);

    const v = await backend.verify({ proposalId: PROPOSAL_ID });
    assert('verify() returns ok', v.ok === true);

    const proof = await backend.getProof({ proposalId: PROPOSAL_ID });
    assert('getProof reports closed', proof.payload.status === 'closed');
  } finally {
    // Clean up — cascades to eg_ballots and eg_election_records.
    await db.delete(egElections).where(eq(egElections.proposalId, PROPOSAL_ID));
    console.log('cleaned up eg_* rows for proposal', PROPOSAL_ID);
  }

  console.log(pass ? '\nSMOKE TEST PASSED' : '\nSMOKE TEST FAILED');
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke test error:', err);
  process.exit(1);
});
