#!/bin/bash
# Production deploy for Mindful Learning (OPS-02).
#
# Run on the production host from the repo root:  ./deploy.sh
#
#   DRY_RUN=1        print every step, change nothing (no merge, install, build, mv, pm2, log write)
#   FORCE=1          deploy even if CI for the target commit is not green (logged loudly)
#   PM2_INSTANCES=N  number of pm2 cluster workers (default 2)
#   DEPLOY_GH_TOKEN_FILE  file holding a read-only GitHub token (default ~/.config/mindful-deploy/gh_token)
#   DEPLOY_REPO      owner/repo used for the CI check (default Cyrus-Malekani/Mindfullearning)
#   PORT             backend port for health checks (default 5010)
#
# Flow: lock → preflight → PREV_SHA → CI gate → fetch → (re-run with the target's deploy.sh if it
# changed) → ff-merge main → pnpm install → vite build into
# frontend/dist.new → swap dist.new→dist (old kept as dist.prev) → pm2 reload + scale → health checks.
# A failure after the merge resets code + deps to PREV_SHA. A failed health check also restores
# dist.prev and reloads pm2 (automatic rollback). Every run appends a line to logs/deploy.log.
#
# Exit codes: 0 deployed / nothing to do / dry run, 1 refused or failed before going live (old version
# still live), 2 rolled back after failed health checks, 3 rollback itself failed (needs a human).
set -euo pipefail

SELF=$(realpath "$0")
# DEPLOY_ROOT is set only when deploy.sh re-runs itself from logs/deploy.next.sh (see "Self-update").
cd "${DEPLOY_ROOT:-$(dirname "$0")}"
REPO_ROOT=$(pwd)

DRY_RUN=${DRY_RUN:-0}
FORCE=${FORCE:-0}
export PM2_INSTANCES=${PM2_INSTANCES:-2}
DEPLOY_REPO=${DEPLOY_REPO:-Cyrus-Malekani/Mindfullearning}
DEPLOY_GH_TOKEN_FILE=${DEPLOY_GH_TOKEN_FILE:-$HOME/.config/mindful-deploy/gh_token}
BACKEND_PORT=${PORT:-5010}
PM2_APP=ML-Backend
CI_WORKFLOW_NAME=CI
LOG_FILE="$REPO_ROOT/logs/deploy.log"
FRONTEND="$REPO_ROOT/frontend"
DEPLOY_USER=${SUDO_USER:-$(id -un)}

PREV_SHA=""
TARGET_SHA=""
STAGE="preflight"   # preflight → pulled → swapped → reloaded
FINISHED=0

say()  { echo "$*"; }
warn() { echo "⚠️  $*" >&2; }
die()  { echo "❌ $*" >&2; exit 1; }

# Run a command that changes something. In dry-run mode only print it.
run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "   [dry-run] $*"
  else
    "$@"
  fi
}

log_result() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) ${TARGET_SHA:-unknown} $DEPLOY_USER $1"
  if [ "$DRY_RUN" = "1" ]; then
    echo "   [dry-run] would log: $line"
  else
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "$line" >> "$LOG_FILE"
  fi
}

# --- Health checks -----------------------------------------------------------------------------

check_endpoint() {
  local path=$1 i
  for i in 1 2 3 4 5; do
    if curl -sf "http://localhost:${BACKEND_PORT}${path}" >/dev/null 2>&1; then
      say "✓ ${path} ok"
      return 0
    fi
    say "⏳ waiting for ${path} ... attempt $i"
    sleep 2
  done
  echo "❌ ${path} failed after 5 attempts" >&2
  return 1
}

health_ok() {
  sleep 3
  check_endpoint /health/live && check_endpoint /health/ready
}

# --- Rollback ----------------------------------------------------------------------------------

restore_code_and_deps() {
  say "↩️  Resetting code to $PREV_SHA and reinstalling dependencies..."
  git reset --hard "$PREV_SHA"
  pnpm install --frozen-lockfile
}

