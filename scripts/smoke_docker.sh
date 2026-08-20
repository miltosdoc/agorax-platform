#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
BALLOT_URL="${BALLOT_URL:-http://localhost:8000}"

curl -fsS "$API_URL/api/health" >/dev/null
curl -fsS "$BALLOT_URL/api/health" >/dev/null
curl -fsSI "$API_URL/" >/dev/null

echo "Docker smoke check passed for $API_URL and $BALLOT_URL"
