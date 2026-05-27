/**
 * Consent text and version — single source of truth for client + server.
 *
 * GDPR Art. 7 requires that consent be specific, informed, and revocable;
 * Art. 9(2)(a) requires that explicit consent be obtained for processing
 * special-category data (political opinions). The `consent_text_hash`
 * stored in `user_consents` is sha256 of CONSENT_TEXT[locale] for the
 * current version — so we can prove later *what exact text* a member saw.
 *
 * When updating the consent text:
 *   1. Bump CURRENT_CONSENT_VERSION (date-based, ISO YYYY-MM-DD).
 *   2. Update both `el` and `en` text.
 *   3. Members with prior versions will be re-prompted on next login
 *      (UI gate — see PR that lands the interstitial).
 */

export const CURRENT_CONSENT_VERSION = '2026-05-25';

export type ConsentLocale = 'el' | 'en';

/**
 * Canonical consent text. The exact bytes shown to the member determine
 * `consent_text_hash`. Do not edit casually — bump CURRENT_CONSENT_VERSION
 * if you change a character.
 */
export const CONSENT_TEXT: Record<ConsentLocale, string> = {
  el: `Συγκατάθεση για επεξεργασία δεδομένων ειδικής κατηγορίας — έκδοση ${CURRENT_CONSENT_VERSION}

Με την εγγραφή μου στην πλατφόρμα AgoraX της ΑΜΚΕ «Επανεκκίνηση Δημοκρατίας» συναινώ ρητά:

1. Στην επεξεργασία των πολιτικών μου απόψεων (ψήφοι, σχόλια, προτάσεις), που αποτελούν δεδομένα ειδικής κατηγορίας κατά το Άρθρο 9 του ΓΚΠΔ.
2. Στην ταυτοποίησή μου μέσω Gov.gr (αποθηκεύεται μόνο το hash του ΑΦΜ και τα ονομαστικά στοιχεία της Υπεύθυνης Δήλωσης — όχι το ίδιο το PDF).
3. Στην καταγραφή της δραστηριότητάς μου για λόγους πρόληψης κατάχρησης (διεύθυνση IP, αναγνωριστικό συσκευής).

Οι ψήφοι δεν είναι ανώνυμοι. Η σύνδεση ψήφος↔ταυτότητα είναι ανακτήσιμη από διαχειριστές της βάσης δεδομένων. Δείτε το Privacy Notice για όλες τις λεπτομέρειες.

Έχω το δικαίωμα να αποσύρω τη συγκατάθεσή μου ανά πάσα στιγμή (Άρθρο 7(3) ΓΚΠΔ), να ζητήσω πρόσβαση/διαγραφή των δεδομένων μου (Άρθρα 15–17), και να υποβάλω καταγγελία στην ΑΠΔΠΧ.`,

  en: `Consent to processing of special-category data — version ${CURRENT_CONSENT_VERSION}

By registering on the AgoraX platform of AMKE "Restart Democracy" I explicitly consent to:

1. Processing of my political opinions (votes, comments, proposals), which constitute special-category data under GDPR Article 9.
2. Identity verification via Gov.gr (only the salted hash of my AFM and the named demographics from the Solemn Declaration are retained — never the PDF itself).
3. Activity logging for abuse prevention (IP address, device fingerprint).

Votes are not anonymous. The vote↔identity linkage is reconstructable by database administrators. See the Privacy Notice for full details.

I have the right to withdraw consent at any time (Art. 7(3) GDPR), to request access to or erasure of my data (Art. 15–17), and to lodge a complaint with the Hellenic Data Protection Authority.`,
};

/** What a client sends back to acknowledge consent. */
export interface ConsentAcceptance {
  version: string;
  locale: ConsentLocale;
}

/** Validate a client-supplied consent block against the current canonical text. */
export function validateConsent(input: unknown): ConsentAcceptance | null {
  if (typeof input !== 'object' || input === null) return null;
  const obj = input as Record<string, unknown>;
  if (obj.version !== CURRENT_CONSENT_VERSION) return null;
  if (obj.locale !== 'el' && obj.locale !== 'en') return null;
  return { version: CURRENT_CONSENT_VERSION, locale: obj.locale };
}