restore_frontend() {
  if [ -d "$FRONTEND/dist.prev" ]; then
    say "↩️  Restoring previous frontend (dist.prev → dist)..."
    rm -rf "$FRONTEND/dist.failed"
    if [ -d "$FRONTEND/dist" ]; then mv "$FRONTEND/dist" "$FRONTEND/dist.failed"; fi
    mv "$FRONTEND/dist.prev" "$FRONTEND/dist"
  else
    warn "No frontend/dist.prev to restore; leaving frontend/dist as it is"
  fi
}

pm2_reload() {
  (cd "$REPO_ROOT/backend" && pm2 startOrReload ecosystem.config.cjs --env production --update-env)
  pm2_scale
}

# `pm2 scale` to the count already running prints "[PM2][ERROR] Nothing to do" and exits 1, which
# under `set -e` aborted the deploy and rolled it back. Only scale when the count differs.
pm2_scale() {
  local running
  running=$(pm2 jlist 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { console.log(JSON.parse(s).filter((p) => p.name === process.argv[1]).length); } catch { console.log(""); }
    });' "$PM2_APP")
  if [ "$running" = "$PM2_INSTANCES" ]; then
    say "✓ pm2 already runs $PM2_INSTANCES instance(s) of $PM2_APP; no scaling needed"
    return 0
  fi
  pm2 scale "$PM2_APP" "$PM2_INSTANCES"
}

# Full rollback after the new version went live and failed its health checks.
rollback_live() {
  echo "🚨 Health checks failed — rolling back to $PREV_SHA" >&2
  set +e
  restore_code_and_deps && restore_frontend && pm2_reload
  local restored=$?
  set -e
  if [ $restored -eq 0 ] && health_ok; then
    log_result "rolled-back"
    echo "↩️  Rolled back to $PREV_SHA; the previous version is healthy. Deploy of $TARGET_SHA FAILED." >&2
    FINISHED=1
    exit 2
  fi
  log_result "rollback-failed"
  echo "🔥 ROLLBACK FAILED — production may be down. Follow the manual procedure in DEPLOYMENT.md." >&2
  FINISHED=1
  exit 3
}

# Any unexpected error after the merge but before the new version went live: put the code and
# dependencies back so a restarting pm2 worker never picks up half-deployed code.
on_exit() {
  local code=$?
  [ "$FINISHED" = "1" ] && return
  [ "$DRY_RUN" = "1" ] && return
  [ $code -eq 0 ] && return
  case "$STAGE" in
    pulled)
      echo "❌ Deploy failed before going live — restoring $PREV_SHA (frontend/dist untouched)" >&2
      set +e
      if restore_code_and_deps; then log_result "build-failed"; else log_result "rollback-failed"; exit 3; fi
      ;;
    swapped|reloaded)
      set +e
      restore_code_and_deps; restore_frontend; pm2_reload
      log_result "rollback-failed-unexpected-error"
      echo "🔥 Unexpected error after the frontend swap; attempted rollback. Check health manually." >&2
      exit 3
      ;;
  esac
}
trap on_exit EXIT

# --- CI gate -----------------------------------------------------------------------------------

# Prints success | failure | pending | none | unknown for the newest CI run on $1.
ci_status() {
  local sha=$1 json=""
  if [ -r "$DEPLOY_GH_TOKEN_FILE" ]; then
    # The token goes in via stdin (curl --config -) so it never shows up in the process list.
    json=$(printf 'header = "Authorization: Bearer %s"\n' "$(tr -d '[:space:]' < "$DEPLOY_GH_TOKEN_FILE")" |
      curl -sf --config - \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${DEPLOY_REPO}/actions/runs?head_sha=${sha}&per_page=20") || {
      echo unknown; return; }
  elif command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    json=$(gh api "repos/${DEPLOY_REPO}/actions/runs?head_sha=${sha}&per_page=20") || { echo unknown; return; }
  else
    echo unknown; return
  fi
  printf '%s' "$json" | node -e '
    let d = "";
    process.stdin.on("data", (c) => (d += c)).on("end", () => {
      const [sha, name] = process.argv.slice(1);
      let runs = [];
      try { runs = JSON.parse(d).workflow_runs || []; } catch { console.log("unknown"); return; }
      const r = runs.filter((x) => x.head_sha === sha && x.name === name)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      if (!r) console.log("none");
      else if (r.status !== "completed") console.log("pending");
      else console.log(r.conclusion === "success" ? "success" : "failure");
    });' "$sha" "$CI_WORKFLOW_NAME"
}

