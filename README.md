# AgoraX vote-chain anchors

One file per proposal under `anchors/`, one JSON line per anchor, append-only.
Each line publishes the SHA-256 head of that proposal's vote chain at a point in time.
No ballots, choices or voters are recorded here. Verification procedure:
docs/VOTE_CHAIN_ANCHORING.md in the main branch.
