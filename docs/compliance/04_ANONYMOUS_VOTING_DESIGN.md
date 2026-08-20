# §4 Anonymous Voting — Design (Blind-Signed Tokens)

**Status:** Draft for sign-off.
**Date:** 2026-05-27.
**Goal:** Deliver vote unlinkability against a **malicious database operator** while keeping the rest of the stack (deliberation, sortition, points) unchanged.

---

## 1. Threat model

**In scope** — the operator can:

- Read and write every row in Postgres at will.
- Read application logs.
- Run arbitrary queries / joins.
- Add admin endpoints.
- Inspect backups.

We must guarantee: even with all of the above, the operator cannot answer **"what choice did member X cast on proposal Y?"** for any member they didn't observe through a side channel.

**Out of scope for v1** (separate workstreams):

- Real-time network-traffic correlation (a global passive adversary timing the request that obtained a blind signature against the request that cast a vote). Mitigated by batched submission windows, voter-controlled delays, or Tor — not by this design.
- Voter-device compromise.
- Coercion / vote-selling defense beyond deniable receipts.

---

## 2. Primitive: RSA blind signatures

Well-understood, no exotic dependencies. The voter generates a random token, **blinds** it with a private blinding factor, sends the blinded value to the server, the server signs it, the voter **unblinds** to recover a valid signature on the original token. The server never sees the unblinded token.

```
client:                                          server:
  T ← random 256-bit string
  r ← random blinding factor
  B ← T · r^e mod N
  ────────── B ──────────►
                                                 σ_B ← B^d mod N
                                                 (records: user X got A signature)
  ◄────────── σ_B ──────────
  σ_T ← σ_B · r⁻¹ mod N      // unblind
  // Now (T, σ_T) is a valid signature on T,
  // and the server has no record of T.

  ────────── (T, σ_T, choice) ──────────►
                                                 verify σ_T on T using (N, e)
                                                 check T not already used
                                                 insert (proposal_id, T, choice)
```

Key library: `@noble/curves` + `@noble/hashes` (already in the project for ElectionGuard SDK work). RSA-blind can be done with native BigInt and a small modular-arithmetic helper — no external dependency.

---

## 3. Schema (migration 0021)

```sql
-- One signing key per proposal that uses anonymous voting.
CREATE TABLE blind_sig_keys (
  proposal_id integer PRIMARY KEY REFERENCES proposals(id) ON DELETE CASCADE,
  public_n text NOT NULL,
  public_e text NOT NULL,
  -- AES-256-GCM ciphertext of the private exponent d.
  -- Key derivation: HKDF(SIGNING_MASTER_KEY env, proposal_id).
  -- After the proposal closes, this row can be deleted to forward-secure
  -- the signing capability.
  secret_d_encrypted text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Who has been issued a blind signature for which proposal.
-- This table tells operator "user X participated" but NOT "user X voted Y."
CREATE TABLE blind_sig_issuance (
  id serial PRIMARY KEY,
  proposal_id integer NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, user_id)
);
```

`proposals` gains a mode flag:

```sql
ALTER TABLE proposals
  ADD COLUMN voting_mode text NOT NULL DEFAULT 'anonymous';
-- values: 'anonymous' | 'pseudonymous'
-- legacy proposals already created stay 'pseudonymous'; new proposals default
-- to 'anonymous'.
```

`proposal_votes` gains:

```sql
ALTER TABLE proposal_votes
  ADD COLUMN vote_token text,
  ADD COLUMN voting_mode text NOT NULL DEFAULT 'pseudonymous';
-- For anonymous-mode rows: user_id = NULL, vote_token = the unblinded token.
-- For pseudonymous-mode rows: user_id = real FK, vote_token = NULL.
-- Existing rows are pseudonymous by definition.

CREATE UNIQUE INDEX proposal_votes_token_unique
  ON proposal_votes (proposal_id, vote_token)
  WHERE vote_token IS NOT NULL;
```

---

## 4. Hash-chain integration

The existing chain hash is computed over `prev || proposal_id || user_id || choice || weight || cast_at`. For anonymous rows, swap `user_id` for `vote_token`. The verifier reads `voting_mode` and picks the right input set.

This preserves tamper-evidence for both modes. The chain's purpose (a published `headHash` lets a third party detect any post-hoc edit) is mode-agnostic.

---

## 5. Endpoints

### 5.1 `POST /api/proposals/:id/blind-sign`
- Auth: required, requires consent.
- Body: `{ blindedToken: <base64 BigInt> }`
- Server:
  1. Verify proposal status is `voting` and mode is `anonymous`.
  2. Load the proposal's signing key. If none exists, generate (RSA-2048).
  3. Check `blind_sig_issuance` for `(proposal_id, user_id)` — reject with 409 if already issued.
  4. Decrypt `d`, compute `signature = blindedToken^d mod N`, re-encrypt key for storage.
  5. Insert into `blind_sig_issuance`.
  6. Return `{ signature: <base64>, publicKey: { n, e } }`.

### 5.2 `POST /api/proposals/:id/anonymous-vote`
- **Auth: NONE.** Authenticated requests would correlate with the blind-sign request and break the property. The route is rate-limited globally (10 votes/IP/min, generous because some members will share an IP).
- Body: `{ token: <base64>, signature: <base64>, choice: 'yes' | 'no' | 'abstain' }`
- Server:
  1. Load proposal's `(N, e)`.
  2. Verify RSA signature on `token`.
  3. Insert into `proposal_votes` with `user_id=NULL`, `vote_token=token`, `voting_mode='anonymous'`, computed chain hash.
  4. The `UNIQUE (proposal_id, vote_token)` index prevents double-spend at DB level — second attempt returns 409.
  5. Return `{ receipt: rowHash }`.

