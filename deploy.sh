#!/bin/bash

#!/bin/bash
set -euo pipefail

# Always run from the repo root (where this script lives)
cd "$(dirname "$0")"

echo "📥 Pulling latest code..."
git fetch origin main
git merge --ff-only origin/main

echo "📦 Installing backend dependencies..."
pushd backend >/dev/null
npm ci

echo "🚀 Starting or reloading backend with PM2..."
# Note: your repo has ecosystem.config.js (not .cjs)
pm2 startOrReload ecosystem.config.cjs --env production
popd >/dev/null

echo "📦 Installing frontend dependencies..."
pushd frontend >/dev/null
npm ci

# If you rely on a runtime API URL at build time, prefer .env.production.
# If you must inject via env, export it BEFORE the build:
export VITE_API_URL=""
echo "🏗️ Building frontend for production (with larger Node heap)..."
NODE_OPTIONS="--max-old-space-size=4096" npm run build
popd >/dev/null

echo "✅ Deployment complete. App should be live."