# --- Preflight ---------------------------------------------------------------------------------

[ "$DRY_RUN" = "1" ] && say "🧪 DRY RUN — nothing will be changed"

if [ "$DRY_RUN" != "1" ]; then
  mkdir -p "$REPO_ROOT/logs"
  exec 9>"$REPO_ROOT/logs/deploy.lock"
  flock -n 9 || die "Another deploy is running (logs/deploy.lock)"
fi

say "🔍 Running preflight checks..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  die "Working tree is not clean. Commit or stash changes before deploying."
fi

if git remote get-url mindful >/dev/null 2>&1; then
  DEPLOY_REMOTE="mindful"
else
  DEPLOY_REMOTE="origin"
fi
REMOTE_URL=$(git remote get-url "$DEPLOY_REMOTE")
say "📡 Remote: $DEPLOY_REMOTE"
# The repo was renamed mindful-new → Mindfullearning (2026-11-23); GitHub redirects the old URL.
REMOTE_URL_LC=$(printf '%s' "$REMOTE_URL" | tr '[:upper:]' '[:lower:]')
if [[ "$DEPLOY_REMOTE" == "mindful" && "$REMOTE_URL_LC" != *"cyrus-malekani/mindfullearning"* && "$REMOTE_URL_LC" != *"cyrus-malekani/mindful-new"* ]]; then
  warn "mindful remote URL doesn't match Cyrus-Malekani/Mindfullearning"
fi

for tool in node pnpm pm2 curl flock; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool not found"
done
say "✓ node $(node --version), pnpm $(pnpm --version)"

if command -v df >/dev/null 2>&1; then
  AVAIL=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
  say "💾 Available disk space: ${AVAIL}G"
  [ "${AVAIL:-0}" -lt 2 ] && warn "Low disk space (< 2GB)"
fi

if [ -f backend/.env.production ] || [ -f .env.production ]; then
  say "ℹ️  .env.production present (keep permissions at 600)"
else
  warn "No .env.production found - ensure production env vars are set in the pm2/system env"
fi

PREV_SHA=$(git rev-parse HEAD)
# DEPLOY_TARGET_SHA is passed on a self-update re-run so the target is not resolved (and the SSH
# passphrase not asked for) a second time.
TARGET_SHA=${DEPLOY_TARGET_SHA:-$(git ls-remote "$DEPLOY_REMOTE" refs/heads/main | awk '{print $1}')}
[ -n "$TARGET_SHA" ] || die "Could not resolve $DEPLOY_REMOTE/main"
say "📌 Live commit:   $PREV_SHA"
say "🎯 Target commit: $TARGET_SHA ($DEPLOY_REMOTE/main)"

if [ "$PREV_SHA" = "$TARGET_SHA" ]; then
  say "✅ $TARGET_SHA is already live — nothing to deploy."
  log_result "noop"
  FINISHED=1
  exit 0
fi

# --- CI gate -----------------------------------------------------------------------------------

CI=$(ci_status "$TARGET_SHA")
say "🧾 CI ($CI_WORKFLOW_NAME) for $TARGET_SHA: $CI"
FORCED=0
if [ "$CI" != "success" ]; then
  if [ "$FORCE" = "1" ]; then
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" >&2
    echo "!!! FORCE=1: deploying $TARGET_SHA WITHOUT green CI (status: $CI) by $DEPLOY_USER" >&2
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" >&2
    FORCED=1
  else
    log_result "refused-ci-$CI"
    FINISHED=1
    die "CI for $TARGET_SHA is '$CI', not 'success'. Wait for CI, or use FORCE=1 (logged)."
  fi
