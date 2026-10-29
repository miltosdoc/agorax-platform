-- 0063_consent_anonymous_ballots
--
-- Νέες προτάσεις δεν μπορούν πλέον να έχουν ψευδώνυμη ψηφοφορία, οπότε το
-- κείμενο συναίνεσης δεν περιγράφει πια δύο τρόπους: η ψήφος στις
-- ψηφοφορίες των προτάσεων είναι ανώνυμη, και αναφέρονται ρητά οι
-- ενέργειες που μένουν επώνυμες (shared/consent.ts,
-- CURRENT_CONSENT_VERSION = 2026-10-29.2).
--
-- Όπως στο 0057: ξαναγίνεται true το requires_consent για όποιον δεν έχει
-- αποδεχτεί ακόμη τη νέα έκδοση. Τρέχει με ασφάλεια και δεύτερη φορά.

UPDATE "users" SET "requires_consent" = true
WHERE "requires_consent" = false
  AND NOT EXISTS (
    SELECT 1 FROM "user_consents" c
    WHERE c."user_id" = "users"."id"
      AND c."consent_version" = '2026-10-29.2'
      AND c."withdrawn_at" IS NULL
  );
