#!/bin/bash
# Test harness for deploy.sh (OPS-02). Run: make test-deploy  (or bash tests/deploy/deploy.test.sh)
#
# Each case builds a throwaway "server" checkout (real git, cloned from a local bare repo) with the
# real deploy.sh, and puts stubs for pnpm, pm2, curl, gh and sleep first on PATH. The stubs record
# their calls and can be told to fail, so we can assert the CI gate, the atomic frontend swap and
# both rollback paths without pm2, nginx or the network. Nothing outside a temp dir is touched.
set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DEPLOY_SH=${DEPLOY_SH:-"$REPO_ROOT/deploy.sh"}   # override to test another version
NODE_DIR=$(dirname "$(command -v node)")
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0
CASE=""

# ---------------------------------------------------------------- stubs
STUBS="$WORK/stubs"
mkdir -p "$STUBS"

cat > "$STUBS/pnpm" <<'EOF'
#!/bin/bash
echo "pnpm $*" >> "$STUB_LOG"
case "$*" in
  --version) echo "11.0.0" ;;
  *install*)
    [ "${STUB_INSTALL_FAIL:-0}" = "1" ] && [ "$(git rev-parse HEAD)" = "$TARGET" ] && exit 1
    exit 0 ;;
  *"vite build"*)
    [ "${STUB_BUILD_FAIL:-0}" = "1" ] && { echo "vite: build error" >&2; exit 1; }
    mkdir -p frontend/dist.new && git rev-parse HEAD > frontend/dist.new/index.html ;;
esac
EOF

# pm2: like the real CLI, `scale` to the current worker count prints "Nothing to do" and exits 1.
# `jlist` reports $STUB_PM2_RUNNING workers of ML-Backend (default 1).
cat > "$STUBS/pm2" <<'EOF'
#!/bin/bash
echo "pm2 $*" >> "$STUB_LOG"
running=${STUB_PM2_RUNNING:-1}
case "$1" in
  jlist)
    printf '['; for i in $(seq 1 "$running"); do [ "$i" -gt 1 ] && printf ','; printf '{"name":"ML-Backend","pm_id":%s}' "$((i-1))"; done; printf ']\n' ;;
  scale)
    [ "$3" = "$running" ] && { echo "[PM2][ERROR] Nothing to do" >&2; exit 1; } ;;
esac
exit 0
EOF

# curl: GitHub API → canned JSON; health → fails while the checkout is at $TARGET (fail_on_target)
# or always (fail_always).
cat > "$STUBS/curl" <<'EOF'
#!/bin/bash
# Read stdin only when deploy.sh passes one (--config -); a blind `cat` hangs forever when the
# harness runs from a non-tty shell whose stdin is never closed.
case " $* " in *" --config - "*) STDIN=$(cat) ;; esac
echo "curl $* | stdin: ${STDIN:-}" >> "$STUB_CURL_LOG"
case "$*" in
  *api.github.com*)
    [ -n "${STUB_CI_JSON:-}" ] || exit 22
    printf '%s' "$STUB_CI_JSON" ;;
  *"/health/"*)
    case "${STUB_HEALTH:-ok}" in
      fail_always) exit 22 ;;
      fail_on_target) [ "$(git -C "$SERVER" rev-parse HEAD)" = "$TARGET" ] && exit 22 ;;
    esac
    exit 0 ;;
esac
EOF

