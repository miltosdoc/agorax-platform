-- 0056_proposal_option_suggestions
--
-- Συνδιαμόρφωση για εκλογή και δημοσκόπηση: τα μέλη φτιάχνουν μαζί το
-- ψηφοδέλτιο πριν ανοίξει η κάλπη.
--
-- Η συνδιαμόρφωση μιας απόφασης αλλάζει ένα κείμενο (τροπολογίες). Μια
-- εκλογή και μια δημοσκόπηση δεν έχουν κείμενο να αλλάξει κανείς· έχουν
-- επιλογές. Στη φάση τους τα μέλη:
--
--   εκλογή      — δηλώνουν υποψηφιότητα ή προτείνουν κάποιον
--   δημοσκόπηση — προσθέτουν απαντήσεις που λείπουν
--
-- Κάθε γραμμή εδώ είναι μία επιλογή. Στη λήξη της φάσης οι ενεργές γραμμές,
-- με τη σειρά που μπήκαν, γίνονται το ψηφοδέλτιο (proposals.ballot_options)
-- και η λίστα κλειδώνει. Οι αρχικές επιλογές του συντάκτη μπαίνουν κι αυτές
-- εδώ, ώστε να υπάρχει μία λίστα και όχι δύο.
--
-- nominee_user_id: συμπληρώνεται όταν κάποιος δήλωσε ο ίδιος υποψηφιότητα —
-- έτσι ο ίδιος μπορεί να την αποσύρει και δεν δηλώνει δεύτερη φορά.
-- Αφαιρεμένες επιλογές μένουν με removed_at, για να φαίνεται ότι υπήρξαν.

CREATE TABLE IF NOT EXISTS proposal_option_suggestions (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  nominee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  removed_at TIMESTAMP,
  removed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS proposal_option_suggestions_proposal_idx
  ON proposal_option_suggestions (proposal_id, created_at);

-- Το ίδιο όνομα δύο φορές στο ψηφοδέλτιο θα μοίραζε τις ψήφους.
CREATE UNIQUE INDEX IF NOT EXISTS proposal_option_suggestions_label_uniq
  ON proposal_option_suggestions (proposal_id, lower(label))
  WHERE removed_at IS NULL;

-- Μία ενεργή αυτοπρόταση ανά μέλος και εκλογή.
CREATE UNIQUE INDEX IF NOT EXISTS proposal_option_suggestions_nominee_uniq
  ON proposal_option_suggestions (proposal_id, nominee_user_id)
  WHERE removed_at IS NULL AND nominee_user_id IS NOT NULL;

-- Η μετάβαση προσχέδιο → συνδιαμόρφωση χωρίς έλεγχο κειμένου από το AI
-- (δεν υπάρχει κείμενο να ελεγχθεί) είναι κανόνας του κώδικα, όχι της βάσης.
