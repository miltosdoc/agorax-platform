# Threat Model — Identity & Vote Anonymity

**Date:** 2026-05-31
**Scope:** Closed bench-test deployment (100–1,000 invited members)
**Architecture:** Two-path voting — pseudonymous (default, consultative) and anonymous (blind-signed, binding)

---

## Rejected Designs — with reasoning

### REJECTED-A: Token = f(AFM) / hash(AFM) (deterministic derivation)

**Proposal:** Derive the voting token deterministically from the member's AFM (e.g., SHA256(AFM + salt) or HMAC(AFM, key)).

**Rejected because:**

Greek AFM is 9 digits → ~10⁹ space → ~30 bits of entropy. Any deterministic function f(AFM) lets an attacker with the vote records enumerate all possible AFMs, compute f(AFM) for each, and match against stored tokens. This is a rainbow-table attack on low-entropy input — trivially brute-forceable in minutes.

"We don't store the AFM" doesn't save you. The AFM is enumerable. The token is a pseudonym, not an anonymiser. Under GDPR Recital 26, data where the key exists is personal data — still in scope, still a liability.

**What we do instead:** Token is a random 256-bit value generated client-side via CSPRNG, independent of AFM. The blind signature proves the Eligibility Service authorised it without learning its value.

---

### REJECTED-B: One persistent token "for everything" (per-user, reused)

**Proposal:** Issue each member a single token at onboarding, reused across all votes.

**Rejected because:**

A single reused token forms a persistent pseudonym. Every vote by the same person across all issues becomes linkable. With 100–1,000 members and observable positions, knowing someone's stance on 3–4 issues re-identifies them via correlation. The token becomes a fingerprint.

**What we do instead:** Fresh, independent blind-signed token per vote. The Eligibility Service tracks "issued token for vote_N?" per user, but the tokens themselves are cryptographically unlinkable. No two votes by the same member can be correlated at the token level.

---

### REJECTED-C: Selfie / facial verification instead of AFM

**Proposal:** Replace AFM-based uniqueness with selfie + liveness check.

**Rejected because:**

1. **No uniqueness.** A selfie proves "a human face," not "one unique entitled citizen." Multiple angles of the same face, photos from the web, or AI-generated faces all yield "unique" non-citizens. The one-person-one-account foundation collapses.

2. **GDPR Article 9.** Face deduplication requires storing biometric templates — special-category data with stricter obligations than AFM. For a political-movement platform, holding a registry of activists' faces is maximally damaging in a breach and irreversible (you cannot reissue a face).

3. **Breaks unlinkability.** A face is the most permanent identifier possible. Any system that sees your face at onboarding and your vote at casting can correlate them.

4. **Anti-spoofing is hard and costly.** Third-party vendor → another processor seeing members' faces. DIY build → spoofable.

5. **Borrow trust, don't manufacture it.** Greece has advanced gov.gr identity infrastructure. Bypassing it for a phone camera reproduces state identity worse, costlier, with higher GDPR + political risk.

