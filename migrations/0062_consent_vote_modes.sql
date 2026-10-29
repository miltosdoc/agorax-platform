-- 0062_consent_vote_modes
--
-- Το κείμενο συναίνεσης έλεγε ότι οι ψήφοι δεν είναι ανώνυμοι. Αυτό ίσχυε
-- πριν από την ανώνυμη ψηφοφορία με τυφλές υπογραφές· σήμερα η ανώνυμη
-- ψηφοφορία είναι η προεπιλογή και μόνο η ψευδώνυμη συνδέει ψήφο και
-- ταυτότητα. Το νέο κείμενο περιγράφει τους δύο τρόπους και ονομάζει τη
-- σελίδα /privacy με τον ελληνικό της τίτλο (shared/consent.ts,
-- CURRENT_CONSENT_VERSION = 2026-10-29.1).
--
-- Όπως στο 0057: ξαναγίνεται true το requires_consent για όποιον δεν έχει
-- αποδεχτεί ακόμη τη νέα έκδοση. Τρέχει με ασφάλεια και δεύτερη φορά.

UPDATE "users" SET "requires_consent" = true
WHERE "requires_consent" = false
  AND NOT EXISTS (
    SELECT 1 FROM "user_consents" c
    WHERE c."user_id" = "users"."id"
      AND c."consent_version" = '2026-10-29.1'
      AND c."withdrawn_at" IS NULL
  );
