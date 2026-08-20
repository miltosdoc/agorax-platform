/**
 * Target population margins for post-stratification raking.
 *
 * APPROXIMATE values for the Greek adult (17+) population, derived from
 * ELSTAT Census 2021 publications and the June 2023 parliamentary results.
 * These are weighting TARGETS, not findings — refine them against the
 * detailed ELSTAT tables before any certified output ships. Every margin
 * set is normalized to sum to 1 at load, so editing a single share is safe.
 *
 * `pastVote2023` is deliberately OPTIONAL (off by default in the raking
 * call): self-reported recall in 2026 of a 2023 vote is contaminated
 * (winner's bonus, party churn). Enabling it is a per-analysis decision,
 * recorded in the methodology block.
 */

export type Margin = Record<string, number>;

function normalize(m: Margin): Margin {
  const sum = Object.values(m).reduce((a, b) => a + b, 0);
  const out: Margin = {};
  for (const [k, v] of Object.entries(m)) out[k] = v / sum;
  return out;
}

/** Default raking variables, in adjustment order. */
export const DEFAULT_RAKING_VARS = ['ageBand', 'gender', 'region', 'education', 'urbanity'] as const;

export const POPULATION_MARGINS: Record<string, Margin> = {
  ageBand: normalize({
    '17-24': 0.10,
    '25-34': 0.14,
    '35-44': 0.16,
    '45-54': 0.17,
    '55-64': 0.16,
    '65+': 0.27,
  }),
  gender: normalize({
    male: 0.482,
    female: 0.513,
    other: 0.005, // not in census; small non-zero target avoids degenerate weights
  }),
  region: normalize({
    EL30: 0.366, // Αττική
    EL41: 0.019, // Βόρειο Αιγαίο
    EL42: 0.031, // Νότιο Αιγαίο
    EL43: 0.058, // Κρήτη
    EL51: 0.054, // Αν. Μακεδονία & Θράκη
    EL52: 0.170, // Κεντρική Μακεδονία
    EL53: 0.024, // Δυτική Μακεδονία
    EL54: 0.030, // Ήπειρος
    EL61: 0.065, // Θεσσαλία
    EL62: 0.019, // Ιόνια Νησιά
    EL63: 0.061, // Δυτική Ελλάδα
    EL64: 0.051, // Στερεά Ελλάδα
    EL65: 0.052, // Πελοπόννησος
  }),
  education: normalize({
    primary: 0.25,
    secondary: 0.40,
    post_secondary: 0.10,
    tertiary: 0.20,
    postgraduate: 0.05,
  }),
  urbanity: normalize({
    urban: 0.63,
    semi_urban: 0.14,
    rural: 0.23,
  }),
  // June 2023 actual results scaled by turnout (~53.7%); remainder split
  // between abstention and the not-eligible/refused buckets.
  pastVote2023: normalize({
    nd: 0.218,
    syriza: 0.096,
    pasok: 0.064,
    kke: 0.041,
    spartiates: 0.025,
    elliniki_lysi: 0.024,
    niki: 0.020,
    plefsi: 0.017,
    mera25: 0.014,
    other: 0.018,
    blank_invalid: 0.008,
    did_not_vote: 0.42,
    not_eligible: 0.02,
    prefer_not_to_say: 0.015,
  }),
};

/**
 * Known population values for the calibration benchmark items — the gap
 * between the panel and these is an ongoing selection-skew estimate beyond
 * demographics. Sources: ELSTAT health survey (smoking), ELSTAT household
 * surveys (car ownership, mean household size).
 */
export const BENCHMARK_POPULATION_VALUES: Record<string, { value: number; description: string; source: string }> = {
  smoker: { value: 0.27, description: 'Ποσοστό ενηλίκων καπνιστών', source: 'ELSTAT Health Survey (προσέγγιση)' },
  household_car: { value: 0.76, description: 'Νοικοκυριά με ΙΧ αυτοκίνητο', source: 'ELSTAT (προσέγγιση)' },
  household_size: { value: 2.4, description: 'Μέσο μέγεθος νοικοκυριού', source: 'ELSTAT Census 2021 (προσέγγιση)' },
};
