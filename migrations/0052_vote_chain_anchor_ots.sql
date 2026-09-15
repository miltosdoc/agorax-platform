-- 0052_vote_chain_anchor_ots
--
-- Χρονοσήμανση κάθε αγκύρωσης στο Bitcoin μέσω OpenTimestamps.
--
-- Το GitHub αποδεικνύει ότι δημοσιεύσαμε ένα αποτύπωμα, αλλά το αποθετήριο
-- είναι δικό μας. Το OpenTimestamps δεσμεύει το anchor_hash σε block του
-- Bitcoin, που κανείς δεν μπορεί να ξαναγράψει. Η απόδειξη (.ots) γίνεται
-- πλήρης λίγες ώρες μετά, όταν επιβεβαιωθεί η συναλλαγή του calendar server,
-- και τότε δημοσιεύεται και αυτή στο αποθετήριο αγκυρώσεων.

ALTER TABLE vote_chain_anchors
  ADD COLUMN IF NOT EXISTS ots_status text,                 -- 'pending' | 'complete' | 'failed' | NULL (δεν έχει σταλεί)
  ADD COLUMN IF NOT EXISTS ots_proof bytea,                 -- το αρχείο .ots (εκκρεμές ή πλήρες)
  ADD COLUMN IF NOT EXISTS ots_stamped_at timestamp,        -- πότε στάλθηκε στους calendar servers
  ADD COLUMN IF NOT EXISTS ots_upgraded_at timestamp,       -- πότε έγινε πλήρης η απόδειξη
  ADD COLUMN IF NOT EXISTS ots_bitcoin_height integer,      -- block του Bitcoin που τη δεσμεύει
  ADD COLUMN IF NOT EXISTS ots_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ots_last_error text,
  ADD COLUMN IF NOT EXISTS ots_remote_url text;             -- σύνδεσμος προς το δημοσιευμένο .ots

CREATE INDEX IF NOT EXISTS vote_chain_anchors_ots_status_idx
  ON vote_chain_anchors (ots_status, ots_stamped_at);
