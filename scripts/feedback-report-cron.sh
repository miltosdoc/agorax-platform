#!/bin/sh
# Ημερήσια παραγωγή της αναφοράς ανατροφοδότησης — καλείται από το crontab του
# root (03:20 UTC). Η εντολή μένει εδώ και όχι μέσα στο crontab ώστε το
# πρόγραμμα να είναι ορατό σε όποιον διαβάζει το αποθετήριο.
#
#   20 3 * * * /opt/agorax/scripts/feedback-report-cron.sh 2>&1 | logger -t agorax-feedback
#
# Ο φάκελος feedback/ είναι εκτός git: η αναφορά ζει μόνο στον διακομιστή και
# διαβάζεται από το /admin/feedback-review, που τη σερβίρει από τον δίσκο — δεν
# χρειάζεται ούτε build ούτε επανεκκίνηση της υπηρεσίας για να ανανεωθεί.
#
# Έλεγχος τελευταίας εκτέλεσης:  journalctl -t agorax-feedback --since yesterday
set -eu
cd /opt/agorax
exec /usr/bin/node scripts/feedback-report.mjs
