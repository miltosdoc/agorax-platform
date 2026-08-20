# Running AgoraX

The complete runbook: what to install, what to configure, and which services
to start. AgoraX runs as **three processes** — PostgreSQL, the Node app, and a
Python ballot-validation service.

## 1. Prerequisites

| Tool | Version | Used for |
|---|---|---|
| Node.js | 20+ | the main application (API + client) |
| npm | 10+ | dependency install, scripts |
| PostgreSQL | 14+ | the single shared database |
| Python | 3.11+ | the ballot-validation service |

## 2. Install

```bash
git clone https://github.com/miltosdoc/agoraxdemocracy.git
cd agoraxdemocracy

# Node app + the @agorax/voting workspace package
npm install

# Python ballot service (separate virtualenv)
cd ballot_service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd ..
```

## 3. Database

AgoraX uses one PostgreSQL database. Create it, then sync the schema:

```bash
createdb agorax
npm run db:push      # creates every table from shared/schema.ts
```

`db:push` is the reliable path for a fresh database — it diffs
`shared/schema.ts` straight onto the DB. The `migrations/` folder
(`0000` … `0013`) is the ordered history for production
(`npm run db:migrate`); `db:push` is what dev and CI use.

Optional demo content:

```bash
npm run db:seed      # demo communities, proposals, users
```

## 4. Environment

Copy `.env.example` to `.env`. Key variables:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://USER@localhost:5432/agorax` |
| `SESSION_SECRET` | yes | any long random string |
| `PORT` | no | Node app port (default 3000; dev commonly 3001) |
| `VOTING_BACKEND` | no | `hash-chain` (default) or `electionguard` |
| `BALLOT_SERVICE_URL` | no | default `http://localhost:8000` |
| `EG_GUARDIANS` / `EG_THRESHOLD` | no | ElectionGuard trustee quorum (dev: 1-of-1) |
| `LLM_API_KEY` / `LLM_API_URL` | no | proposal quality validation |

## 5. Start the services

Three processes. Start them in separate terminals (or via `docker compose up`).

### PostgreSQL
Your system PostgreSQL service — port **5432**. Everything depends on it.

### AgoraX app (Node) — port 3001
```bash
PORT=3001 npm run dev
```
Serves the API and, via Vite middleware, the client. Health:
`curl http://localhost:3001/api/health`.

### Ballot service (Python / FastAPI) — port 8000
```bash
cd ballot_service
DATABASE_URL="postgresql://USER@localhost:5432/agorax" \
  SALT_KEY="<stable secret>" \
  .venv/bin/uvicorn main:app --port 8000
```
Validates uploaded Gov.gr Responsible-Declaration PDFs (signature check +
identity extraction). Health: `curl http://localhost:8000/api/health`.

- The app runs fine **without** it — only Gov.gr identity verification will
  fail with *"Ballot validation service unavailable."*
- `SALT_KEY` must stay **stable and secret**: voter and document hashes are
  derived from it, so changing it invalidates existing verifications.

> **Retired:** the former Python `economy-service` is gone. Democracy Points
> are now implemented natively in the Node app (`server/economy/`) — there is
> no separate economy process to run.

## 6. Verify it's up

```bash
curl http://localhost:3001/api/health        # → {"status":"healthy",...}
curl http://localhost:3001/api/ballot/health # → ballot-validator healthy
```

## 7. Common issues

| Symptom | Cause / fix |
|---|---|
| "Ballot validation service unavailable" | The Python ballot service isn't running — start it (step 5). |
| `EADDRINUSE` on dev restart | A prior `tsx watch` didn't release the port: `lsof -ti tcp:3001 \| xargs kill -9`, then restart. |
| App vanishes after several edits | `tsx watch` can crash on rapid reloads — same fix as above. |
| Voting shows `0` results / wrong backend | Check `VOTING_BACKEND`; restart the app after changing env. |

## 8. Quality checks

```bash
npx tsc --noEmit                    # TypeScript
npm run check:i18n                  # en/el translation-key parity
node scripts/check-modularity.cjs   # module-boundary rules
npm test                            # unit + integration tests
```
