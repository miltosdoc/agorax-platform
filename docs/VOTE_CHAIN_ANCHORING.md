# Vote-chain anchoring

**In one paragraph.** Every ballot is hashed onto the previous one, so the
ballot box is a chain whose last hash fingerprints everything in it. Every
ten minutes that fingerprint is published to a public GitHub branch, and
each published fingerprint is committed to the Bitcoin blockchain through
OpenTimestamps. Together: the chain shows *what* is in the box, GitHub shows
*that* we published it and *when*, and Bitcoin makes that time and content
impossible to move afterwards, for anyone.

Every proposal's final vote is an append-only SHA-256 hash chain
(`server/utils/vote-chain.ts`). Each row's `row_hash` binds the previous
row's hash, the ballot and the cast time, so editing or deleting a row
breaks the chain from that point on.

On its own that only protects against tampering by someone who cannot
recompute the hashes. The server operator can rewrite the whole chain and
recompute every hash, and nobody would notice unless they had recorded the
head hash earlier. Anchoring closes that gap: the server periodically
publishes each proposal's head hash to a repository the operator does not
control in the same way, where every write is a commit with its own
timestamp and history.

## What gets published

Nothing about individual votes. A published line contains only:

| field | meaning |
|---|---|
| `v` | record format version (currently `1`) |
| `proposalId` | the proposal |
| `phase` | `open` while voting, `final` once the proposal is decided |
| `headHash` | `row_hash` of the last row in the chain (64 zeros when empty) |
| `total` | number of rows in the chain, superseded rows included |
| `verifyOk` | whether a full recomputation of the chain succeeded at capture time |
| `capturedAt` | when the head was read, ISO 8601 UTC |
| `prevAnchorHash` | `anchorHash` of the previous line for this proposal, or 64 zeros |
| `anchorHash` | SHA-256 of the canonical JSON of all fields above |

A head hash cannot be reversed into ballots, choices or voters.

## Where

Configured with three environment variables:

```
ANCHOR_GITHUB_REPO=owner/repo
ANCHOR_GITHUB_BRANCH=anchors        # default
ANCHOR_GITHUB_TOKEN=...             # contents:write on that repo only
```

The server writes `anchors/proposal-<id>.jsonl` on that branch, one line
per anchor, appending only. The branch is created as an orphan on first use
so anchor commits never mix with source history. Unset the variables and
anchoring is a no-op.

## When

A sweep runs two minutes after boot and every ten minutes after that
(`chain_anchor` job). It anchors a proposal when:

- it is in `voting` and its head hash differs from the last anchored one, or
- it is `decided` and has no `final` anchor yet.

At most ten proposals are anchored per sweep, so a large backlog spreads
over a few sweeps rather than hammering the GitHub API. The finalize route
also enqueues a sweep, so a closed vote is sealed within moments.

## Bitcoin timestamps (OpenTimestamps)

Right after an anchor line is published, its `anchorHash` is submitted to
the public OpenTimestamps calendar servers. They aggregate digests into one
Bitcoin transaction, so stamping is free and needs no wallet. The result is
a small `.ots` proof that starts out *pending* and becomes *complete* once
the transaction is confirmed, usually within one to three hours.

The sweep keeps pending proofs in the `vote_chain_anchors` table, asks the
calendars to upgrade them on a widening schedule, and when a proof is
complete publishes it as `anchors/ots/<anchorHash>.ots` on the anchor branch
and records the Bitcoin block height. `ANCHOR_OTS=off` disables this layer
while keeping GitHub anchoring.

To check a proof independently, take the anchor line without its
`anchorHash` field, in canonical form, and run:

```
ots verify anchors/ots/<anchorHash>.ots -f <canonical-line-file>
```

The client confirms the digest existed at the reported block and time,
against a Bitcoin node or a public block explorer.

## Verifying as a third party

1. Fetch the anchor file, e.g.
   `https://raw.githubusercontent.com/<owner>/<repo>/anchors/anchors/proposal-97.jsonl`.
   The commit history of that file gives you GitHub's timestamp for each line.
2. Check the anchor sequence: for each line, recompute
   `sha256(canonicalJson(line without anchorHash))` and compare with
   `anchorHash`; check `prevAnchorHash` equals the previous line's
   `anchorHash`.
3. Ask the server for the live head:
   `GET /api/proposals/97/election/proof` returns `payload.headHash` and
   `payload.total`.
4. For a decided proposal, the live head must equal the `final` anchor.
   For an open vote, the live chain must still *contain* every anchored
   head: `GET /api/proposals/97/receipt-inclusion?rowHash=<headHash>`
   returns `found: true` for each anchored head, and `total` must never
   decrease between anchors.
5. `GET /api/proposals/97/election/verify` recomputes the chain server-side
   and reports the first break, if any.
6. `GET /api/proposals/97/election/anchors` lists the anchors the server
   claims to have published, with commit links, so the two records can be
   compared side by side.

A mismatch in step 4 means the chain was rewritten after the anchor was
published. Because the anchor lives in a commit the operator cannot
backdate, that is evidence rather than suspicion.

## Limits

Anchoring makes tampering visible; it cannot undo it or name who did it.
The window between two anchors, up to ten minutes, is covered only by the
chain itself.
