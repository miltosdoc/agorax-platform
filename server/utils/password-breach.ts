/**
 * Rejects passwords that appear in known breach corpora.
 *
 * ## Why this instead of complexity rules
 *
 * NIST SP 800-63B dropped composition rules ("one uppercase, one symbol") and
 * forced rotation: both push people toward `Password1!` and sticky notes. What
 * it recommends instead is checking the chosen password against lists of
 * previously breached secrets. `Password123456` clears any length or
 * complexity rule and is in every cracking dictionary on earth; that is the
 * case this catches and a longer minimum length does not.
 *
 * ## Privacy — the password never leaves this server
 *
 * Uses the Have I Been Pwned range API with k-anonymity: we SHA-1 the password,
 * send only the **first five hex characters** of the digest, and receive every
 * suffix sharing that prefix (~800 rows). The comparison happens locally. The
 * service cannot learn the password, and cannot even tell which of the returned
 * hashes was the one asked about.
 *
 * ## Fails open, deliberately
 *
 * If the lookup errors or times out, registration proceeds. A third-party
 * outage must not become an outage of the platform's sign-up path. The check
 * is a filter on bad passwords, not an authentication control.
 *
 * Set `PASSWORD_BREACH_CHECK=false` to disable entirely — for air-gapped or
 * self-contained deployments that must make no outbound calls.
 */

import { createHash } from "crypto";

const API = "https://api.pwnedpasswords.com/range";
const TIMEOUT_MS = 2500;

export function breachCheckEnabled(): boolean {
  return process.env.PASSWORD_BREACH_CHECK !== "false";
}

/**
 * True when the password is known to have been breached.
 * Returns false on any error — see "fails open" above.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  if (!breachCheckEnabled() || !password) return false;

  const digest = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API}/${prefix}`, {
      signal: controller.signal,
      // Pads the response with random rows so its size leaks nothing either.
      headers: { "Add-Padding": "true", "User-Agent": "AgoraX" },
    });
    if (!res.ok) return false;

    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, countRaw] = line.trim().split(":");
      if (hashSuffix !== suffix) continue;
      // Padding rows are inserted with a count of 0; a real hit has count > 0.
      return Number(countRaw ?? 0) > 0;
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
