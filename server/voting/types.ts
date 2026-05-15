/**
 * VotingBackend — abstraction over the cryptographic guarantees of the
 * binding ratification vote.
 *
 * The deliberation side of AgoraX (proposals, sortition, amendments, debate)
 * is plain web-app concerns. The *vote* is the thing that needs strong
 * verifiability, and different communities will want different tradeoffs
 * (today: tamper-evident hash chain; tomorrow: Helios with threshold
 * trustees; eventually: voter-side signing from a mobile app).
 *
 * This interface is the seam. Routes call methods here; concrete backends
 * (HashChainBackend, HeliosBackend, ...) implement them. A community can
 * pick its backend; the rest of AgoraX is unchanged.
 *
 * `castSignedBallot` accepts an optional `BallotSignature` so the mobile
 * client can sign locally without changing the API surface when it lands.
 */

export type VoteChoice = 'yes' | 'no' | 'abstain';

/** Cryptographic signature produced by the voter's device. */
export interface BallotSignature {
  /** Signature algorithm — 'webauthn' for browser passkeys, 'ed25519' for
   *  the future mobile app's Secure Enclave key. */
  algorithm: 'webauthn' | 'ed25519';
  /** Public key the server should verify against; binds the signature to a
   *  voter-controlled identity. */
  publicKey: string;
  /** Hex-encoded signature over the canonical ballot bytes. */
  signature: string;
}

export interface CastBallotInput {
  proposalId: number;
  userId: number;
  choice: VoteChoice;
  /** Optional. The hash-chain backend ignores it today; future backends
   *  (Helios, mobile-signed) will require it. */
  signature?: BallotSignature;
}

/** What the voter walks away with after casting — proof their ballot was
 *  recorded. Shape is backend-specific because the proof model is. */
export interface BallotReceipt {
  voteId: number;
  backend: string;
  /** Backend-defined fields the voter (or a third party) can later use to
   *  verify inclusion. Hash chain: { rowHash, prevHash }. Helios: tracker. */
  payload: Record<string, unknown>;
}

export interface ElectionTally {
  yes: number;
  no: number;
  abstain: number;
  total: number;
}

/** A backend-specific verifiable artifact an external observer can pin.
 *  Hash chain: { headHash, total }. Helios: encrypted tally + trustee
 *  decryption proofs. */
export interface ElectionProof {
  backend: string;
  payload: Record<string, unknown>;
}

export interface VerificationResult {
  ok: boolean;
  backend: string;
  /** When ok=false, backend-specific detail naming the first inconsistency. */
  firstBreakAt?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

/**
 * Concrete backends implement this. Routes/seed/storage call here, never
 * directly into hash-chain helpers — so swapping backends does not touch
 * any deliberation code.
 */
export interface VotingBackend {
  readonly name: string;

  /** Called when a proposal transitions into the `voting` phase. The
   *  hash-chain backend is implicit-start and treats this as a no-op;
   *  Helios uses it to create the election object and freeze the roll. */
  startElection(args: { proposalId: number }): Promise<void>;

  /** Cast one ballot. May reject if the ballot already exists with a
   *  newer-id supersession; the backend defines its concurrency rules. */
  castSignedBallot(input: CastBallotInput): Promise<BallotReceipt>;

  /** Live tally — yes/no/abstain counts of currently-effective ballots
   *  (i.e. excluding superseded rows for the hash chain). */
  getTally(args: { proposalId: number }): Promise<ElectionTally>;

  /** Close the election and return the final tally + an externally
   *  verifiable proof artifact. For Helios this triggers trustee
   *  decryption; for the hash chain it's just the current head. */
  closeAndTally(args: { proposalId: number }): Promise<ElectionTally & { proof: ElectionProof }>;

  /** Current proof artifact without closing — for live audit dashboards. */
  getProof(args: { proposalId: number }): Promise<ElectionProof>;

  /** Backend-internal consistency check. Hash chain: walks the chain.
   *  Helios: re-runs ZK proofs against the published ballots. */
  verify(args: { proposalId: number }): Promise<VerificationResult>;
}