printf '#!/bin/bash\nexit 1\n' > "$STUBS/gh"     # never authenticated
printf '#!/bin/bash\nexit 0\n' > "$STUBS/sleep"  # keep tests fast
chmod +x "$STUBS"/*

# ---------------------------------------------------------------- fixture
# Creates $SERVER at commit $PREV with a live frontend/dist, and pushes $TARGET to the remote main.
setup() {
  CASE=$1
  local d="$WORK/$CASE"
  mkdir -p "$d"
  git init -q --bare -b main "$d/remote.git"
  git clone -q "$d/remote.git" "$d/seed" 2>/dev/null
  (
    cd "$d/seed"
    git config user.email t@example.invalid; git config user.name Test
    mkdir -p backend frontend
    cp "${PREV_DEPLOY_SH:-$DEPLOY_SH}" deploy.sh   # the deploy.sh that is live on the server
    echo "module.exports = { apps: [] };" > backend/ecosystem.config.cjs
    printf 'logs\nfrontend/dist\nfrontend/dist.new\nfrontend/dist.prev\nfrontend/dist.failed\n' > .gitignore
    echo v1 > frontend/version.txt
    git add -A && git commit -qm v1 && git push -q origin main
  )
  PREV=$(git -C "$d/seed" rev-parse HEAD)
  git clone -q "$d/remote.git" "$d/server"
  SERVER="$d/server"
  mkdir -p "$SERVER/frontend/dist" && echo "$PREV" > "$SERVER/frontend/dist/index.html"
  (
    cd "$d/seed" && echo v2 > frontend/version.txt && cp "$DEPLOY_SH" deploy.sh &&
      git commit -qam v2 && git push -q origin main
  )
  TARGET=$(git -C "$d/seed" rev-parse HEAD)

  echo "ghp_TESTTOKEN_not_real" > "$d/token"
  export STUB_LOG="$d/calls.log" STUB_CURL_LOG="$d/curl.log" SERVER TARGET
  : > "$STUB_LOG"; : > "$STUB_CURL_LOG"
  export DEPLOY_GH_TOKEN_FILE="$d/token" DEPLOY_REPO="test/repo"
  ci_json success
  unset STUB_HEALTH STUB_BUILD_FAIL STUB_INSTALL_FAIL STUB_PM2_RUNNING DRY_RUN FORCE PM2_INSTANCES
}

ci_json() {  # ci_json success|failure|pending|none
  case $1 in
    none) export STUB_CI_JSON='{"workflow_runs":[]}' ;;
    pending) export STUB_CI_JSON="{\"workflow_runs\":[{\"name\":\"CI\",\"head_sha\":\"$TARGET\",\"status\":\"in_progress\",\"conclusion\":null,\"created_at\":\"2026-01-01T00:00:00Z\"}]}" ;;
    *) export STUB_CI_JSON="{\"workflow_runs\":[{\"name\":\"CI\",\"head_sha\":\"$TARGET\",\"status\":\"completed\",\"conclusion\":\"$1\",\"created_at\":\"2026-01-01T00:00:00Z\"}]}" ;;
  esac
}

deploy() {
  OUT=$(cd "$SERVER" && PATH="$STUBS:$NODE_DIR:/usr/bin:/bin" ./deploy.sh 2>&1)
  CODE=$?
}

# ---------------------------------------------------------------- assertions
ok()   { PASS=$((PASS + 1)); }
bad()  { FAIL=$((FAIL + 1)); echo "  ✗ [$CASE] $*"; }
eq()   { [ "$2" = "$3" ] && ok || bad "$1: expected '$3', got '$2'"; }
has()  { grep -qF -- "$2" "$1" 2>/dev/null && ok || bad "expected '$2' in $(basename "$1")"; }
hasnt(){ grep -qF -- "$2" "$1" 2>/dev/null && bad "did not expect '$2' in $(basename "$1")" || ok; }
out_has() { printf '%s' "$OUT" | grep -qF -- "$1" && ok || bad "expected output to contain '$1'"; }
head_is() { eq "HEAD" "$(git -C "$SERVER" rev-parse HEAD)" "$1"; }
dist_is() { eq "frontend/${2:-dist}" "$(cat "$SERVER/frontend/${2:-dist}/index.html" 2>/dev/null)" "$1"; }
last_log() { eq "deploy.log result" "$(tail -1 "$SERVER/logs/deploy.log" 2>/dev/null | awk '{print $4}')" "$1"; }
count() { grep -cF -- "$2" "$1" 2>/dev/null || true; }
show_on_fail() { [ "$FAIL" -gt "$1" ] && printf '%s\n' "$OUT" | sed 's/^/      | /'; }

# ---------------------------------------------------------------- cases
t() { local before=$FAIL; "$@"; show_on_fail "$before"; }

case_happy_path() {
  setup happy; deploy
  eq "exit" "$CODE" 0
  head_is "$TARGET"; dist_is "$TARGET"; dist_is "$PREV" dist.prev
  [ ! -e "$SERVER/frontend/dist.new" ] && ok || bad "dist.new left behind"
  has "$STUB_LOG" "pm2 startOrReload ecosystem.config.cjs --env production --update-env"
  has "$STUB_LOG" "pm2 scale ML-Backend 2"
  has "$STUB_LOG" "pnpm --filter frontend exec vite build --outDir dist.new --emptyOutDir"
  last_log success
  eq "deploy.log sha" "$(tail -1 "$SERVER/logs/deploy.log" | awk '{print $2}')" "$TARGET"
  has "$STUB_CURL_LOG" "https://api.github.com/repos/test/repo/actions/runs?head_sha=$TARGET"
  # The token reaches curl only on stdin, never in argv.
  eq "token in curl argv" "$(grep -F 'api.github.com' "$STUB_CURL_LOG" | sed 's/ | stdin:.*//' | grep -c TESTTOKEN)" 0
  has "$STUB_CURL_LOG" "stdin: header = \"Authorization: Bearer ghp_TESTTOKEN_not_real\""
}

