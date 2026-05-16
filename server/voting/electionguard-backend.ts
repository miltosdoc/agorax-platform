/**
 * ElectionGuardBackend — verifiable, encrypted ratification voting.
 *
 * Implements the VotingBackend interface on top of the `@agorax/voting` SDK
 * (the ElectionGuard 2.1 protocol layer). Ballots are ElGamal-encrypted and
 * carry zero-knowledge validity proofs; the tally is homomorphic; the result
 * is decrypted by a threshold of guardians and published as an election
 * record anyone can re-verify.
 *
 * ── DEVELOPMENT-ONLY, NOT FOR BINDING ELECTIONS ──────────────────────────
 * Two deliberate compromises make this a dev/demo backend, not a private
 * one:
 *   1. Ballots are encrypted *on the server* — the host briefly sees the
 *      plaintext choice. Real privacy needs client-side encryption (SDK
 *      Phase 6) so the server only ever receives ciphertext.
 *   2. The guardian secret key shares are stored server-side, in
 *      `eg_elections.dev_guardian_secrets`. With the shares on the server
 *      the host can decrypt at will. Real privacy needs independent
 *      trustees holding their own shares off-server.
 * What this backend *does* deliver today is verifiable **integrity**: every
 * ballot proof and the whole tally can be re-checked by `verify`.
 *
 * Selected by `VOTING_BACKEND=electionguard`. Guardian count and threshold
 * come from `EG_GUARDIANS` / `EG_THRESHOLD` (default 1-of-1 — dev only).
 *
 * The SDK is imported dynamically (never statically) so it stays out of the
 * default backend's module graph and the production server bundle.
 */

import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '../db';
import { egElections, egBallots, egElectionRecords } from '@shared/schema';
import type {
  BallotReceipt,
  CastBallotInput,
  ElectionProof,
  ElectionTally,
  VerificationResult,
  VotingBackend,
} from './types';
import type {
  CiphertextBallot,
  ElectionRecord,
  ElementModP,
  GuardianShare,
  ThresholdDecryptionResult,
} from '@agorax/voting';

const NAME = 'electionguard';

/** The shape of the dynamically imported SDK module. */
type Sdk = typeof import('@agorax/voting');

let sdkPromise: Promise<Sdk> | null = null;

/** Load the SDK on first use (dynamic — keeps it out of the default bundle). */
function sdk(): Promise<Sdk> {
  return (sdkPromise ??= import('@agorax/voting'));
}

/** Guardian count + threshold, from env. Default 1-of-1 is dev-only. */
function ceremonyConfig(): { threshold: number; guardianCount: number } {
  const guardianCount = Math.max(1, parseInt(process.env.EG_GUARDIANS ?? '1', 10));
  const threshold = Math.min(
    guardianCount,
    Math.max(1, parseInt(process.env.EG_THRESHOLD ?? '1', 10)),
  );
  return { threshold, guardianCount };
}

/** Stable election id for a proposal — bound into every ballot proof. */
function electionIdFor(proposalId: number): string {
  return `proposal-${proposalId}`;
}

/** Parse a hex-encoded group element. */
function parseElement(hex: string): ElementModP {
  return BigInt(`0x${hex}`) as ElementModP;
}

type ElectionRow = typeof egElections.$inferSelect;

export class ElectionGuardBackend implements VotingBackend {
  readonly name = NAME;

