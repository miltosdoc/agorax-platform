import { proposalKindOf } from '@shared/proposal-kinds';

/**
 * The card eyebrow for a proposal: its kind — «Απόφαση», «Καταστατικό»,
 * «Εκλογή», «Δημοσκόπηση κοινότητας». Every card carries one, so the list
 * can be read (and filtered) by what is being voted.
 */
export function proposalEyebrow(t: (key: string) => string, kind: unknown): string {
  return t(`proposal.kind_${proposalKindOf(kind)}`);
}
