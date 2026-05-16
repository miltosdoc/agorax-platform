/**
 * The election manifest — the public description of what is being voted on.
 *
 * A manifest is a list of contests; each contest is a list of named
 * selections and a `selectionLimit` — how many selections a valid ballot
 * must choose. For an AgoraX binding ratification vote there is one contest
 * with selections `yes` / `no` / `abstain` and a limit of 1 (choose exactly
 * one). The manifest is public and is bound into every proof.
 */

/** One choosable option within a contest. */
export interface SelectionDescription {
  /** Stable identifier, unique within the contest (e.g. `yes`). */
  selectionId: string;
}

/** One question on the ballot. */
export interface ContestDescription {
  /** Stable identifier, unique within the election. */
  contestId: string;
  /** The options, in a fixed canonical order. */
  selections: SelectionDescription[];
  /** Exactly how many selections a valid ballot chooses (a "1" each). */
  selectionLimit: number;
}

/** The full public description of an election. */
export interface ElectionManifest {
  /** Stable identifier for this election. */
  electionId: string;
  /** The contests, in a fixed canonical order. */
  contests: ContestDescription[];
}

/**
 * The manifest for an AgoraX ratification vote: a single yes/no/abstain
 * contest where the voter chooses exactly one option.
 */
export function agoraxRatificationManifest(
  electionId: string,
): ElectionManifest {
  return {
    electionId,
    contests: [
      {
        contestId: 'ratification',
        selections: [
          { selectionId: 'yes' },
          { selectionId: 'no' },
          { selectionId: 'abstain' },
        ],
        selectionLimit: 1,
      },
    ],
  };
}

/** Throw if a manifest is structurally invalid (duplicate or empty ids, …). */
export function assertValidManifest(manifest: ElectionManifest): void {
  if (!manifest.electionId) throw new Error('manifest: missing electionId');
  const contestIds = new Set<string>();
  for (const contest of manifest.contests) {
    if (!contest.contestId) throw new Error('manifest: missing contestId');
    if (contestIds.has(contest.contestId)) {
      throw new Error(`manifest: duplicate contestId ${contest.contestId}`);
    }
    contestIds.add(contest.contestId);
    if (contest.selections.length === 0) {
      throw new Error(`manifest: contest ${contest.contestId} has no selections`);
    }
    if (
      contest.selectionLimit < 0 ||
      contest.selectionLimit > contest.selections.length
    ) {
      throw new Error(
        `manifest: contest ${contest.contestId} has an out-of-range selectionLimit`,
      );
    }
    const selectionIds = new Set<string>();
    for (const sel of contest.selections) {
      if (!sel.selectionId) throw new Error('manifest: missing selectionId');
      if (selectionIds.has(sel.selectionId)) {
        throw new Error(
          `manifest: duplicate selectionId ${sel.selectionId} in ${contest.contestId}`,
        );
      }
      selectionIds.add(sel.selectionId);
    }
  }
}
