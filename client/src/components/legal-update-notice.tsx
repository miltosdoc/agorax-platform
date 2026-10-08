import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { Button } from "@/components/ui/button";
import { LEGAL_NOTICE_VERSION } from "@shared/legal-notice-version";

/** Acknowledges that an update was shown, never consent or acceptance of terms. */
export default function LegalUpdateNotice() {
  const { user } = useAuth();
  const { locale } = useTranslation();
  const [seenKey, setSeenKey] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const key = user ? `agorax-legal-update-${user.id}-${LEGAL_NOTICE_VERSION}` : null;
  const en = locale === "en";

  useEffect(() => {
    setSeenKey(key);
    if (!key) { setVisible(false); return; }
    try { setVisible(localStorage.getItem(key) !== "seen"); }
    catch { setVisible(true); }
  }, [key]);

  if (!key || seenKey !== key || !visible) return null;

  function dismiss() {
    if (key) {
      try { localStorage.setItem(key, "seen"); } catch { /* The notice remains readable without storage. */ }
    }
    setVisible(false);
  }

  return (
    <aside aria-label={en ? "Updated terms and privacy notice" : "Ενημέρωση όρων και απορρήτου"}
      className="border-b border-line bg-kyanos-wash px-4 py-3 text-sm text-ink" data-testid="legal-update-notice">
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{en ? "Terms and privacy updated" : "Ενημερώθηκαν οι όροι και το απόρρητο"} · {LEGAL_NOTICE_VERSION}</p>
          <p>{en
            ? "We clarified responsibility for user views and added public content reporting and human review."
            : "Διευκρινίσαμε την ευθύνη για τις απόψεις των χρηστών και προσθέσαμε δημόσιες αναφορές περιεχομένου και ανθρώπινη εξέταση."}</p>
          <nav className="flex flex-wrap gap-x-4" aria-label={en ? "Read the changes" : "Διαβάστε τις αλλαγές"}>
            <a href="/terms" className="inline-flex min-h-11 items-center text-kyanos underline">{en ? "Terms" : "Όροι"}</a>
            <a href="/privacy" className="inline-flex min-h-11 items-center text-kyanos underline">{en ? "Privacy" : "Απόρρητο"}</a>
            <a href="/report-content" className="inline-flex min-h-11 items-center text-kyanos underline">{en ? "Report content" : "Αναφορά περιεχομένου"}</a>
          </nav>
        </div>
        <Button variant="outline" onClick={dismiss}>{en ? "Dismiss notice" : "Κλείσιμο ενημέρωσης"}</Button>
      </div>
    </aside>
  );
}
