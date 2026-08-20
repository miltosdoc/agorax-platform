#!/bin/bash
# Wait until 20:40 CEST, then run Opus on AgoraX Phase 7

cd /tmp/agoraxdemo

# Pull latest changes first
git pull origin main

# Run Opus with the prepared prompt
cat .claude/PROMPT.md | /tmp/claude-v2/node_modules/.bin/claude code --model opus --dangerously-skip-permissions

# After Opus finishes, build and start
echo "=== Opus finished, building Docker ==="
cd /tmp/agoraxdemo
docker compose up -d --build

echo "=== Docker started ==="
docker compose ps
