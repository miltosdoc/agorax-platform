#!/bin/sh
set -e

# Create @shared/schema package in node_modules for ESM resolution
mkdir -p /app/node_modules/@shared/schema
cp -r /app/shared/* /app/node_modules/@shared/schema/

echo "Running migrations..."
npx drizzle-kit migrate || echo "⚠️  Migration step failed — continuing"

echo "Seeding demo data..."
npx tsx server/seed-demo.ts || echo "⚠️  Seed step failed — continuing"

echo "Starting server..."
exec node dist/index.js
