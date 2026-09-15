-- 0051_vote_chain_anchors
--
-- Εξωτερική αγκύρωση της αλυσίδας ψήφων.
--
-- Η αλυσίδα SHA-256 ανά πρόταση είναι ανιχνεύσιμη σε αλλοίωση μόνο εφόσον
-- κάποιος εκτός του διακομιστή γνωρίζει ποιο ήταν το head hash σε δεδομένη
-- στιγμή. Χωρίς αυτό, ο διαχειριστής μπορεί να ξαναγράψει ολόκληρη την
-- αλυσίδα και να ξαναϋπολογίσει όλα τα hash. Ο πίνακας κρατά το ιστορικό
-- των δημοσιεύσεων του head hash σε εξωτερικό αποθετήριο (GitHub), ώστε
-- τρίτος να μπορεί να συγκρίνει το δημοσιευμένο με το τρέχον.
--
-- Κάθε εγγραφή δεσμεύει την προηγούμενη (prev_anchor_hash → anchor_hash),
-- οπότε και η ίδια η ακολουθία αγκυρώσεων είναι αλυσίδα.

CREATE TABLE IF NOT EXISTS vote_chain_anchors (
  id serial PRIMARY KEY,
  proposal_id integer NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  phase text NOT NULL,                       -- 'open' (σε ψηφοφορία) | 'final' (μετά το κλείσιμο)
  head_hash text NOT NULL,                   -- head της αλυσίδας τη στιγμή της αγκύρωσης
  total integer NOT NULL,                    -- πλήθος γραμμών στην αλυσίδα
  verify_ok boolean NOT NULL,                -- αποτέλεσμα πλήρους επανυπολογισμού της αλυσίδας
  captured_at timestamp NOT NULL,            -- πότε διαβάστηκε το head
  prev_anchor_hash text NOT NULL,            -- anchor_hash της προηγούμενης εγγραφής (ή 64 μηδενικά)
  anchor_hash text NOT NULL,                 -- SHA-256 της κανονικής μορφής της εγγραφής
  record text NOT NULL,                      -- η γραμμή ακριβώς όπως δημοσιεύθηκε
  remote text NOT NULL,                      -- π.χ. github:miltosdoc/agorax-platform@anchors
  remote_commit text,                        -- SHA του commit στο εξωτερικό αποθετήριο
  remote_url text,                           -- σύνδεσμος προς το commit
  anchored_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vote_chain_anchors_head_unique
  ON vote_chain_anchors (proposal_id, phase, head_hash);
CREATE INDEX IF NOT EXISTS vote_chain_anchors_proposal_idx
  ON vote_chain_anchors (proposal_id, id);
