-- 0046_agora2026_identity_and_shelves
--
-- Ό,τι ζητάει η νέα σχεδίαση (AGORA 2026) και δεν υπήρχε στο σχήμα.
--
-- Δύο κατηγορίες αλλαγών, σκόπιμα σε ένα αρχείο επειδή γεννιούνται από την
-- ίδια αιτία και δεν έχει νόημα να μπει η μία χωρίς την άλλη:
--
--   1. Ταυτότητα κοινότητας — οι κάρτες της νέας σχεδίασης δείχνουν εξώφυλλο,
--      άβαταρ, κατηγορία, περιοχή, γλώσσα και ιστοσελίδα. Καμία από αυτές τις
--      στήλες δεν υπήρχε· η κάρτα σήμερα έχει μόνο όνομα και περιγραφή.
--   2. «Ράφια» — σελιδοδείκτες, ετικέτες, συναντήσεις, εγγραφές newsletter και
--      κατακτήσεις. Καθένα είναι δικό του πράγμα με δικό του κύκλο ζωής.
--
-- Ό,τι ΔΕΝ μπαίνει εδώ: οι δωρεές. Στη σχεδίαση είναι ένα κουμπί που βγάζει
-- έξω από την πλατφόρμα, όχι ροή πληρωμών· ζει ως ρύθμιση (platform_settings),
-- όχι ως πίνακας.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Ταυτότητα κοινότητας
-- ════════════════════════════════════════════════════════════════════════════

-- Το @username της σχεδίασης. Nullable επειδή οι 18 υπάρχουσες κοινότητες δεν
-- έχουν — δεν εφευρίσκουμε χειρωνακτικά ονόματα για λογαριασμό τους· η κάρτα
-- πέφτει πίσω στο id όσο λείπει.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS communities_username_unique
  ON communities (lower(username)) WHERE username IS NOT NULL;

-- Εξώφυλλο 2:1 και άβαταρ 1:1, όπως στις κάρτες. Διαδρομές αρχείων σχετικές
-- ως προς το AGORAX_MEDIA_DIR — ίδια σύμβαση με το community_media, ώστε να
-- μη γεννηθεί δεύτερος τρόπος αποθήκευσης εικόνων.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS cover_path TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS avatar_path TEXT;

-- Το tagline κάτω από το banner της κοινότητας.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS tagline TEXT;

-- Οι κατηγορίες των φίλτρων («ΟΛΕΣ / ΚΟΙΝΩΝΙΑ / ΠΕΡΙΒΑΛΛΟΝ / …»). Κρατιέται
-- ως κείμενο με CHECK και όχι ως enum: η λίστα είναι σχεδιαστική απόφαση που
-- θα αλλάξει, και ένα enum στην Postgres δεν συρρικνώνεται.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_category_known;
ALTER TABLE communities ADD CONSTRAINT communities_category_known CHECK (
  category IS NULL OR category IN (
    'koinonia', 'perivallon', 'politiki', 'politismos',
    'oikonomia', 'allilengyi', 'ygeia'
  )
);

-- Περιοχή, γλώσσα, ιστοσελίδα: ο πίνακας στοιχείων της σελίδας κοινότητας.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'el';
ALTER TABLE communities ADD COLUMN IF NOT EXISTS website TEXT;

