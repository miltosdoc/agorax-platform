# Data Protection Impact Assessment (DPIA) — AgoraX

**Date:** 2026-05-31
**Version:** 1.0
**Data Controller:** e-Democracy NP.CO. (AgoraX platform operator)
**DPO:** [To be appointed — required for large-scale political processing]
**Legal basis:** Article 6(1)(a) — explicit consent for eligibility processing
**Special category:** Article 9(2)(a) — explicit consent for political opinion processing

---

## 1. Description of Processing

### 1.1 Nature, Scope, and Purpose

**Purpose:** Enable participatory democracy through anonymous voting on civic proposals.

**Processing activities:**
1. **Eligibility verification** — gov.gr authentication + AFM uniqueness check
2. **Account management** — persistent account with salted hash of AFM
3. **Token issuance** — blind-signed tokens per vote (anonymous)
4. **Vote casting** — anonymous vote submission via blind signature
5. **Tallying** — aggregate vote counts (no individual votes stored with identity)

**Data subjects:** Registered Greek citizens (100–1,000 for bench test, scaling to national)

### 1.2 Categories of Data Subjects

- Greek citizens with valid AFM
- Invited movement members (bench test)
- Political activists (scale-up)

### 1.3 Categories of Personal Data

| Data | Category | Stored? | Retention |
|------|----------|---------|-----------|
| AFM (raw) | Special category (political) | NO — transient only | Seconds during onboarding |
| gov.gr proof | Special category (political) | NO — transient only | Verify signature, then discard |
| account_hash | Pseudonymous identifier | YES | Account lifetime |
| registered flag | Pseudonymous identifier | YES | Account lifetime |
| has_token_for_vote_N | Pseudonymous boolean | YES | Per vote epoch |
| login IP | Personal data | YES | 90 days (security) |
| login timestamp | Personal data | YES | 90 days (security) |
| device fingerprint | Personal data | YES | 90 days (security) |
| vote_token | Anonymous (not personal) | YES | Per vote epoch |
| vote_choice | Anonymous (not personal) | YES | Per platform policy |

**Key distinction:** Vote data (vote_token + vote_choice) is **anonymous** by design — the blind signature ensures no linkage to identity exists. Anonymous data is **out of GDPR scope** (Recital 26).

---

## 2. Necessity and Proportionality

### 2.1 Eligibility Processing

**Necessity:** One-person-one-account requires identity verification. gov.gr authentication is the standard for Greek civic services.

**Proportionality:**
- AFM is used only as a uniqueness key, not stored
- Salted hash prevents reverse lookup
- gov.gr proof is discarded after verification
- Login IP retained only for security (fraud detection) with 90-day TTL

### 2.2 Vote Processing

**Necessity:** Anonymous voting is essential for free expression in political contexts. Secret ballot is a fundamental democratic principle.

**Proportionality:**
- Blind signatures ensure mathematical unlinkability
- No identifier stored with vote
- No IP logged on vote path
- No timing correlation possible (30-minute decoupling)

---

## 3. Risk Assessment

### 3.1 Risks to Data Subjects

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Vote↔identity linkage | LOW | HIGH | Blind signatures, service separation |
| AFM brute-force | LOW | HIGH | Salted hash, not stored |
| IP correlation | LOW | MEDIUM | No IP on vote path, 90-day TTL on login |
| Timing correlation | LOW | MEDIUM | 30-minute decoupling, minute-precision timestamps |
| DB breach | MEDIUM | HIGH | Encryption at rest, blind signatures break linkage |
| Rogue admin | LOW | HIGH | Blind signatures prevent linkage even for admin |
| SQLi | LOW | MEDIUM | Drizzle ORM parameterizes all queries |

### 3.2 Residual Risks

1. **Reverse proxy logs** — If nginx/caddy logs vote endpoints, timing correlation is possible. Mitigated by deployment hardening (DEPLOYMENT_HARDENING.md).

2. **Hand-rolled crypto** — Blind signature implementation uses pure BigInt arithmetic. Passes test vectors but lacks independent review. Acceptable for bench test; requires review for scale-up.

3. **Login IP retention** — 90-day retention for security purposes. Could be coarsened to city-level for additional privacy.

---

## 4. Safeguards

### 4.1 Technical Measures

- **Blind signatures** — Mathematical unlinkability between identity and vote
- **CSPRNG** — OS-level randomness for token generation
- **Encryption at rest** — AES-GCM for private keys
- **Logging exclusions** — Vote endpoints excluded from application logs
- **Time decoupling** — 30-minute minimum between token issuance and casting
- **Timestamp coarsening** — Minute-precision for anonymous votes

### 4.2 Organizational Measures

- **Access control** — Separate DB users for eligibility vs voting (scale-up)
- **Audit logging** — All eligibility-side actions logged
- **Incident response** — Breach notification within 72 hours (GDPR Article 33)
- **Data retention** — Defined TTLs for all personal data

---

## 5. Data Subject Rights

### 5.1 Right of Access (Article 15)

**What the subject can request:**
- Account hash (pseudonymous identifier)
- Registration date
- Login history (IP, timestamp, device)
- Token issuance history (has_token_for_vote_N booleans)

**What the subject cannot request:**
- Their own votes — by design, the system cannot link votes to subjects
- Other subjects' data — no access to other accounts

### 5.2 Right to Erasure (Article 17)

**What can be erased:**
- Account hash
- Login history
- Token issuance records
- Device fingerprint

**What cannot be erased:**
- Votes — anonymous by design, not linkable to subject
- Aggregate tally — statistical data, not personal

**Erasure process:**
1. Subject submits erasure request
2. System nullifies PII, retains voter_hash as anti-replay
3. Votes remain (anonymous, out of GDPR scope)
4. Confirmation sent to subject

### 5.3 Right to Portability (Article 20)

**What can be exported:**
- Account metadata (registration date, status)
- Login history
- Token issuance history

**What cannot be exported:**
- Votes — anonymous by design

---

## 6. Records of Processing Activities (Article 30)

### 6.1 Eligibility Processing

- **Controller:** e-Democracy NP.CO.
- **Purpose:** Identity verification for one-person-one-account
- **Data categories:** AFM (transient), gov.gr proof (transient), account_hash, login IP
- **Recipients:** None (data not shared with third parties)
- **Retention:** AFM — seconds; account_hash — account lifetime; login IP — 90 days
- **Security measures:** Salted hash, encryption at rest, access controls

### 6.2 Vote Processing

- **Controller:** e-Democracy NP.CO.
- **Purpose:** Anonymous voting on civic proposals
- **Data categories:** vote_token (anonymous), vote_choice (anonymous)
- **Recipients:** None
- **Retention:** Per vote epoch (until proposal closes)
- **Security measures:** Blind signatures, no logging, time decoupling

---

## 7. Conclusion

The AgoraX platform implements anonymous voting through blind signatures, ensuring that vote data is out of GDPR scope by design. The eligibility side processes personal data with defined retention periods and security measures.

**Overall risk level:** LOW — mitigated by cryptographic design and organizational controls.

**DPIA conclusion:** Processing is lawful, necessary, and proportional. Residual risks are acceptable for the bench-test deployment.

---

*This DPIA must be reviewed annually or when processing activities change significantly.*
