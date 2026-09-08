-- 0048_user_theme
--
-- Το χρωματικό θέμα του μέλους: ένα από τα τέσσερα χρώματα του λογότυπου
-- (navy, teal, burgundy, brown). Αλλάζει ολόκληρη την παλέτα της διεπαφής·
-- μόνο τα χρώματα ψήφου μένουν ίδια σε κάθε θέμα.
--
-- Αποθηκεύεται στον λογαριασμό, όπως το locale, ώστε να ακολουθεί το μέλος
-- σε κάθε συσκευή. Default 'navy': είναι το kyanós που είχε πάντα η
-- πλατφόρμα, οπότε κανένα υπάρχον μέλος δεν βλέπει αλλαγή.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'navy';

COMMENT ON COLUMN users.theme IS
  'Colour theme: navy | teal | burgundy | brown. Chosen by the member from the header.';
