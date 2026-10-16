#!/bin/bash
set -euo pipefail

# Always run from the repo root (where this script lives)
cd "$(dirname "$0")"

echo "🔍 Running preflight checks..."

# Check git working tree
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "❌ Working tree is not clean. Commit or stash changes before deploying."
  exit 1
fi

# Check remote
if git remote get-url mindful >/dev/null 2>&1; then
  echo "📡 Using remote: mindful (Cyrus-Malekani/mindful-new)"
  DEPLOY_REMOTE="mindful"
else
  echo "⚠️  mindful remote not found, using origin"
  DEPLOY_REMOTE="origin"
fi

# Verify remote matches expected target repo
REMOTE_URL=$(git remote get-url "$DEPLOY_REMOTE")
if [[ "$REMOTE_URL" != *"Cyrus-Malekani/mindful-new"* ]] && [[ "$DEPLOY_REMOTE" == "mindful" ]]; then
  echo "⚠️  mindful remote URL doesn't match expected Cyrus-Malekani/mindful-new"
fi

echo "📥 Pulling latest code..."
git fetch "$DEPLOY_REMOTE" main
git merge --ff-only "$DEPLOY_REMOTE/main"

# Check Node version
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node --version)
  echo "✓ Node.js: $NODE_VER"
else
  echo "❌ Node.js not found"
  exit 1
fi

# Check pnpm version
if command -v pnpm >/dev/null 2>&1; then
  PNPM_VER=$(pnpm --version)
  echo "✓ pnpm: $PNPM_VER"
else
  echo "❌ pnpm not found (install pnpm v11.17.0)"
  exit 1
fi

# Check required tools
for tool in pm2 curl; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "✓ $tool available"
  else
    echo "⚠️  $tool not found (may be needed for deployment/health checks)"
  fi
done

# Check disk space (warn if low, don't fail hard)
if command -v df >/dev/null 2>&1; then
  AVAIL=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
  echo "💾 Available disk space: ${AVAIL}G"
  if [ "$AVAIL" -lt 2 ]; then
    echo "⚠️  Low disk space detected (< 2GB)"
  fi
fi

# Check for production env files in expected locations (without printing contents)
if [ -f backend/.env.production ]; then
  echo "ℹ️  backend/.env.production exists (ensure permissions are restricted)"
elif [ -f .env.production ]; then
  echo "ℹ️  .env.production exists (ensure permissions are restricted)"
else
  echo "⚠️  No .env.production file found - ensure production env vars are set in PM2/system env"
fi

echo "📦 Installing dependencies with pnpm (workspace, frozen lockfile)..."
pnpm install --frozen-lockfile

echo "🏗️ Building frontend for production..."
export VITE_API_URL=""
NODE_OPTIONS="--max-old-space-size=4096" pnpm --filter frontend run build

echo "🚀 Starting or reloading backend with PM2..."
cd backend
pm2 startOrReload ecosystem.config.cjs --env production
cd ..

# Determine backend port (default 5010)
BACKEND_PORT=${PORT:-5010}
echo "⏳ Waiting for backend to start..."
sleep 3

echo "🏥 Running health checks..."
# Liveness check
if command -v curl >/dev/null 2>&1; then
  if curl -sf "http://localhost:${BACKEND_PORT}/health/live" >/dev/null 2>&1; then
    echo "✓ Liveness check passed (/health/live)"
  else
    echo "❌ Liveness check failed (/health/live)"
    exit 1
  fi

  # Readiness check (confirms DB connectivity)
  if curl -sf "http://localhost:${BACKEND_PORT}/health/ready" >/dev/null 2>&1; then
    echo "✓ Readiness check passed (/health/ready) - DB connected"
  else
    echo "❌ Readiness check failed (/health/ready) - service not ready (may indicate DB connectivity issue)"
    exit 1
  fi
else
  echo "⚠️  curl not available - skipping HTTP health checks"
  echo "⚠️  Verify manually: curl -f http://localhost:${BACKEND_PORT}/health/live and /health/ready"
fi

echo "✅ Deployment complete. App should be live on configured domain."
echo "💡 Manual rollback: see DEPLOYMENT.md for rollback procedure"