case_ci_red_refused() {
  setup ci-red; ci_json failure; deploy
  eq "exit" "$CODE" 1
  head_is "$PREV"; dist_is "$PREV"
  hasnt "$STUB_LOG" "install"; hasnt "$STUB_LOG" "pm2"
  last_log refused-ci-failure
}

case_ci_pending_refused() {
  setup ci-pending; ci_json pending; deploy
  eq "exit" "$CODE" 1; head_is "$PREV"; last_log refused-ci-pending
}

case_ci_unknown_without_credentials() {
  setup ci-nocreds; export DEPLOY_GH_TOKEN_FILE="$WORK/does-not-exist"; deploy
  eq "exit" "$CODE" 1; head_is "$PREV"; last_log refused-ci-unknown
}

case_force_overrides_red_ci() {
  setup force; ci_json failure; export FORCE=1; deploy
  eq "exit" "$CODE" 0
  head_is "$TARGET"; dist_is "$TARGET"
  out_has "FORCE=1: deploying $TARGET WITHOUT green CI (status: failure)"
  last_log forced-success
}

case_build_failure_keeps_live_version() {
  setup build-fail; export STUB_BUILD_FAIL=1; deploy
  eq "exit" "$CODE" 1
  head_is "$PREV"; dist_is "$PREV"
  [ ! -e "$SERVER/frontend/dist.prev" ] && ok || bad "dist.prev should not exist (no swap happened)"
  hasnt "$STUB_LOG" "pm2"
  eq "pnpm install calls (deploy + restore)" "$(count "$STUB_LOG" "pnpm install --frozen-lockfile")" 2
  last_log build-failed
}

case_install_failure_resets_code() {
  setup install-fail; export STUB_INSTALL_FAIL=1; deploy
  eq "exit" "$CODE" 1; head_is "$PREV"; dist_is "$PREV"; hasnt "$STUB_LOG" "pm2"; last_log build-failed
}

case_failed_health_rolls_back() {
  setup health-fail; export STUB_HEALTH=fail_on_target; deploy
  eq "exit" "$CODE" 2
  head_is "$PREV"; dist_is "$PREV"; dist_is "$TARGET" dist.failed
  eq "pm2 reloads (deploy + rollback)" "$(count "$STUB_LOG" "pm2 startOrReload")" 2
  eq "pnpm install calls (deploy + rollback)" "$(count "$STUB_LOG" "pnpm install --frozen-lockfile")" 2
  out_has "Rolled back to $PREV"
  last_log rolled-back
}

case_rollback_that_stays_unhealthy() {
  setup rollback-fail; export STUB_HEALTH=fail_always; deploy
  eq "exit" "$CODE" 3; head_is "$PREV"; dist_is "$PREV"; out_has "ROLLBACK FAILED"; last_log rollback-failed
}

case_dry_run_changes_nothing() {
  setup dry-run; export DRY_RUN=1; deploy
  eq "exit" "$CODE" 0
  head_is "$PREV"; dist_is "$PREV"
  eq "remote-tracking ref not fetched" "$(git -C "$SERVER" rev-parse origin/main)" "$PREV"
  [ ! -e "$SERVER/frontend/dist.new" ] && [ ! -e "$SERVER/frontend/dist.prev" ] && ok || bad "dist.new/dist.prev created"
  [ ! -e "$SERVER/logs" ] && ok || bad "logs/ was created"
  hasnt "$STUB_LOG" "pm2"; hasnt "$STUB_LOG" "install"; hasnt "$STUB_LOG" "vite"
  out_has "[dry-run] git merge --ff-only $TARGET"
  out_has "[dry-run] pnpm --filter frontend exec vite build --outDir dist.new --emptyOutDir"
  out_has "[dry-run] pm2 scale ML-Backend 2"
  out_has "[dry-run] would log:"
}

