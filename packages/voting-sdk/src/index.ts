/**
 * `@agorax/voting` — verifiable, private voting SDK.
 *
 * Public API surface.
 *  - Phase 0: the ElectionGuard 2.1 group.
 *  - Phase 1: the EG hash function, ElGamal encryption, and the
 *    Chaum-Pedersen / disjunctive zero-knowledge proofs.
 *
 * Still to come: ballots + homomorphic tally (Phase 2), threshold key
 * ceremony + decryption (Phase 3), the public verifier (Phase 4), and the
 * AgoraX integration (Phase 5+).
 *
 * See `docs/VERIFIABLE_VOTING_SDK_PLAN.md` in the AgoraX repo.
 *
 * NOT FOR BINDING ELECTIONS until an independent cryptographer review has
 * been completed (see the privacy checklist in the plan).
 */

// --- Phase 0: group --------------------------------------------------------
export {
  P,
  Q,
  G,
  R,
  Fp,
  Fq,
  EG_GROUP,
  hexToBigint,
  powModP,
  multModP,
  invModP,
  gPowP,
  modQ,
  addModQ,
  subModQ,
  multModQ,
  invModQ,
  isElementModP,
  isElementModQ,
  isInSubgroup,
  validateGroup,
} from './group.ts';

export type {
  ElementModP,
  ElementModQ,
  ElectionGroup,
  GroupValidation,
} from './group.ts';

export { EG_2_1_PARAMETER_SET } from './constants.ts';

// --- Phase 1: hash + randomness -------------------------------------------
export {
  H,
  MOD_P_BYTES,
  MOD_Q_BYTES,
  bigintToBytes,
  bytesToBigint,
  modPToBytes,
  modQToBytes,
  concatBytes,
  sha256Utf8,
} from './hash.ts';

export { randomModQ, randomModQNonzero } from './random.ts';

// --- Phase 1: ElGamal encryption ------------------------------------------
export {
  generateKeyPair,
  publicKeyOf,
  encrypt,
  encryptWithFreshNonce,
  addCiphertexts,
  decrypt,
  decryptToGroupElement,
} from './elgamal.ts';

export type {
  ElGamalKeyPair,
  Ciphertext,
  EncryptionResult,
} from './elgamal.ts';

// --- Phase 1: zero-knowledge proofs ---------------------------------------
export { domainKey, fiatShamirChallenge } from './proofs/fiat-shamir.ts';

export { proveEqualDlog, verifyEqualDlog } from './proofs/chaum-pedersen.ts';
export type {
  ChaumPedersenProof,
  EqualDlogStatement,
} from './proofs/chaum-pedersen.ts';

export { proveZeroOrOne, verifyZeroOrOne } from './proofs/disjunctive.ts';
export type { DisjunctiveProof } from './proofs/disjunctive.ts';

// --- Phase 2: manifest, ballots, tally, decryption ------------------------
export {
  agoraxRatificationManifest,
  assertValidManifest,
} from './manifest.ts';
export type {
  SelectionDescription,
  ContestDescription,
  ElectionManifest,
} from './manifest.ts';

export {
  ratificationBallot,
  encryptBallot,
  verifyBallot,
} from './ballot.ts';
export type {
  PlaintextSelection,
  PlaintextContest,
  PlaintextBallot,
  EncryptedSelection,
  EncryptedContest,
  CiphertextBallot,
} from './ballot.ts';

export {
  emptyTally,
  accumulateBallot,
  tallyBallots,
} from './tally.ts';
export type {
  SelectionTally,
  ContestTally,
  EncryptedTally,
} from './tally.ts';

export { decryptTally, verifyDecryptedTally } from './decryption.ts';
export type {
  DecryptedSelection,
  DecryptedContest,
  DecryptedTally,
} from './decryption.ts';

// --- Phase 3: threshold key ceremony + decryption -------------------------
export {
  evaluatePolynomial,
  generateGuardian,
  commitmentFor,
  dealShare,
  verifyShare,
  deriveShareCommitment,
  lagrangeCoefficient,
  runKeyCeremony,
} from './keyceremony.ts';
export type {
  Guardian,
  GuardianCommitment,
  GuardianShare,
  KeyCeremonyResult,
} from './keyceremony.ts';

export {
  partiallyDecryptTally,
  verifyPartialDecryption,
  combineDecryptionShares,
  verifyThresholdDecryption,
} from './decryption.ts';
export type {
  PartialDecryptionSelection,
  PartialDecryptionContest,
  GuardianPartialDecryption,
  GuardianPublicShare,
  ThresholdSelectionResult,
  ThresholdContestResult,
  ThresholdDecryptionResult,
} from './decryption.ts';

// --- Phase 4: the public verifier -----------------------------------------
export { verifyElectionRecord } from './verifier.ts';
export type {
  ElectionRecord,
  VerificationCheck,
  VerificationReport,
} from './verifier.ts';
