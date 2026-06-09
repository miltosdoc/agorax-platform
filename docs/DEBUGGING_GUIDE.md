# AgoraX Debugging Guide

A practical guide for debugging the AgoraX participatory democracy platform. Covers common failure modes, diagnostic commands, and recovery procedures.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Common Errors & Fixes](#common-errors--fixes)
- [Database Debugging](#database-debugging)
- [API Debugging](#api-debugging)
- [Frontend Debugging](#frontend-debugging)
- [Mobile App Debugging](#mobile-app-debugging)
- [Ballot Service Debugging](#ballot-service-debugging)
- [Sortition Debugging](#sortition-debugging)
- [LLM Integration Debugging](#llm-integration-debugging)
- [Performance Issues](#performance-issues)
- [Deployment Troubleshooting](#deployment-troubleshooting)

---

## Quick Start

### Run the full stack locally

```bash
cd ~/projects/agorax
docker compose up -d          # PostgreSQL + Redis
npm run dev                    # Vite dev server (port 5173) + Express API (port 3001)
```

**Port conflicts:** Port 3000 is occupied by WhatsApp bridge. API runs on 3001.

### Verify everything is working

```bash
# Check services
docker compose ps
curl http://localhost:3001/api/health

# Run tests
npx vitest run                 # Unit + integration tests
npx playwright test            # E2E tests (requires dev server running)
```

### Demo users (DEMO_MODE=true)

| Username | Password | Role |
|----------|----------|------|
| miltos   | password | Admin |
| elena    | password | Member |
| giorgos  | password | Member |
| maria    | password | Member |
| kostas   | password | Member |

Any password works for demo users (bcrypt dummy hashes).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Client (Vite + React + Tailwind)                           │
│  Port: 5173 (dev) / 3001 (prod, served by Express)          │
├─────────────────────────────────────────────────────────────┤
│  Server (Express + Drizzle ORM)                              │
│  Port: 3001                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Proposal State Machine (8 states)                    │    │
│  │  draft → ai_validation → author_review →              │    │
│  │  amendments → text_synthesis → score ≤33 →            │    │
│  │  author_review → score 34-100 → voting → completed    │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  Ballot Service (separate process)                           │
│  Blind signatures (RFC 9474) + ElectionGuard                │
├─────────────────────────────────────────────────────────────┤
│  LLM Validation (external)                                   │
│  Endpoint: https://web.xsilico.ai/api                        │
│  Model: qwen/qwen3.6-27b                                     │
└─────────────────────────────────────────────────────────────┘
```

**Key files:**
- `server/utils/proposal-state-machine.ts` — 8-state lifecycle
- `server/utils/sortition-scheduler.ts` — lottery body timeout sweep
- `ballot_service/` — blind signature implementation
- `client/src/pages/` — React page components
- `shared/` — shared types (imported by both client and server)

---

## Common Errors & Fixes

### "Operation not permitted" on macOS

**Cause:** macOS TCC (Transparency, Consent, Control) blocking file access.

**Fix:**
```bash
# Grant Full Disk Access to your terminal app
# System Settings → Privacy & Security → Full Disk Access
```

### Port 3000 already in use

**Cause:** WhatsApp bridge occupies port 3000.

**Fix:** API runs on port 3001. Check `.env`:
```
PORT=3001
```

### Drizzle migration reports success but changes not applied

**Cause:** Drizzle-kit can report success without actually running the migration.

**Fix:** Verify manually:
```sql
psql -d agorax -c "SELECT * FROM information_schema.columns WHERE table_name = 'your_table';"
```

### Vite externalizes Node built-ins

**Cause:** `shared/` modules imported by both client and server. Any `node:*` import at top level crashes the SPA.

**Fix:** Move Node-specific imports to `server/utils/` or use `require()` lazily.

### ngrok free tier random URL on restart

**Cause:** Free tier doesn't support fixed domains.

**Fix:** Use `ngrok http 3001 --region us` for more stable URLs, or upgrade to paid plan.

### ngrok Traffic Policy doesn't work on free tier

**Cause:** `ERR_NGROK_2201` — OAuth/basic auth/JWT not supported on `.ngrok-free.dev` domains.

**Fix:** Add auth middleware in Express server (gated by env var).

---

## Database Debugging

### Connect to PostgreSQL

```bash
docker compose exec postgres psql -U postgres -d agorax
```

### Check proposal states

```sql
SELECT id, title, state, updated_at FROM proposals ORDER BY created_at DESC LIMIT 10;
```

### Check sortition bodies

```sql
SELECT id, community_id, status, selected_at, completes_at 
FROM sortition_bodies 
ORDER BY created_at DESC LIMIT 10;
```

### Check blind signature tokens

```sql
SELECT id, proposal_id, is_spent, created_at 
FROM blind_tokens 
ORDER BY created_at DESC LIMIT 10;
```

### Reset database (development only)

```bash
docker compose down -v
docker compose up -d
psql -U postgres -d agorax -f seed_demo.sql
```

### Fix sequence out-of-sync

```sql
SELECT setval('proposals_id_seq', (SELECT MAX(id) FROM proposals));
```

---

## API Debugging

### Enable request logging

```bash
# Add to .env
DEBUG=express:*
```

### Test API endpoints

```bash
# Health check
curl http://localhost:3001/api/health

# List proposals
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/proposals

# Create proposal
curl -X POST http://localhost:3001/api/proposals \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","description":"Test proposal","communityId":"1"}'
```

### Get auth token

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"miltos","password":"password"}'
```

---

## Frontend Debugging

### Vite dev server issues

```bash
# Clear Vite cache
rm -rf node_modules/.vite
npm run dev
```

### React component crashes

Check browser console for:
- `t() called at module level` — i18n context not ready. Move `t()` calls inside components.
- `useStore called outside component` — nanostore usage in non-React context.
- `wouter routing broken` — `<Button asChild><Link>` pattern swallows click handler. Use styled `<Link>` directly.

### Check i18n translations

```bash
# Missing translation keys show as the key itself
# Check client/src/i18n/locales/ for en.ts and el.ts
```

---

## Mobile App Debugging

### Build APK

```bash
cd mobile
npx cap sync
npx cap run android --target <device-id>
```

### Check Capacitor sync

```bash
# After client changes, sync to mobile
npx cap sync
```

### APK size optimization

Large assets in `www/` inflate APK. Remove unused assets:
```bash
# Check www/ size
du -sh mobile/www/
# Target: < 5MB for www/ directory
```

### Android notifications not firing

```bash
# Check notification channel is created
adb shell dumpsys notification | grep -A5 "AgoraX"

# Check permission granted
adb shell appops get <package> USE_FULL_SCREEN_INTENT
```

---

## Ballot Service Debugging

### Verify blind signature implementation

```bash
# Run blind signature tests
npx vitest run tests/integration/blind-sig.test.ts
```

### Check token lifecycle

```sql
-- Active (unspent) tokens
SELECT COUNT(*) as active_tokens FROM blind_tokens WHERE is_spent = false;

-- Spent tokens
SELECT COUNT(*) as spent_tokens FROM blind_tokens WHERE is_spent = true;
```

### Verify RFC 9474 conformance

The `blind-sig.test.ts` file includes RFC 9474 test vectors. If these fail, the implementation is non-compliant.

---

## Sortition Debugging

### Check sortition scheduler

```bash
# Check if scheduler is running
ps aux | grep sortition

# Check job queue
psql -d agorax -c "SELECT * FROM job_queue WHERE type = 'sortition_timeout' LIMIT 5;"
```

### Verify lottery body selection

```sql
-- Check selected members
SELECT sb.id, sb.community_id, COUNT(sm.member_id) as member_count
FROM sortition_bodies sb
JOIN sortition_members sm ON sm.body_id = sb.id
GROUP BY sb.id, sb.community_id;
```

### Timeout handling

Sortition bodies have a timeout (configurable per community). When timeout is reached:
1. `sortition-scheduler.ts` sweeps active bodies
2. `handleSortitionCompletion` processes results
3. Score ≤33 → `author_review`, 34-100 → `voting`, null → `archived`

---

## LLM Integration Debugging

### Check LLM endpoint

```bash
curl https://web.xsilico.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen/qwen3.6-27b","messages":[{"role":"user","content":"Hello"}]}'
```

### Validation scoring

5-dimension scoring:
1. **Structure** — logical organization
2. **Specificity** — concrete details vs. vague claims
3. **Feasibility** — practical implementability
4. **Completeness** — addresses all aspects
5. **Clarity** — understandable language

Tiered routing:
- <20% → return to author
- 20-90% → sortition body review
- >90% → auto-approve

### LLM downtime handling

Non-blocking — if LLM is down, proposals proceed with default score (50%). Never blocks proposal flow.

---

## Performance Issues

### Slow page loads

1. Check network tab for large assets
2. Check React component re-renders (React DevTools)
3. Check database query performance (enable SQL logging)

### Slow API responses

```bash
# Enable query logging
# Add to .env
DRIZZLE_LOG=true
```

### Memory leaks

```bash
# Check Node.js heap
curl http://localhost:3001/api/health | jq .memory
```

---

## Deployment Troubleshooting

### Docker compose issues

```bash
# Check container logs
docker compose logs --tail=100

# Restart services
docker compose restart

# Rebuild images
docker compose up -d --build
```

### Environment variables

Check `.env` has all required variables:
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
LLM_API_KEY=...
LLM_ENDPOINT=https://web.xsilico.ai/api
ENABLE_BALLOT_VOTING=false
DEMO_MODE=true
```

### Production log verification

```bash
# Verify no PII in logs
grep -r "password\|token\|ssn\|email" ~/.hermes/logs/ --include="*.log"

# Check for sensitive data in error logs
grep -i "error\|exception" ~/.hermes/logs/errors.log | tail -20
```

---

## Emergency Procedures

### Database corruption

1. Stop all services: `docker compose down`
2. Restore from backup: `pg_restore -d agorax backup.dump`
3. Restart: `docker compose up -d`

### LLM endpoint down

1. Proposals continue with default scoring (50%)
2. Monitor endpoint: `curl -s https://web.xsilico.ai/api/health`
3. Contact xsilico.ai support if persistent

### Ballot service crash

1. Check logs: `docker compose logs ballot`
2. Restart: `docker compose restart ballot`
3. Verify tokens: run blind-sig tests

---

## References

- [Backend API Documentation](BACKEND.md) — 80+ endpoints, 24 tables
- [Architecture Overview](ARCHITECTURE.md) — system design
- [Security Audit](SECURITY_AUDIT.md) — threat model, mitigations
- [Test Suite](TESTS.md) — test strategy, coverage
- [Compliance Docs](compliance/) — GDPR, DPIA, voting audit

---

*Last updated: June 2026*
