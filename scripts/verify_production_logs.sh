#!/bin/bash
# Production Log Verification Script
# 
# Run this AFTER deploying to production to verify that vote endpoints
# are excluded from all logging layers.
#
# Usage: ./verify_production_logs.sh <nginx_access_log> <app_log>
#
# This script casts test votes, then greps the logs for any evidence
# of vote endpoint logging. Empty grep output = PASS.

set -euo pipefail

NGINX_LOG="${1:-/var/log/nginx/agorax_access.log}"
APP_LOG="${2:-/var/log/agorax/app.log}"
API_BASE="${3:-https://agorax.example.com}"
PROPOSAL_ID="${4:-1}"

echo "=== AgoraX Production Log Verification ==="
echo "Nginx log: $NGINX_LOG"
echo "App log:   $APP_LOG"
echo "API base:  $API_BASE"
echo ""

# Step 1: Cast test votes
echo "[1/4] Casting test votes..."

# Get blind key
BLIND_KEY=$(curl -s "$API_BASE/api/proposals/$PROPOSAL_ID/blind-key")
echo "  Blind key obtained"

# Generate blinded request (this would normally be client-side)
# For verification purposes, we use a simplified approach
echo "  Blinding token..."

# Cast anonymous vote
VOTE_RESPONSE=$(curl -s -X POST "$API_BASE/api/proposals/$PROPOSAL_ID/anonymous-vote" \
  -H "Content-Type: application/json" \
  -d '{"token":"test_token","signature":"test_sig","choice":"yes"}')
echo "  Vote cast: $VOTE_RESPONSE"

# Verify receipt
VERIFY_RESPONSE=$(curl -s "$API_BASE/api/proposals/$PROPOSAL_ID/verify-receipt?token=test_token")
echo "  Receipt verified: $VERIFY_RESPONSE"

echo ""

# Step 2: Wait for logs to flush
echo "[2/4] Waiting 5 seconds for logs to flush..."
sleep 5

# Step 3: Check nginx logs
echo "[3/4] Checking nginx access logs..."
echo ""
echo "  Searching for vote endpoints in nginx logs:"

NGINX_BLIND_SIGN=$(grep -c "/blind-sign" "$NGINX_LOG" 2>/dev/null || echo "0")
NGINX_ANON_VOTE=$(grep -c "/anonymous-vote" "$NGINX_LOG" 2>/dev/null || echo "0")
NGINX_VERIFY=$(grep -c "/verify-receipt" "$NGINX_LOG" 2>/dev/null || echo "0")
NGINX_BLIND_KEY=$(grep -c "/blind-key" "$NGINX_LOG" 2>/dev/null || echo "0")

echo "    /blind-sign:      $NGINX_BLIND_SIGN matches"
echo "    /anonymous-vote:  $NGINX_ANON_VOTE matches"
echo "    /verify-receipt:  $NGINX_VERIFY matches"
echo "    /blind-key:       $NGINX_BLIND_KEY matches"

if [ "$NGINX_BLIND_SIGN" -eq 0 ] && [ "$NGINX_ANON_VOTE" -eq 0 ] && \
   [ "$NGINX_VERIFY" -eq 0 ] && [ "$NGINX_BLIND_KEY" -eq 0 ]; then
  echo "  ✅ PASS — No vote endpoints in nginx logs"
else
  echo "  ❌ FAIL — Vote endpoints found in nginx logs!"
  echo "  Action required: Configure nginx to exclude vote endpoints"
  echo "  See: docs/compliance/DEPLOYMENT_HARDENING.md"
  exit 1
fi

echo ""

# Step 4: Check application logs
echo "[4/4] Checking application logs..."
echo ""
echo "  Searching for vote endpoints in app logs:"

APP_BLIND_SIGN=$(grep -c "blind-sign" "$APP_LOG" 2>/dev/null || echo "0")
APP_ANON_VOTE=$(grep -c "anonymous-vote" "$APP_LOG" 2>/dev/null || echo "0")
APP_VERIFY=$(grep -c "verify-receipt" "$APP_LOG" 2>/dev/null || echo "0")
APP_BLIND_KEY=$(grep -c "blind-key" "$APP_LOG" 2>/dev/null || echo "0")

echo "    blind-sign:       $APP_BLIND_SIGN matches"
echo "    anonymous-vote:   $APP_ANON_VOTE matches"
echo "    verify-receipt:   $APP_VERIFY matches"
echo "    blind-key:        $APP_BLIND_KEY matches"

if [ "$APP_BLIND_SIGN" -eq 0 ] && [ "$APP_ANON_VOTE" -eq 0 ] && \
   [ "$APP_VERIFY" -eq 0 ] && [ "$APP_BLIND_KEY" -eq 0 ]; then
  echo "  ✅ PASS — No vote endpoints in app logs"
else
  echo "  ❌ FAIL — Vote endpoints found in app logs!"
  echo "  Action required: Verify logging exclusions in server/index.ts"
  exit 1
fi

echo ""
echo "=== Verification Complete ==="
echo "✅ ALL CHECKS PASSED — Vote endpoints are excluded from logs"
echo ""
echo "IMPORTANT: This verification is valid only for the current deployment."
echo "Re-run after any infrastructure changes."
