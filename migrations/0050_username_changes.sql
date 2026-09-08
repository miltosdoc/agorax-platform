-- 0050_username_changes
--
-- Το όνομα χρήστη γίνεται επεξεργάσιμο.
--
-- Μέχρι τώρα οριζόταν μία φορά, στην εγγραφή, και δεν άλλαζε ποτέ. Όποιος
-- μπήκε με Google δεν το επέλεξε καν: παραγόταν από το display name της
-- Google, πεζά και χωρίς κενά, με αριθμό στο τέλος αν ήταν πιασμένο.
--
-- Η στήλη κρατά πότε έγινε η τελευταία αλλαγή, ώστε να ισχύει η αναμονή
-- μεταξύ δύο αλλαγών. NULL σημαίνει «δεν άλλαξε ποτέ», που είναι η αλήθεια
-- για κάθε υπάρχοντα λογαριασμό, και επιτρέπει την πρώτη αλλαγή αμέσως.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMP;

COMMENT ON COLUMN users.username_changed_at IS
  'When the member last changed their username. NULL = never changed.';