### 5.3 `GET /api/proposals/:id/verify-receipt?token=<base64>`
- Auth: none.
- Returns whether that token appears in the vote table for that proposal, and what choice it carries. Lets a voter verify their vote was counted, but anyone with the token can do so — that's intentional (deniable receipts; you can show "I cast a vote" without proving which way you cast it, because you could publish someone else's token+signature equally well).

### 5.4 Pseudonymous fallback
The existing `POST /api/proposals/:id/vote` continues to work for proposals where `voting_mode='pseudonymous'`. The proposal-creation UI surfaces the mode choice.

---

## 6. What the operator can / cannot see

| Question | Answer? | Why |
|---|---|---|
| "Did user X vote on proposal Y?" | **YES** | `blind_sig_issuance(proposal_id, user_id)` is the participation record. Unavoidable — without it the server can't enforce one-person-one-vote. |
| "What choice did user X cast?" | **NO** | The vote row has `vote_token + choice`. The token is generated client-side, blinded before transit, never logged unblinded. No row in any table links `user_id ↔ vote_token`. |
| "How many yes votes?" | **YES** (intended) | Aggregate tally is public after close, as before. |
| "Did this token get used?" | **YES** | The vote row exists. |
| "Who owns this token?" | **NO** | No table contains both. |
| "Can I verify the chain wasn't rewritten?" | **YES** | Same hash chain as before, recomputed over `vote_token` instead of `user_id` for anonymous rows. |

---

## 7. Re-voting

**Disabled for anonymous-mode proposals.** Once a token is used, the DB rejects further votes with that token (unique index). And a user can only get one blind signature per proposal (issuance unique index). So one user = one vote, period.

The voter UI should require a confirmation step before final submission ("Once you click vote, you cannot change it. Are you sure?").

For proposals where the operator wants re-voting (e.g. straw polls), they can pick `voting_mode='pseudonymous'` at creation. The two modes coexist.

---

## 8. Receipt UX

After voting, the client stores `(token, signature, choice, receipt)` in localStorage under the proposal id. The profile page surfaces a "My votes" view that displays these (client-only, never sent back to the server).

The voter can use `verify-receipt?token=…` to confirm their token landed in the DB and matches their recollection. They cannot prove this to anyone else (anyone holding the token can do the same lookup). This is the *deniable receipt* property — it defends against vote-selling because a buyer can't verify the seller actually voted as instructed.

If the voter clears their localStorage, the receipt is gone. They can still confirm "did I vote?" via `blind_sig_issuance`, but not "how did I vote?". This is the price.

---

## 9. Key custody — the residual risk

The signing key `d` lives on the server (AES-GCM encrypted at rest, key derived via HKDF from a `SIGNING_MASTER_KEY` env var that the operator owns). If the operator extracts the master key, they can:

- **Forge votes** — yes. Breaks integrity. The chain still tampers-evident: a forged row breaks the chain's `prev_hash` linkage if inserted post-hoc, but a real-time forgery during the voting phase is undetectable.
- **NOT break anonymity.** The blinding factor never touches the server; the unblinded token is not recoverable from the blinded one even with `d`.

For binding votes later: the signing key should be split across N independent trustees with a threshold k-of-N decryption (Shamir / Pedersen VSS). That's the migration path to Option C in the original audit. This design is the foundation.

---

## 10. What's left for full Option A (later)

This design closes the malicious-operator anonymity question for **the choice**. What it does NOT close:

- Network-correlation anonymity (timing attacks). Real solutions: a batched submission window where votes are held until close and shuffled, or Tor-only voting. Out of scope.
- Coercion-resistance beyond deniable receipts. Real solutions: receipt-free voting protocols (much harder crypto). Out of scope.
- Verifiable end-to-end audit by an outside observer (ElectionGuard's promise). Requires the full Phase 6+7 work + threshold trustees.

These are the gates that turn "anonymous consultative votes" into "anonymous binding votes." This design unblocks the next conversation.

---

## 11. Acceptance criteria

- [ ] Schema migration 0021 applies cleanly.
- [ ] `shared/blind-sig.ts` provides `blind(token, N, e) → blinded`, `unblind(σ, r, N) → σ_T`, `sign(blinded, d, N) → σ_blinded`, `verify(token, σ, N, e) → boolean`. Tests against known vectors.
- [ ] `POST /api/proposals/:id/blind-sign` enforces one-per-user-per-proposal.
- [ ] `POST /api/proposals/:id/anonymous-vote` is unauthenticated, IP-rate-limited, validates signature, prevents double-spend by unique index.
- [ ] Hash chain verifier recognises anonymous rows and recomputes correctly.
- [ ] Proposal-creation UI exposes the mode choice with the privacy implications stated.
- [ ] Voting UI uses the right flow per mode; anonymous mode shows the receipt warning.
- [ ] Privacy Notice updated: §3 no longer says "votes are not anonymous" categorically — it distinguishes the two modes and points to this design as the unlinkability guarantee.

---

## 12. Decisions for sign-off

1. **Default mode for new proposals** — anonymous (recommended) or pseudonymous?
2. **Mode immutability** — once set at creation, can the mode be changed? (Recommended: no.)
3. **Legacy proposals** — leave them on pseudonymous, or attempt to migrate? (Recommended: leave them. Migrating would either lose vote integrity or require re-voting.)
4. **Receipt persistence** — localStorage only (recommended), or also offer a downloadable JSON receipt at vote time?
5. **Re-key per proposal** — generate a fresh RSA keypair per proposal (recommended), or one global key? Per-proposal keys mean a leak affects only that election.
