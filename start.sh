#!/usr/bin/env bash
set -euo pipefail

# Portable production-style starter for an already-built AgoraX app.
# For day-to-day development use `npm run dev`.
# For the full local stack use `docker compose up -d --build`.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [ ! -f ".env" ]; then
  echo "Missing .env. Copy .env.example to .env and set DATABASE_URL plus secrets." >&2
  exit 1
fi

if [ ! -f "dist/index.js" ]; then
  echo "Missing dist/index.js. Run npm run build first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"

exec node dist/index.js