-- Η περιήγηση ανά κατηγορία είναι η μόνη νέα «καυτή» ερώτηση της λίστας.
CREATE INDEX IF NOT EXISTS communities_category_idx
  ON communities (category, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Σελιδοδείκτες
-- ════════════════════════════════════════════════════════════════════════════
-- Το εικονίδιο αποθήκευσης κάθεται σε ΚΑΘΕ κάρτα της σχεδίασης — κοινότητες,
-- προτάσεις, δημοσκοπήσεις, podcast, βίντεο. Πολυμορφικό κλειδί αντί για πέντε
-- πίνακες: δεν υπάρχει ξεχωριστή συμπεριφορά ανά είδος, μόνο ξεχωριστός
-- προορισμός. Χωρίς FK — γι' αυτό η ανάγνωση κάνει πάντα join με τον πίνακα
-- του είδους και οι ορφανές γραμμές απλώς δεν εμφανίζονται.
CREATE TABLE IF NOT EXISTS bookmarks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE bookmarks DROP CONSTRAINT IF EXISTS bookmarks_entity_known;
ALTER TABLE bookmarks ADD CONSTRAINT bookmarks_entity_known CHECK (
  entity_type IN ('community', 'proposal', 'survey', 'media', 'post')
);
CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_unique
  ON bookmarks (user_id, entity_type, entity_id);
-- «Οι σελιδοδείκτες μου», νεότεροι πρώτα.
CREATE INDEX IF NOT EXISTS bookmarks_user_idx
  ON bookmarks (user_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Ετικέτες
-- ════════════════════════════════════════════════════════════════════════════
-- Οι «Ετικέτες» της σελίδας κοινότητας. Το slug είναι το κλειδί ταύτισης ώστε
-- «Θεσσαλονίκη» και «θεσσαλονίκη» να μη γίνουν δύο ετικέτες.
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS tags_slug_unique ON tags (slug);

CREATE TABLE IF NOT EXISTS entity_tags (
  id SERIAL PRIMARY KEY,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE entity_tags DROP CONSTRAINT IF EXISTS entity_tags_entity_known;
ALTER TABLE entity_tags ADD CONSTRAINT entity_tags_entity_known CHECK (
  entity_type IN ('community', 'proposal', 'survey', 'media')
);
CREATE UNIQUE INDEX IF NOT EXISTS entity_tags_unique
  ON entity_tags (tag_id, entity_type, entity_id);
-- Οι ετικέτες ΕΝΟΣ αντικειμένου: η μόνη κατεύθυνση που διαβάζει η σελίδα.
CREATE INDEX IF NOT EXISTS entity_tags_entity_idx
  ON entity_tags (entity_type, entity_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Συναντήσεις κοινότητας
-- ════════════════════════════════════════════════════════════════════════════
-- Η κάρτα «Συναντήσεις Κοινότητας» με ημερομηνία, ώρα, τόπο και «Θα συμμετάσχω».
--
-- Γιατί χωριστά από τα livekit_rooms: το δωμάτιο είναι η τεχνική εγκατάσταση
-- που ζει όσο η κλήση, η συνάντηση είναι η ανακοίνωση που υπάρχει βδομάδες
-- πριν και μήνες μετά. Μια διαδικτυακή συνάντηση δείχνει σε δωμάτιο μέσω
-- room_id· μια δια ζώσης δεν έχει καθόλου.
CREATE TABLE IF NOT EXISTS community_meetings (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP,
  -- NULL τόπος + is_online = διαδικτυακά· αλλιώς διεύθυνση.
  location TEXT,
  is_online BOOLEAN NOT NULL DEFAULT TRUE,
  room_id INTEGER REFERENCES livekit_rooms(id) ON DELETE SET NULL,
  -- Το κόκκινο «ΕΚΤΑΚΤΗ» της σχεδίασης.
  is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
-- «Οι επόμενες συναντήσεις αυτής της κοινότητας» — η μόνη ερώτηση της κάρτας.
CREATE INDEX IF NOT EXISTS community_meetings_upcoming_idx
  ON community_meetings (community_id, starts_at);

CREATE TABLE IF NOT EXISTS meeting_rsvps (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES community_meetings(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'yes' | 'no' | 'maybe' — η κάρτα μετράει μόνο τα 'yes', αλλά το 'no'
  -- πρέπει να μπορεί να δηλωθεί ώστε να ανακαλείται ένα 'yes'.
  status TEXT NOT NULL DEFAULT 'yes',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE meeting_rsvps DROP CONSTRAINT IF EXISTS meeting_rsvps_status_known;
ALTER TABLE meeting_rsvps ADD CONSTRAINT meeting_rsvps_status_known CHECK (
  status IN ('yes', 'no', 'maybe')
);
CREATE UNIQUE INDEX IF NOT EXISTS meeting_rsvps_unique
  ON meeting_rsvps (meeting_id, user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Newsletter
-- ════════════════════════════════════════════════════════════════════════════
-- Η φόρμα «Μη χάνεις όσα συμβαίνουν» στο υποσέλιδο.
--
-- Χωριστά από τα email_notification_prefs επίτηδες: εκεί μιλάμε σε χρήστη με
-- λογαριασμό, εδώ σε διεύθυνση που μπορεί να μην ανήκει σε κανέναν. Το
-- confirmed_at είναι διπλή συγκατάθεση — καμία αποστολή πριν επιβεβαιωθεί.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'el',
  -- Δένεται με λογαριασμό όταν υπάρχει, ώστε η διαγραφή λογαριασμού (GDPR)
  -- να παρασύρει και την εγγραφή.
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  confirm_token TEXT,
  confirmed_at TIMESTAMP,
  unsubscribe_token TEXT NOT NULL,
  unsubscribed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_unique
  ON newsletter_subscribers (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_unsubscribe_token_unique
  ON newsletter_subscribers (unsubscribe_token);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Κατακτήσεις Δημοκρατίας
-- ════════════════════════════════════════════════════════════════════════════
-- Η τρίτη κάρτα της αριστερής στήλης: μια απόφαση που έγινε πράξη, με τον
-- αριθμό των συμμετεχόντων, τη διάρκεια της προσπάθειας και «Δες την ιστορία».
--
-- Δεν παράγεται αυτόματα από τις αποφασισμένες προτάσεις: το ότι μια πρόταση
-- ψηφίστηκε δεν σημαίνει ότι υλοποιήθηκε. Είναι επιμελημένη εγγραφή που
-- δείχνει πίσω στην πρόταση από την οποία γεννήθηκε.
CREATE TABLE IF NOT EXISTS democracy_achievements (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER REFERENCES proposals(id) ON DELETE SET NULL,
  community_id INTEGER REFERENCES communities(id) ON DELETE SET NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  story TEXT,
  region TEXT,
  image_path TEXT,
  participants_count INTEGER,
  -- Πόσο κράτησε από την υποβολή ως την υλοποίηση, σε μέρες.
  duration_days INTEGER,
  -- Μένει αδημοσίευτο ώσπου κάποιος το εγκρίνει· η κάρτα δείχνει μόνο
  -- δημοσιευμένα.
  published_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS democracy_achievements_published_idx
  ON democracy_achievements (published_at DESC NULLS LAST);
