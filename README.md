# AgoraX: Digital Deliberative Democracy Engine

[![CI](https://github.com/miltosdoc/agoraxdemo/actions/workflows/ci.yml/badge.svg)](https://github.com/miltosdoc/agoraxdemo/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-81%20passing-brightgreen)](tests/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict%20mode-blue)](tsconfig.json)
[![License](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

**A deterministic governance engine that replaces human moderation with mathematical certainty.**

AgoraX implements the Demopolis framework as a production-grade deliberative democracy platform. It explicitly rejects polling application mechanics and standard comment sections. Instead, it enforces structured deliberation through a cryptographically secure, mathematically validated 8-state proposal lifecycle.

---

## 🏛️ Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AGORAX ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Frontend   │  │   Backend    │  │   Ballot     │              │
│  │   (React)    │  │   (Express)  │  │   (FastAPI)  │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                  │                      │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐              │
│  │  107 TSX     │  │  12 Domain   │  │  PDF Valid.  │              │
│  │  Components  │  │  Routers     │  │  SHA-256 Dedup│              │
│  └──────────────┘  └──────┬───────┘  └──────────────┘              │
│                           │                                         │
│  ┌────────────────────────▼──────────────────────────────────────┐  │
│  │                    DOMAIN REPOSITORIES                        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │  │
│  │  │  Users   │ │Communities│ │Proposals │ │Amendments│        │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │  │
│  │  │Sortition │ │  Voting  │ │  Debate  │ │Platform  │        │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
│                           │                                         │
│  ┌────────────────────────▼──────────────────────────────────────┐  │
│  │                    PostgreSQL + Drizzle ORM                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Cryptographic Security

### Sortition: Cryptographically Secure Random Selection

AgoraX implements Athenian-style sortition (random citizen selection) with production-grade cryptographic guarantees:

```typescript
// CSPRNG-backed Fisher-Yates with rejection sampling
function cryptographicallySecureShuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const limit = 256 - (256 % (i + 1)); // Rejection sampling threshold
    let bytes;
    do {
      bytes = new Uint8Array(1);
      crypto.getRandomValues(bytes); // Web Crypto API
    } while (bytes[0] >= limit); // Reject out-of-bounds values
    
    const j = bytes[0] % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
```

**Why this matters:** Standard `Math.random()` is predictable and vulnerable to manipulation. `crypto.getRandomValues()` provides CSPRNG-grade randomness. The rejection sampling eliminates modulo bias, ensuring statistically uniform distribution regardless of array size.

### Anti-Sybil Constraints

- **7-day membership minimum** before eligibility (prevents bot flooding)
- **Active panel exclusion** (users serving on a panel cannot be selected again)
- **Cryptographic seed recording** for auditability and verification

### Ratification Vote: Pluggable VotingBackend

The binding ratification vote (the final yes/no/abstain decision in the `voting` phase) is routed through a `VotingBackend` interface in `server/voting/`. The deliberation layer — proposals, sortition, amendments, debate — is unchanged regardless of which backend is active.

```typescript
interface VotingBackend {
  startElection(args): Promise<void>;
  castSignedBallot(input): Promise<BallotReceipt>;  // optional signature
  getTally(args): Promise<ElectionTally>;
  closeAndTally(args): Promise<ElectionTally & { proof }>;
  getProof(args): Promise<ElectionProof>;
  verify(args): Promise<VerificationResult>;
}
```

Configured via the `VOTING_BACKEND` env var. Today:

| Backend | Status | Guarantees | Limits |
|---|---|---|---|
| `hash-chain` (default) | ✅ Shipping | Tamper-evident inclusion via per-proposal SHA-256 chain. Any post-hoc edit breaks `/api/proposals/:id/election/verify`. | Cleartext votes; no defense against host-side ballot stuffing or full-history rewrite. |
| `electionguard` | 📋 Planned | ElGamal-encrypted ballots, ballot-validity ZK proofs, homomorphic tally, threshold-trustee decryption, public verifier. Host cannot decrypt individual votes. | Coercion-resistance still requires identity layer (Gov.gr verification). |
| `mobile-signed` | 🔮 Future | Voter-side signing in Secure Enclave / StrongBox. Server cannot forge ballots because it never holds the private key. | Requires the AgoraX mobile app. |

The `electionguard` backend will be powered by **`@agorax/voting`** — an in-house TypeScript implementation of the [ElectionGuard 2.1](https://www.electionguard.vote/) protocol, built on audited primitives (`@noble/curves`, `@noble/hashes`). The complete build plan, responsibility split, privacy checklist, and state-adversary threat model live in [`docs/VERIFIABLE_VOTING_SDK_PLAN.md`](docs/VERIFIABLE_VOTING_SDK_PLAN.md).

`castSignedBallot` already accepts an optional `BallotSignature` so the mobile signing piece can land without changing the API surface. The hash-chain backend ignores it; future backends require it.

**Why this design:** the trust model of "what can the host do?" depends entirely on the voting backend, while the deliberation experience does not. A research community can run with `hash-chain`; a high-stakes binding vote runs with `electionguard`; a national pilot pairs `mobile-signed` with Gov.gr-verified rolls. Same product, same routes, same UX.

**Public endpoints (all backends):**
- `POST /api/proposals/:id/vote` — cast a ballot, returns backend-defined receipt
- `GET  /api/proposals/:id/election/proof` — pinable artifact for external observers
- `GET  /api/proposals/:id/election/verify` — backend-internal consistency check

---

## 📊 Mathematical Algorithms

### Amendment Similarity: TF-IDF + Cosine Similarity

AgoraX uses 2D vector space mapping to mathematically evaluate text amendments:

```
TF-IDF Formula: log((N + 1) / (df + 1)) + 1
Cosine Similarity: cos(θ) = (A · B) / (||A|| × ||B||)
```

**What this achieves:**
- Groups amendments by thematic proximity
- Automatically deduplicates identical suggestions
- Distinguishes between improvements vs. counterproposals
- Preserves opposing viewpoints (not automatically deleted)

### Democracy Score: Composite Reputational Metric

A 0-100 composite score that acts as a reputational enforcement mechanism:

```
Score = f(admin_intervention, sortition_usage, participation_rate, deliberation_depth)
```

- High administrative intervention → score decreases
- Consistent sortition usage → score increases
- High participation + deliberation depth → score increases

---

## 🔄 8-State Proposal Lifecycle

```
Draft → Review → Synthesis → Author Review → Sortition → Voting → Archived
                                    ↓
                              (Conditional)
```

**Key properties:**
- **Unidirectional progression** — proposals cannot skip phases
- **Mathematically validated transitions** at the API level
- **Author veto power** with community override mechanism
- **LLM auto-approval** for absolute consensus cases (>90% agreement)

---

## 🏗️ Technical Architecture

### Domain-Driven Design

```
server/
├── routers/          # 12 domain-specific routers (avg 166 lines each)
├── storage/          # 9 domain repositories + legacy facade
├── utils/            # 19 utility modules
└── index.ts          # Express application entry point
```

### Quality Gates

| Metric | Value |
|--------|-------|
| TypeScript strict mode | ✅ Enabled |
| Test coverage | 81 tests, 100% passing |
| File size limit | <400 lines per file |
| JSDoc coverage | All public APIs documented |
| `any` type usage | Zero in production code |
| `console.log` statements | Zero in production code |
| Module boundary enforcement | Automated via `check-modularity.cjs` |

### Performance

- **Rate limiting**: 100 req/15min (API), 10 req/15min (auth), 5 req/min (voting)
- **Structured logging**: JSON output in production, colored in development
- **Health check endpoint**: `/health` with real-time memory metrics
- **Request timing**: Slow request detection (>500ms threshold)

---

## 🚀 Deployment

### Docker

```bash
# Build and run
docker build -t agorax .
docker run -p 3000:3000 -p 5173:5173 agorax

# Health check
curl http://localhost:3000/health
```

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
- Lint (ESLint)
- TypeCheck (TypeScript strict)
- Test (Vitest + PostgreSQL)
- Modularity check
- Build (Vite)
```

### Production Checklist

- [x] TypeScript strict mode
- [x] Rate limiting middleware
- [x] Structured logging
- [x] Health check endpoint
- [x] Docker multi-stage build
- [x] CI/CD pipeline
- [x] E2E test infrastructure
- [x] Database migration strategy
- [x] Performance benchmarking script
- [x] Playwright test suite (7 test files)
- [x] Load testing script
- [x] Security audit checklist
- [ ] Playwright test execution
- [ ] Load test results
- [ ] Security audit completion

---

## 📚 Documentation

- [API Reference](docs/API.md) — Complete endpoint documentation
- [Architecture Guide](docs/ARCHITECTURE.md) — Domain-driven design principles
- [Test Suite](docs/TESTS.md) — Test coverage and structure
- [Migration Strategy](docs/MIGRATION_STRATEGY.md) — Database migration workflow
- [Security Audit](docs/SECURITY_AUDIT.md) — Security checklist and compliance
- [Performance Optimization](docs/PERFORMANCE_OPTIMIZATION.md) — Optimization guide
- [Refactoring Plan](docs/REFACTORING_PLAN.md) — Migration roadmap

---

## 🔬 Research & Validation

AgoraX implements several novel approaches to digital democracy:

1. **Cryptographically secure sortition** — First implementation using Web Crypto API with rejection sampling
2. **TF-IDF amendment clustering** — Mathematical deduplication without semantic loss
3. **Democracy score ratchet** — One-way transition toward decentralization
4. **Author veto with community override** — Balances intent preservation with consensus

---

## 🤝 Contributing

We welcome contributions! Please read our [Code of Conduct](CODE_OF_CONDUCT.md) and [Contributing Guide](CONTRIBUTING.md).

### Development Setup

```bash
# Clone and install
git clone https://github.com/miltosdoc/agoraxdemo.git
cd agoraxdemo
npm install

# Start development environment
npm run dev

# Run tests
npm test

# Check modularity
node scripts/check-modularity.cjs
```

---

## 📄 License

MIT License — See [LICENSE](LICENSE) for details.

---

## 🏛️ About

AgoraX is built by physicians, engineers, and civic technologists who believe that digital democracy requires mathematical rigor, not just good intentions.

**"Trust isn't generated by promises. It relies entirely on a backend engineered for mathematical immunity to statistical bias and identity fraud."**

---

*Built with ❤️ in Sweden, inspired by Athens.*
