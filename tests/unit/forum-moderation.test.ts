/**
 * The rule that takes someone's words off a community forum.
 *
 * In an autonomous community there is no administrator to appeal to, so this
 * arithmetic *is* the appeal. It is worth testing at the edges rather than in
 * the middle: the interesting cases are the lone objector, the exact tie, and
 * the moment the quorum is reached.
 */

import { describe, expect, it } from 'vitest';
import {
  MIN_FLAG_VOTES,
  flagVotesRemaining,
  isFlagDirection,
  shouldHideByFlags,
} from '../../shared/forum-moderation';

describe('forum moderation verdict', () => {
  it('refuses to hide below the quorum, however one-sided', () => {
    // One offended reader is not "the members decided".
    expect(shouldHideByFlags({ hide: 1, keep: 0 })).toBe(false);
    expect(shouldHideByFlags({ hide: 2, keep: 0 })).toBe(false);
    expect(MIN_FLAG_VOTES).toBe(3);
  });

  it('hides once a quorum has voted and more want it gone than kept', () => {
    expect(shouldHideByFlags({ hide: 3, keep: 0 })).toBe(true);
    expect(shouldHideByFlags({ hide: 2, keep: 1 })).toBe(true);
    expect(shouldHideByFlags({ hide: 40, keep: 39 })).toBe(true);
  });

  it('leaves a tie standing, because the burden is on removal', () => {
    expect(shouldHideByFlags({ hide: 2, keep: 2 })).toBe(false);
    expect(shouldHideByFlags({ hide: 50, keep: 50 })).toBe(false);
  });

  it('keeps a post that the majority defends', () => {
    expect(shouldHideByFlags({ hide: 1, keep: 5 })).toBe(false);
    expect(shouldHideByFlags({ hide: 0, keep: 0 })).toBe(false);
  });

  it('reports how many more votes removal needs, and agrees with the verdict', () => {
    // Shown to a member so they can see whether theirs is the deciding vote.
    expect(flagVotesRemaining({ hide: 0, keep: 0 })).toBe(3);
    expect(flagVotesRemaining({ hide: 2, keep: 0 })).toBe(1);
    expect(flagVotesRemaining({ hide: 3, keep: 0 })).toBe(0);
    // Defenders raise the bar: two more are needed to both break the tie and
    // stay above it.
    expect(flagVotesRemaining({ hide: 2, keep: 2 })).toBe(1);
    expect(flagVotesRemaining({ hide: 1, keep: 5 })).toBe(5);

    // Whatever the count says, casting exactly that many `hide` votes must
    // flip the verdict — and one fewer must not.
    for (const tally of [
      { hide: 0, keep: 0 }, { hide: 1, keep: 0 }, { hide: 2, keep: 2 },
      { hide: 1, keep: 5 }, { hide: 7, keep: 7 }, { hide: 0, keep: 9 },
    ]) {
      const needed = flagVotesRemaining(tally);
      expect(shouldHideByFlags({ ...tally, hide: tally.hide + needed })).toBe(true);
      if (needed > 0) {
        expect(shouldHideByFlags({ ...tally, hide: tally.hide + needed - 1 })).toBe(false);
      }
    }
  });

  it('accepts only the two directions a member can take', () => {
    expect(isFlagDirection('hide')).toBe(true);
    expect(isFlagDirection('keep')).toBe(true);
    expect(isFlagDirection('delete')).toBe(false);
    expect(isFlagDirection(undefined)).toBe(false);
    expect(isFlagDirection(1)).toBe(false);
  });
});