fi

# --- Pull, install, build ----------------------------------------------------------------------

say "📥 Fast-forwarding to $TARGET_SHA..."
if [ "$DRY_RUN" = "1" ] || ! git cat-file -e "${TARGET_SHA}^{commit}" 2>/dev/null; then
  run git fetch "$DEPLOY_REMOTE" main
fi

# --- Self-update -------------------------------------------------------------------------------
# bash keeps executing the deploy.sh it started with, and a rollback resets deploy.sh as well, so a
# fix to deploy.sh itself could never take effect through a deploy. When the target ships a
# different deploy.sh, run that version instead (same target, same env) before changing anything.
if [ "${DEPLOY_SELF_UPDATED:-0}" != "1" ] && ! git show "$TARGET_SHA:deploy.sh" | cmp -s - "$SELF"; then
  if [ "$DRY_RUN" = "1" ]; then
    say "🔁 [dry-run] deploy.sh differs in $TARGET_SHA; a real run would continue with that version"
  else
    say "🔁 deploy.sh changed in $TARGET_SHA — continuing with the new version"
    git show "$TARGET_SHA:deploy.sh" > "$REPO_ROOT/logs/deploy.next.sh"
    chmod +x "$REPO_ROOT/logs/deploy.next.sh"
    exec env DEPLOY_SELF_UPDATED=1 DEPLOY_ROOT="$REPO_ROOT" DEPLOY_TARGET_SHA="$TARGET_SHA" \
      "$REPO_ROOT/logs/deploy.next.sh"
  fi
fi

run git merge --ff-only "$TARGET_SHA"
STAGE="pulled"

say "📦 Installing dependencies (frozen lockfile)..."
run pnpm install --frozen-lockfile

say "🏗️  Building frontend into frontend/dist.new (nginx keeps serving frontend/dist)..."
run rm -rf "$FRONTEND/dist.new"
VITE_API_URL="" NODE_OPTIONS="--max-old-space-size=4096" \
  run pnpm --filter frontend exec vite build --outDir dist.new --emptyOutDir
if [ "$DRY_RUN" != "1" ] && [ ! -f "$FRONTEND/dist.new/index.html" ]; then
  die "Build produced no frontend/dist.new/index.html"
fi

# --- Go live -----------------------------------------------------------------------------------

say "🔀 Swapping frontend: dist → dist.prev, dist.new → dist"
run rm -rf "$FRONTEND/dist.prev"
if [ -d "$FRONTEND/dist" ] || [ "$DRY_RUN" = "1" ]; then
  run mv "$FRONTEND/dist" "$FRONTEND/dist.prev"
fi
run mv "$FRONTEND/dist.new" "$FRONTEND/dist"
STAGE="swapped"

say "🚀 Reloading backend with pm2 ($PM2_INSTANCES instances)..."
if [ "$DRY_RUN" = "1" ]; then
  run pm2 startOrReload backend/ecosystem.config.cjs --env production --update-env
  run pm2 scale "$PM2_APP" "$PM2_INSTANCES"
else
  pm2_reload
fi
STAGE="reloaded"

say "🏥 Running health checks..."
if health_ok; then
  if [ "$DRY_RUN" = "1" ]; then
    log_result "dry-run"
    say "🧪 Dry run complete (health checks above ran against the current live backend)."
  elif [ "$FORCED" = "1" ]; then
    log_result "forced-success"
  else
    log_result "success"
  fi
  FINISHED=1
  [ "$DRY_RUN" = "1" ] || say "✅ Deployed $TARGET_SHA (previous: $PREV_SHA)."
  exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  warn "Health checks fail against the current backend (dry run: no rollback performed)"
  log_result "dry-run"
  FINISHED=1
  exit 0
fi

rollback_live