case_already_live_is_noop() {
  setup noop; git -C "$SERVER" pull -q --ff-only; deploy
  eq "exit" "$CODE" 0; head_is "$TARGET"; hasnt "$STUB_LOG" "install"; hasnt "$STUB_LOG" "pm2"; last_log noop
}

case_dirty_tree_refused() {
  setup dirty; echo local-edit >> "$SERVER/deploy.sh"; deploy
  eq "exit" "$CODE" 1; out_has "Working tree is not clean"; hasnt "$STUB_LOG" "install"
}

case_concurrent_deploy_locked() {
  setup locked; mkdir -p "$SERVER/logs"
  exec 8>"$SERVER/logs/deploy.lock"; flock -n 8
  deploy
  exec 8>&-
  eq "exit" "$CODE" 1; out_has "Another deploy is running"; head_is "$PREV"
}

case_pm2_instances_override() {
  setup instances; export PM2_INSTANCES=4; deploy
  eq "exit" "$CODE" 0; has "$STUB_LOG" "pm2 scale ML-Backend 4"
}

# Production runs 1 worker (PM2_INSTANCES=1): scaling to the count already running must not fail
# the deploy (pm2 exits 1 with "Nothing to do", which used to trigger a rollback).
case_pm2_scale_already_at_count() {
  setup samecount; export PM2_INSTANCES=1 STUB_PM2_RUNNING=1; deploy
  eq "exit" "$CODE" 0; head_is "$TARGET"; dist_is "$TARGET"; last_log success
  hasnt "$STUB_LOG" "pm2 scale"
}

# The live deploy.sh still has a bug the target's deploy.sh fixes (here: the unconditional
# `pm2 scale` that failed on production's single worker). bash keeps running the old file and the
# rollback resets it, so the fix could never ship. deploy.sh must continue with the target's copy.
old_deploy_sh() {
  local f="$WORK/old-deploy.sh"
  sed 's/^  if \[ "\$running" = "\$PM2_INSTANCES" \]; then$/  if false; then/' "$DEPLOY_SH" > "$f"
  chmod +x "$f"
  cmp -s "$f" "$DEPLOY_SH" && { echo "old_deploy_sh: pattern not found in deploy.sh" >&2; exit 1; }
  echo "$f"
}

case_self_update_runs_target_deploy_sh() {
  PREV_DEPLOY_SH=$(old_deploy_sh) setup selfupdate; export PM2_INSTANCES=1 STUB_PM2_RUNNING=1; deploy
  eq "exit" "$CODE" 0; head_is "$TARGET"; dist_is "$TARGET"; last_log success
  out_has "deploy.sh changed in $TARGET — continuing with the new version"
  eq "self-update happens once" "$(printf '%s' "$OUT" | grep -cF 'deploy.sh changed')" 1
  hasnt "$STUB_LOG" "pm2 scale"
  eq "logs/deploy.next.sh is the target's deploy.sh" \
    "$(cmp -s "$SERVER/logs/deploy.next.sh" "$DEPLOY_SH" && echo same)" same
}

case_self_update_dry_run_changes_nothing() {
  PREV_DEPLOY_SH=$(old_deploy_sh) setup selfupdate-dry; export DRY_RUN=1; deploy
  eq "exit" "$CODE" 0; head_is "$PREV"; dist_is "$PREV"
  out_has "[dry-run] deploy.sh differs in $TARGET"
  [ ! -e "$SERVER/logs" ] && ok || bad "logs/ was created"
}

case_ecosystem_reads_pm2_instances() {
  CASE=ecosystem
  local f="$REPO_ROOT/backend/ecosystem.config.cjs"
  eq "default instances" "$(env -u PM2_INSTANCES node -e "console.log(require('$f').apps[0].instances)")" 2
  eq "PM2_INSTANCES=3" "$(PM2_INSTANCES=3 node -e "console.log(require('$f').apps[0].instances)")" 3
  eq "exec_mode" "$(node -e "console.log(require('$f').apps[0].exec_mode)")" cluster
}

for c in $(declare -F | awk '{print $3}' | grep '^case_'); do
  t "$c"
  echo "• ${c#case_}"
done

echo
echo "deploy.sh tests: $PASS assertions passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
