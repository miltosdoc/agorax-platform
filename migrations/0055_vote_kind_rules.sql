-- 0055_vote_kind_rules
--
-- Κάθε κοινότητα ορίζει τους όρους για κάθε τύπο ψηφοφορίας.
--
-- Μέχρι τώρα υπήρχε ένα εύρος διάρκειας, μία πλειοψηφία και μία απαρτία για
-- όλα. Ένα καταστατικό όμως συνήθως θέλει περισσότερο χρόνο και αυξημένη
-- πλειοψηφία, μια δημοσκόπηση λιγότερο, και μια κοινότητα μπορεί να μη θέλει
-- καθόλου εκλογές. Ο συντάκτης επιλέγει μέσα στους όρους και δεν μπορεί να
-- τους παραβιάσει.
--
--   Απόφαση     — voting_min/max_hours, decision_majority, min_participation_pct
--   Καταστατικό — statute_*
--   Εκλογή      — election_* (σχετική πλειοψηφία: εκλέγεται ο πρώτος)
--   Δημοσκόπηση — poll_* (χωρίς πλειοψηφία και απαρτία: δεν αποφασίζει)
--
-- election_nominations_enabled / poll_suggestions_enabled: αν ο συντάκτης
-- μπορεί να ανοίξει φάση συνδιαμόρφωσης πριν από την κάλπη — υποψηφιότητες
-- για την εκλογή, προτάσεις απαντήσεων για τη δημοσκόπηση (βλ. 0056). Για
-- απόφαση και καταστατικό η συνδιαμόρφωση επιτρέπεται πάντα.
--
-- Η πλειοψηφία αποθηκεύεται ως όνομα κανόνα (simple | three_fifths |
-- two_thirds | three_quarters) ώστε η σύγκριση να είναι ακριβής: τα 2/3 ως
-- 0,6667 θα απέρριπταν ψηφοφορία ακριβώς δύο προς ένα. Η vote_pass_threshold
-- μένει ως έχει για τις παλιές γραμμές· η decision_majority παίρνει την τιμή
-- της εδώ, και από εδώ και πέρα διαβάζεται μόνο αυτή.
--
-- Οι προεπιλογές κάνουν κάθε τύπο να δουλεύει αμέσως σε κάθε κοινότητα και
-- αντιστοιχούν στο DEFAULT_VOTE_RULES του shared/proposal-kinds.ts.
--
-- Διορθώνεται επίσης μία ασυνέπεια: η min_participation_pct αποθηκεύεται ως
-- ποσοστό 0–100 (έτσι τη γράφουν η φόρμα ρυθμίσεων και η ψηφοφορία ρυθμίσεων),
-- αλλά ο υπολογισμός την έβλεπε ως λόγο 0–1. Διορθώνεται στον κώδικα· εδώ δεν
-- αλλάζει καμία τιμή.

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS decision_majority TEXT NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS statute_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS statute_min_hours INTEGER NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS statute_max_hours INTEGER NOT NULL DEFAULT 720,
  ADD COLUMN IF NOT EXISTS statute_majority TEXT NOT NULL DEFAULT 'two_thirds',
  ADD COLUMN IF NOT EXISTS statute_min_participation_pct NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS election_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS election_min_hours INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS election_max_hours INTEGER NOT NULL DEFAULT 336,
  ADD COLUMN IF NOT EXISTS election_min_participation_pct NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS election_nominations_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS poll_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS poll_min_hours INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS poll_max_hours INTEGER NOT NULL DEFAULT 336,
  ADD COLUMN IF NOT EXISTS poll_suggestions_enabled BOOLEAN NOT NULL DEFAULT true;

-- Carry any existing decimal threshold over to the named rule.
UPDATE communities SET decision_majority = CASE
    WHEN vote_pass_threshold >= 0.75 THEN 'three_quarters'
    WHEN vote_pass_threshold >= 0.66 THEN 'two_thirds'
    WHEN vote_pass_threshold >= 0.6 THEN 'three_fifths'
    ELSE 'simple'
  END
WHERE decision_majority = 'simple' AND vote_pass_threshold IS NOT NULL;

COMMENT ON COLUMN communities.decision_majority IS
  'Majority a decision needs: simple (>1/2) | three_fifths | two_thirds | three_quarters (at least). Supersedes vote_pass_threshold.';
COMMENT ON COLUMN communities.statute_majority IS
  'Majority a statute vote needs, same values as decision_majority.';
