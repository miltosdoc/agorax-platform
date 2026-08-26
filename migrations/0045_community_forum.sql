-- 0045_community_forum
--
-- Η αγορά της κοινότητας: νήματα συζήτησης που δεν κρέμονται από πρόταση.
--
-- Γιατί χωριστός πίνακας και όχι επέκταση του debate_threads: εκείνος σβήνεται
-- μαζί με την πρόταση (ON DELETE CASCADE στο proposal_id) και το επίπεδο των
-- διαδρομών επιβάλλει «μόνο όσο η πρόταση διαβουλεύεται». Δύο κύκλοι ζωής στον
-- ίδιο πίνακα σημαίνει ότι ο ένας θα σβήσει κάποτε τον άλλο.
--
-- Το σχήμα είναι σκόπιμα το ίδιο (parent_id προς τον εαυτό του, up/down
-- ψήφοι, μοναδικότητα ψήφου ανά χρήστη) ώστε να διαβάζεται από όποιον ξέρει
-- ήδη τον διάλογο των προτάσεων.

-- ── Αναρτήσεις ──────────────────────────────────────────────────────────────
-- parent_id NULL  → θέμα, έχει τίτλο
-- parent_id ορισμένο → απάντηση σε θέμα, χωρίς τίτλο (ένα επίπεδο, όχι δέντρο)
CREATE TABLE IF NOT EXISTS community_posts (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  parent_id INTEGER REFERENCES community_posts(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  -- Ταξινόμηση κατά ζωντάνια, όχι κατά ημερομηνία γέννησης: ένα θέμα του
  -- περασμένου μήνα που συζητιέται σήμερα ανήκει στην κορυφή.
  last_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- ── Συντονισμός ──────────────────────────────────────────────────────────
  -- hidden_by NULL ενώ hidden_at ορισμένο σημαίνει «το έκρυψε η πλειοψηφία
  -- των μελών», που είναι ο μόνος τρόπος σε αυτόνομη κοινότητα.
  hidden_at TIMESTAMP,
  hidden_by INTEGER REFERENCES users(id),
  hidden_reason TEXT,
  -- Διαγραφή από τον ίδιο τον συντάκτη. Η γραμμή μένει ώστε να μη σπάσει το
  -- νήμα των απαντήσεων· το κείμενο δεν επιστρέφεται ποτέ ξανά.
  deleted_at TIMESTAMP,

  -- ── Προαγωγή σε πρόταση ──────────────────────────────────────────────────
  -- Ο λόγος ύπαρξης της αγοράς: το νήμα δεν είναι παράλληλη αίθουσα, είναι
  -- ο προθάλαμος. ON DELETE SET NULL ώστε η διαγραφή μιας πρότασης να μη
  -- σβήνει τη συζήτηση από την οποία γεννήθηκε.
  promoted_proposal_id INTEGER REFERENCES proposals(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Η λίστα θεμάτων μιας κοινότητας είναι η μόνη «καυτή» ερώτηση.
CREATE INDEX IF NOT EXISTS community_posts_topics_idx
  ON community_posts (community_id, parent_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_parent_idx
  ON community_posts (parent_id, created_at);

-- Ένα θέμα έχει τίτλο, μια απάντηση δεν έχει. Επιβάλλεται στη βάση επειδή
-- είναι ο μόνος διαχωρισμός των δύο ειδών γραμμής.
ALTER TABLE community_posts DROP CONSTRAINT IF EXISTS community_posts_title_shape;
ALTER TABLE community_posts ADD CONSTRAINT community_posts_title_shape CHECK (
  (parent_id IS NULL AND title IS NOT NULL AND length(btrim(title)) > 0)
  OR (parent_id IS NOT NULL AND title IS NULL)
);

-- ── Ψήφοι χρησιμότητας ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_post_votes (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS community_post_vote_unique
  ON community_post_votes (post_id, user_id);

-- ── Σημάνσεις συντονισμού ───────────────────────────────────────────────────
-- Μία γραμμή ανά μέλος ανά ανάρτηση: 'hide' είναι η αναφορά, 'keep' είναι η
-- υπεράσπιση. Σε αυτόνομη κοινότητα αυτές οι δύο τιμές είναι η κρίση — δεν
-- υπάρχει διαχειριστής να την πάρει. Η αιτιολογία συνοδεύει την πρώτη 'hide'.
CREATE TABLE IF NOT EXISTS community_post_flags (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS community_post_flag_unique
  ON community_post_flags (post_id, user_id);
CREATE INDEX IF NOT EXISTS community_post_flags_post_idx
  ON community_post_flags (post_id, direction);
