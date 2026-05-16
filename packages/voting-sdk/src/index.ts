/**
 * `@agorax/voting` — verifiable, private voting SDK.
 *
 * Public API surface. Phase 0 exposes only the ElectionGuard 2.1 group;
 * later phases add ElGamal encryption, ZK proofs, homomorphic tally,
 * threshold key ceremony / decryption, and the public verifier.
 *
 * See `docs/VERIFIABLE_VOTING_SDK_PLAN.md` in the AgoraX repo for the build
 * plan and the integrity/privacy responsibility split.
 *
 * NOT FOR BINDING ELECTIONS until an independent cryptographer review has
 * been completed (see the privacy checklist in the plan).
 */

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
  multModQ,
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
