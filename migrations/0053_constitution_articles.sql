-- 0053_constitution_articles
--
-- Άρθρα Συντάγματος γραμμένα από AI, ένα ανά εγκεκριμένη απόφαση και γλώσσα.
--
-- Το Σύνταγμα συντίθεται σε κάθε αίτημα από τις ρυθμίσεις και τις ψηφοφορίες
-- (server/utils/constitution.ts). Η εκδοχή AI ξαναγράφει κάθε απόφαση ως
-- άρθρο· αυτό κοστίζει μια κλήση LLM, οπότε το αποτέλεσμα κρατιέται εδώ και
-- ξαναγράφεται μόνο όταν αλλάξει το κείμενο της απόφασης (source_hash).
-- Δεσμευτικό παραμένει το αυθεντικό κείμενο της απόφασης.

CREATE TABLE IF NOT EXISTS constitution_articles (
  proposal_id integer NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  lang text NOT NULL,                    -- 'el' | 'en'
  source_hash text NOT NULL,             -- sha256 του ερωτήματος + κειμένου που υιοθετήθηκε
  normative boolean NOT NULL,            -- false: δημοσκόπηση/δοκιμή/κάλεσμα ιδεών, όχι κανόνας
  title text NOT NULL,
  body text NOT NULL,
  model text,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, lang)
);
