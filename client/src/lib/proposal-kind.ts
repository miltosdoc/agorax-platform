import { proposalKindOf } from '@shared/proposal-kinds';

/**
 * The card eyebrow for a proposal: its kind («Εκλογή», «Καταστατικό»,
 * «Δημοσκόπηση»), or the list's own word when it is a plain decision — so
 * the exceptions stand out and the common case reads as before.
 */
export function proposalEyebrow(t: (key: string) => string, kind: unknown, fallback: string): string {
  const k = proposalKindOf(kind);
  return k === 'decision' ? fallback : t(`proposal.kind_${k}`);
}