  /** Load the election row for a proposal, if one exists. */
  private async loadElection(proposalId: number): Promise<ElectionRow | null> {
    const rows = await db
      .select()
      .from(egElections)
      .where(eq(egElections.proposalId, proposalId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Get the election for a proposal, running the key ceremony if needed. */
  private async ensureElection(proposalId: number): Promise<ElectionRow> {
    const existing = await this.loadElection(proposalId);
    if (existing) return existing;

    const eg = await sdk();
    const { threshold, guardianCount } = ceremonyConfig();
    const ceremony = eg.runKeyCeremony(threshold, guardianCount);

    try {
      const [row] = await db
        .insert(egElections)
        .values({
          proposalId,
          threshold: ceremony.threshold,
          guardianCount: ceremony.guardianCount,
          jointPublicKey: ceremony.jointPublicKey.toString(16),
          guardianCommitments: eg.toJsonSafe(ceremony.guardianCommitments),
          devGuardianSecrets: eg.toJsonSafe(ceremony.guardianShares),
        })
        .returning();
      return row;
    } catch {
      // A concurrent caller won the unique(proposal_id) race — use theirs.
      const row = await this.loadElection(proposalId);
      if (!row) throw new Error('electionguard: failed to create election');
      return row;
    }
  }

  /** Deserialize the guardian shares stored with an election. */
  private async guardianShares(
    eg: Sdk,
    election: ElectionRow,
  ): Promise<GuardianShare[]> {
    return eg.fromJsonSafe(election.devGuardianSecrets) as GuardianShare[];
  }

  /** Load every still-effective (non-superseded) ballot for an election. */
  private async activeBallots(
    eg: Sdk,
    electionId: number,
  ): Promise<CiphertextBallot[]> {
    const rows = await db
      .select()
      .from(egBallots)
      .where(and(eq(egBallots.electionId, electionId), isNull(egBallots.supersededById)));
    return rows.map((r) => eg.fromJsonSafe(r.ciphertextBallot) as CiphertextBallot);
  }

  /** Threshold-decrypt an encrypted tally with the stored guardian shares. */
  private async decryptResult(
    eg: Sdk,
    election: ElectionRow,
    encryptedTally: ReturnType<Sdk['tallyBallots']>,
  ): Promise<{ result: ThresholdDecryptionResult; partials: ReturnType<Sdk['partiallyDecryptTally']>[] }> {
    const shares = await this.guardianShares(eg, election);
    const partials = shares.map((share) =>
      eg.partiallyDecryptTally(encryptedTally, share),
    );
    const result = eg.combineDecryptionShares(
      encryptedTally,
      partials,
      parseElement(election.jointPublicKey),
      election.threshold,
    );
    return { result, partials };
  }

  async startElection(args: { proposalId: number }): Promise<void> {
    await this.ensureElection(args.proposalId);
  }

  async castSignedBallot(input: CastBallotInput): Promise<BallotReceipt> {
    // input.signature is accepted but not yet verified — voter-side signing
    // is SDK Phase 7. The ballot's ZK proofs already bind it to the election.
    const eg = await sdk();
    const election = await this.ensureElection(input.proposalId);
    if (election.status !== 'open') {
      throw new Error('electionguard: election is closed');
    }

    const manifest = eg.agoraxRatificationManifest(electionIdFor(input.proposalId));
    const jointKey = parseElement(election.jointPublicKey);
    const plaintext = eg.ratificationBallot(
      `p${input.proposalId}-u${input.userId}-${Date.now()}`,
      input.choice,
    );
    const ballot = eg.encryptBallot(manifest, plaintext, jointKey);
    if (!eg.verifyBallot(manifest, ballot, jointKey)) {
      throw new Error('electionguard: freshly encrypted ballot failed verification');
    }

    const [row] = await db
      .insert(egBallots)
      .values({
        electionId: election.id,
        userId: input.userId,
        ciphertextBallot: eg.toJsonSafe(ballot),
      })
      .returning();

    // Re-voting: supersede this user's previous effective ballot.
    await db
      .update(egBallots)
      .set({ supersededById: row.id })
      .where(
        and(
          eq(egBallots.electionId, election.id),
          eq(egBallots.userId, input.userId),
          isNull(egBallots.supersededById),
          ne(egBallots.id, row.id),
        ),
      );

    return {
      voteId: row.id,
      backend: NAME,
      payload: {
        ballotId: ballot.ballotId,
        electionId: election.id,
        encrypted: true,
      },
    };
  }

  async getTally(args: { proposalId: number }): Promise<ElectionTally> {
    // NOTE: a live tally requires decrypting the running aggregate. That is
    // possible here only because this dev backend holds the guardian shares;
    // a production deployment must not expose a tally before close.
    const eg = await sdk();
    const election = await this.loadElection(args.proposalId);
    if (!election) return { yes: 0, no: 0, abstain: 0, total: 0 };

    const manifest = eg.agoraxRatificationManifest(electionIdFor(args.proposalId));
    const ballots = await this.activeBallots(eg, election.id);
    const encryptedTally = eg.tallyBallots(manifest, ballots);
    const { result } = await this.decryptResult(eg, election, encryptedTally);
    return toElectionTally(result);
  }

  async closeAndTally(
    args: { proposalId: number },
  ): Promise<ElectionTally & { proof: ElectionProof }> {
    const eg = await sdk();
    const election = await this.ensureElection(args.proposalId);

    const manifest = eg.agoraxRatificationManifest(electionIdFor(args.proposalId));
    const ballots = await this.activeBallots(eg, election.id);
    const encryptedTally = eg.tallyBallots(manifest, ballots);
    const { result, partials } = await this.decryptResult(eg, election, encryptedTally);

    const record: ElectionRecord = {
      manifest,
      threshold: election.threshold,
      guardianCount: election.guardianCount,
      jointPublicKey: parseElement(election.jointPublicKey),
      guardianCommitments: eg.fromJsonSafe(
        election.guardianCommitments,
      ) as ElectionRecord['guardianCommitments'],
      ballots,
      encryptedTally,
      partialDecryptions: partials,
      result,
    };
    const report = eg.verifyElectionRecord(record);
    const tally = toElectionTally(result);

    if (election.status !== 'closed') {
      await db
        .update(egElections)
        .set({ status: 'closed', closedAt: new Date() })
        .where(eq(egElections.id, election.id));
    }
    const existingRecord = await db
      .select()
      .from(egElectionRecords)
      .where(eq(egElectionRecords.electionId, election.id))
      .limit(1);
    if (existingRecord.length === 0) {
      await db.insert(egElectionRecords).values({
        electionId: election.id,
        record: eg.toJsonSafe(record),
        tally,
      });
    }

    const proof: ElectionProof = {
      backend: NAME,
      payload: {
        status: 'closed',
        recordVerified: report.ok,
        checks: report.checks,
        ballotCount: encryptedTally.ballotCount,
        jointPublicKey: election.jointPublicKey,
      },
    };
    return { ...tally, proof };
  }

  async getProof(args: { proposalId: number }): Promise<ElectionProof> {
    const eg = await sdk();
    const election = await this.loadElection(args.proposalId);
    if (!election) {
      return { backend: NAME, payload: { status: 'no-election' } };
    }

    const stored = await db
      .select()
      .from(egElectionRecords)
      .where(eq(egElectionRecords.electionId, election.id))
      .limit(1);
    if (stored.length > 0) {
      return {
        backend: NAME,
        payload: {
          status: 'closed',
          tally: stored[0].tally,
          record: stored[0].record,
        },
      };
    }

    const ballots = await this.activeBallots(eg, election.id);
    return {
      backend: NAME,
      payload: {
        status: 'open',
        jointPublicKey: election.jointPublicKey,
        ballotCount: ballots.length,
        threshold: election.threshold,
        guardianCount: election.guardianCount,
      },
    };
  }

  async verify(args: { proposalId: number }): Promise<VerificationResult> {
    const eg = await sdk();
    const election = await this.loadElection(args.proposalId);
    if (!election) {
      return {
        ok: false,
        backend: NAME,
        payload: { reason: 'no election exists for this proposal' },
      };
    }

    // A closed election: re-verify the published record end to end.
    const stored = await db
      .select()
      .from(egElectionRecords)
      .where(eq(egElectionRecords.electionId, election.id))
      .limit(1);
    if (stored.length > 0) {
      const record = eg.fromJsonSafe(stored[0].record) as ElectionRecord;
      const report = eg.verifyElectionRecord(record);
      const firstFail = report.checks.find((c) => !c.ok);
      return {
        ok: report.ok,
        backend: NAME,
        firstBreakAt: firstFail ? { check: firstFail.name, detail: firstFail.detail } : undefined,
        payload: { status: 'closed', checks: report.checks },
      };
    }

    // An open election: re-verify every effective ballot's validity proofs.
    const manifest = eg.agoraxRatificationManifest(electionIdFor(args.proposalId));
    const jointKey = parseElement(election.jointPublicKey);
    const ballots = await this.activeBallots(eg, election.id);
    let firstBad = -1;
    for (let i = 0; i < ballots.length; i++) {
      if (!eg.verifyBallot(manifest, ballots[i], jointKey)) {
        firstBad = i;
        break;
      }
    }
    return {
      ok: firstBad === -1,
      backend: NAME,
      firstBreakAt: firstBad === -1 ? undefined : { ballotIndex: firstBad },
      payload: { status: 'open', ballotsChecked: ballots.length },
    };
  }
}

/** Map an SDK threshold-decryption result to the VotingBackend tally shape. */
function toElectionTally(result: ThresholdDecryptionResult): ElectionTally {
  const contest = result.contests.find((c) => c.contestId === 'ratification');
  const countOf = (selectionId: string): number =>
    contest?.selections.find((s) => s.selectionId === selectionId)?.tally ?? 0;
  const yes = countOf('yes');
  const no = countOf('no');
  const abstain = countOf('abstain');
  return { yes, no, abstain, total: yes + no + abstain };
}