**What we do instead:** gov.gr authentication provides state-grade liveness + auth. The residual risk (someone possessing a deceased relative's live credentials) is the same bound every gov.gr-based service in Greece operates under, including the state itself.

---

### REJECTED-D: Helios-style homomorphic encryption

**Proposal:** Use a homomorphic scheme (Helios) for universal verifiability of the tally.

**Rejected because:**

Homomorphic encryption retains an identity → ciphertext linkage. Under GDPR Recital 26, the key exists (the encryption key maps ciphertext to identity), so the data is pseudonymous personal data — still in GDPR scope. Plus heavy trustee/key-ceremony overhead unjustified at bench scale.

**What we do instead:** Blind signatures give true anonymisation (linkage does not exist → vote record is out of GDPR scope). The trade-off: no universal verifiability of the tally. The member knows their own vote counted (they hold the token). At bench scale with a trusted operator, this is acceptable.

If public verifiability becomes a hard requirement at scale-up, the correct upgrade is a mixnet (e.g. Verificatum) giving both unlinkability and verifiability — significantly heavier; not now.

---

## Known Residual Risks

### R1: Participation inference from issuance ledger

The `blind_sig_issuance` table records `(user_id, proposal_id, issued_at)`. The operator knows who participated, even if they don't know the choice. In small electorates (100–1,000), participation + tally can enable probabilistic inference: if user X issued a token and the tally shows exactly N yes votes, removing user X changes the ratio.

**Mitigation:** Accepted trade-off. The issuance ledger is necessary for one-token-per-user enforcement. At bench scale, the social context (known cohort) makes participation inference less actionable. At scale-up, consider a mixnet or threshold issuance.

### R2: Hand-rolled blind-signature implementation

The current implementation (`shared/blind-sig.ts`) uses pure BigInt arithmetic with no external dependency. It passes test vectors in `tests/integration/blind-sig.test.ts` but has not received independent cryptographic review.

**Mitigation:** Documented as a known risk. For binding elections, replace with a reviewed library (e.g., a vetted RSA blind-signature implementation) and obtain independent cryptographic review. This is tracked as gap G11 in the audit.

### R3: Client-side token generation

The token is generated in the browser via `crypto.getRandomValues()`. A compromised browser or malicious extension could observe the token before blinding.

**Mitigation:** The blind signature still protects the server — even if the client is compromised, the server never sees the unblinded token. The threat is the attacker learning the token and later correlating it to the vote, which requires the attacker to also observe the anonymous-vote request. At bench scale, this is a non-issue.

### R4: Dead AFM / sybil via deceased

A deceased person's AFM could theoretically be used if someone possesses their live gov.gr credentials. The gov.gr login requires live TaxisNet credentials + factors, so a deceased person does not authenticate. The residual risk is narrowed to someone who possesses a deceased relative's live credentials — the same bound every gov.gr-based service operates under.

**Mitigation:** At bench scale (100–1,000 invited members), a deceased member would be noticed socially long before code would catch it. At scale-up, cross-check against the death registry (Μητρώο Πολιτών) if API access is obtained.

### R5: Coerced voting / vote selling

Blind signatures protect against server-side linkage but not against a coerced voter showing their receipt to the coercer. The client stores the receipt in `localStorage`, which the voter can screenshot.

**Mitigation:** This is a physical-world threat, not a cryptographic one. Deniable receipt verification (`/verify-receipt`) is designed so anyone holding a token can verify it — the result cannot be used to prove how a specific person voted. At bench scale with a trusted operator, coercion is a social, not technical, problem.

---

## Acceptance Test

**Question:** "If I hand you the complete database dump and the entire codebase, can you reconstruct what AFM/member X voted?"

**Answer for anonymous mode (after fixes):**

- **Database-only:** NO — `proposal_votes` stores `vote_token` (40 bytes: 32 random + 8 expiry) with `user_id = NULL`. The token is a random value with no derivable relationship to AFM.
- **Database + application logs:** NO — vote endpoints (`/blind-sign`, `/anonymous-vote`, `/verify-receipt`, `/blind-key`) are excluded from application logging (§G7 fix).
- **Database + logs + session cookies:** NO — anonymous-vote request uses `credentials: 'omit'` (§G5 fix), so no session cookies are sent.
- **Database + logs + timing:** NO — token embeds a minimum cast time (30 minutes after issuance). Server rejects votes cast before this time (§G2 fix). Timestamps in the row hash are coarsened to minute precision for anonymous votes (§G12 fix).
- **Database + logs + device fingerprint:** NO — device fingerprint is captured on the authenticated path (login/signup) but not on the anonymous-vote path.
- **Database + logs + IP:** NO — no IP logging on vote endpoints. `account_activity` table logs IP for login/registration only, not voting.

**The system is constructively incapable of answering the question.** The linkage does not exist in any store, log, or derivable join.

---

*This document records rejected designs with their reasoning so they are not re-litigated later. Update when the threat model changes.*
