/**
 * Greek script generator contract tests.
 *
 * Pins the shape of the podcast and teaser scripts that drive the
 * Media Studio panel. We don't assert sentence-for-sentence text —
 * just the structural sections, language, and that proposal data
 * survives into the script.
 */

import { describe, expect, it } from 'vitest';
import { podcastScript, teaserScript } from '../../server/utils/media-script-templates';

const baseCtx = {
  proposal: {
    question: 'Πώς μπορούμε να βελτιώσουμε τη δημόσια συγκοινωνία στο κέντρο της Αθήνας;',
    solution: 'Εισαγωγή ηλεκτρικών λεωφορείων στο κέντρο και επέκταση του δικτύου ποδηλατοδρόμων.',
  },
  communityName: 'Πολίτες Αθήνας',
  forArgs: [
    'Λιγότερη ηχορύπανση και ρύπανση αέρα στο κέντρο.',
    'Ενθάρρυνση εναλλακτικών τρόπων μετακίνησης.',
  ],
  againstArgs: [
    'Υψηλό αρχικό κόστος αγοράς οχημάτων.',
  ],
};

describe('podcastScript — structure', () => {
  it('includes both voice tags A and B', () => {
    const text = podcastScript(baseCtx);
    expect(text).toMatch(/^Α:/m);
    expect(text).toMatch(/^Β:/m);
  });

  it('quotes the proposal question verbatim (or trimmed)', () => {
    const text = podcastScript(baseCtx);
    expect(text).toContain('Πώς μπορούμε να βελτιώσουμε');
  });

  it('quotes the proposed solution', () => {
    const text = podcastScript(baseCtx);
    expect(text).toContain('ηλεκτρικών λεωφορείων');
  });

  it('renders each supporting argument', () => {
    const text = podcastScript(baseCtx);
    for (const a of baseCtx.forArgs) {
      expect(text).toContain(a);
    }
  });

  it('renders the opposing arguments', () => {
    const text = podcastScript(baseCtx);
    for (const a of baseCtx.againstArgs) {
      expect(text).toContain(a);
    }
  });

  it('handles a proposal with no arguments without crashing', () => {
    const empty = { ...baseCtx, forArgs: [], againstArgs: [] };
    const text = podcastScript(empty);
    expect(text).toMatch(/Δεν έχουν κατατεθεί ακόμη επιχειρήματα υπέρ/);
    expect(text).toMatch(/Δεν έχουν κατατεθεί ακόμη επιχειρήματα κατά/);
  });

  it('omits the community framing when the name is null', () => {
    const orphan = { ...baseCtx, communityName: null };
    const text = podcastScript(orphan);
    expect(text).not.toContain('«null»');
    expect(text).toContain('Καλώς ήρθατε στο AgoraX');
  });

  it('closes with a call to read & vote', () => {
    const text = podcastScript(baseCtx);
    expect(text).toMatch(/AgoraX/);
    expect(text).toMatch(/ψηφίστε/);
  });
});

describe('teaserScript — structure', () => {
  it('runs five scenes', () => {
    const text = teaserScript(baseCtx);
    expect(text).toMatch(/Σκηνή 1/);
    expect(text).toMatch(/Σκηνή 5/);
  });

  it('keeps the strongest pro argument visible in scene 4', () => {
    const text = teaserScript(baseCtx);
    expect(text).toContain('Λιγότερη ηχορύπανση');
  });

  it('keeps the strongest con argument visible in scene 4', () => {
    const text = teaserScript(baseCtx);
    expect(text).toContain('Υψηλό αρχικό κόστος');
  });

  it('uses an inviting fallback when no arguments exist', () => {
    const empty = { ...baseCtx, forArgs: [], againstArgs: [] };
    const text = teaserScript(empty);
    expect(text).toMatch(/η συζήτηση είναι ανοιχτή/);
  });

  it('ends with the AgoraX call to action', () => {
    const text = teaserScript(baseCtx);
    expect(text).toMatch(/AgoraX/);
    expect(text).toMatch(/ψηφίστε/);
  });
});
