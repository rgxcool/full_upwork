#!/bin/bash
# One-off (T2, 2026-11-22): bring the GitHub issues + Project board in line with the corrected audit.
#
#   backend/scripts/sync_audit_issues.sh            # dry run (default): prints every change, changes nothing
#   DRY_RUN=0 backend/scripts/sync_audit_issues.sh  # apply
#
# Safe to re-run: issues are found by their "[ID] " title prefix, edits are only made when the current
# title / labels / body / project field differs, comments carry a marker and are posted once, and
# "Closes #N" is only added to a PR body that doesn't already contain it.
#
# What it does:
#   BUG-12 (#36)  already closed → one closing comment; board status → Klar
#   P1-07  (#43)  re-scope to frontend function coverage 47.97 % < 50 %, base 6 h × 2.2 = 13.2 h
#   P1-11  (#47)  retitle, label bug, priority P0, body describes the pm2 bug + PR #78
#   BUG-10        create (was never created): verify PDF generation on the production host, fix Docker image
#   OPS-01/02/03  create (Sentry dev-only / harden deploy.sh / deploy button)
#   PRs #78 #79 #80 #82  add "Closes #N"
# Board fields set: Status, Priority, Uppskattad tid (tim) (rounded up, as on the existing items),
# Faktureringskategori where the bucket is known.
set -euo pipefail

DRY_RUN=${DRY_RUN:-1}
REPO=${REPO:-Cyrus-Malekani/Mindfullearning}
PROJECT_OWNER=${PROJECT_OWNER:-Cyrus-Malekani}
PROJECT_NUMBER=${PROJECT_NUMBER:-1}
TODAY=2026-11-22

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
CHANGES=0

if [ "$DRY_RUN" = "1" ]; then echo "=== DRY RUN (set DRY_RUN=0 to apply) ==="; else echo "=== APPLYING to $REPO ==="; fi

# Print (dry run) or run a command that changes GitHub.
run() {
  CHANGES=$((CHANGES + 1))
  if [ "$DRY_RUN" = "1" ]; then
    printf '  DRY:'; printf ' %q' "$@"; printf '\n'
  else
    "$@"
  fi
}

# ------------------------------------------------------------------ caches
gh issue list --repo "$REPO" --state all --limit 300 --json number,title,labels,state,body > "$TMP/issues.json"
gh project view "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json > "$TMP/project.json"
gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json > "$TMP/fields.json"
gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --limit 500 --format json > "$TMP/items.json"
PROJECT_ID=$(jq -r .id "$TMP/project.json")

issue_number() {  # ID → issue number ("" if none)
  jq -r --arg p "[$1] " '[.[] | select(.title | startswith($p))][0].number // empty' "$TMP/issues.json"
}
issue_field() { jq -r --argjson n "$1" ".[] | select(.number == \$n) | $2" "$TMP/issues.json"; }
field_id() { jq -r --arg n "$1" '.fields[] | select(.name == $n) | .id' "$TMP/fields.json"; }
option_id() { jq -r --arg f "$1" --arg o "$2" '.fields[] | select(.name == $f) | .options[] | select(.name == $o) | .id' "$TMP/fields.json"; }

# ------------------------------------------------------------------ issue helpers
# ensure_issue ID TITLE LABELS(csv) BODYFILE → sets NUM (or "<new ID>" in dry run)
ensure_issue() {
  local id=$1 title=$2 labels=$3 body=$4 n
  n=$(issue_number "$id")
  if [ -n "$n" ]; then NUM=$n; echo "= $id is #$n"; return; fi
  echo "+ $id does not exist → create \"$title\""
  local args=(gh issue create --repo "$REPO" --title "$title" --body-file "$body")
  IFS=',' read -ra L <<< "$labels"; for l in "${L[@]}"; do args+=(--label "$l"); done
  if [ "$DRY_RUN" = "1" ]; then
    run "${args[@]}"; NUM="<new $id>"
  else
    CHANGES=$((CHANGES + 1))
    local url; url=$("${args[@]}")
    NUM=${url##*/}; echo "  created #$NUM $url"
    jq --argjson n "$NUM" --arg t "$title" --arg b "$(cat "$body")" \
      '. + [{number: $n, title: $t, labels: [], state: "OPEN", body: $b}]' "$TMP/issues.json" > "$TMP/i2" && mv "$TMP/i2" "$TMP/issues.json"
  fi
}

# sync_issue NUM TITLE ADD_LABELS(csv) REMOVE_LABELS(csv) BODYFILE(optional)
sync_issue() {
  local n=$1 title=$2 add=$3 remove=$4 body=${5:-} cur l args=()
  [[ "$n" == "<new"* ]] && return 0
  cur=$(issue_field "$n" .title)
  [ "$cur" != "$title" ] && { echo "  #$n title: \"$cur\" → \"$title\""; args+=(--title "$title"); }
  local have; have=$(issue_field "$n" '[.labels[].name] | join(",")')
  IFS=',' read -ra L <<< "$add"
  for l in "${L[@]}"; do [ -n "$l" ] && [[ ",$have," != *",$l,"* ]] && args+=(--add-label "$l"); done
  IFS=',' read -ra L <<< "$remove"
  for l in "${L[@]}"; do [ -n "$l" ] && [[ ",$have," == *",$l,"* ]] && args+=(--remove-label "$l"); done
  if [ -n "$body" ]; then
    issue_field "$n" .body > "$TMP/cur_body.md"
    # Compare without CRs and trailing newlines (GitHub keeps a body file's final newline, jq -r adds one).
    if [ "$(sed -e 's/\r$//' "$TMP/cur_body.md")" != "$(cat "$body")" ]; then
      echo "  #$n body changes:"; diff -u "$TMP/cur_body.md" "$body" | sed -n '3,$p' | sed 's/^/    /' || true
      args+=(--body-file "$body")
    fi
  fi
  if [ ${#args[@]} -gt 0 ]; then run gh issue edit "$n" --repo "$REPO" "${args[@]}"; else echo "  #$n issue already in sync"; fi
}

# comment_once NUM MARKER TEXT
comment_once() {
  local n=$1 marker=$2 text=$3
  [[ "$n" == "<new"* ]] && return 0
  if gh issue view "$n" --repo "$REPO" --json comments --jq '.comments[].body' | grep -qF "$marker"; then
    echo "  #$n comment $marker already posted"
  else
    printf '%s\n\n%s\n' "$marker" "$text" > "$TMP/comment-$n.md"
    run gh issue comment "$n" --repo "$REPO" --body-file "$TMP/comment-$n.md"
  fi
}

# ------------------------------------------------------------------ project helpers
# project_sync NUM STATUS PRIORITY HOURS BUCKET(optional)
project_sync() {
  local n=$1 status=$2 prio=$3 hours=$4 bucket=${5:-} item cur
  if [[ "$n" == "<new"* ]]; then
    run gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "https://github.com/$REPO/issues/<new>"
    echo "  DRY: then set Status=$status Priority=$prio \"Uppskattad tid (tim)\"=$hours${bucket:+ Faktureringskategori=$bucket}"
    return 0
  fi
  item=$(jq -r --argjson n "$n" '.items[] | select(.content.number == $n) | .id' "$TMP/items.json")
  if [ -z "$item" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      run gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "https://github.com/$REPO/issues/$n"
      echo "  DRY: then set Status=$status Priority=$prio \"Uppskattad tid (tim)\"=$hours${bucket:+ Faktureringskategori=$bucket}"
      return 0
    fi
    CHANGES=$((CHANGES + 1))
    item=$(gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "https://github.com/$REPO/issues/$n" --format json --jq .id)
    echo "  #$n added to project ($item)"
  fi
  set_select "$n" "$item" Status status "$status"
  set_select "$n" "$item" Priority priority "$prio"
  [ -n "$bucket" ] && set_select "$n" "$item" Faktureringskategori faktureringskategori "$bucket"
  cur=$(jq -r --arg i "$item" '.items[] | select(.id == $i) | ."uppskattad tid (tim)" // empty' "$TMP/items.json")
  if [ "$cur" != "$hours" ]; then
    echo "  #$n Uppskattad tid (tim): ${cur:-<empty>} → $hours"
    run gh project item-edit --id "$item" --project-id "$PROJECT_ID" --field-id "$(field_id 'Uppskattad tid (tim)')" --number "$hours"
  fi
}

set_select() {  # NUM ITEM FIELD_NAME JSON_KEY VALUE
  local n=$1 item=$2 field=$3 key=$4 value=$5 cur opt
  cur=$(jq -r --arg i "$item" --arg k "$key" '.items[] | select(.id == $i) | .[$k] // empty' "$TMP/items.json")
  [ "$cur" = "$value" ] && return 0
  opt=$(option_id "$field" "$value")
  [ -n "$opt" ] || { echo "!! $field has no option \"$value\"" >&2; exit 1; }
  echo "  #$n $field: ${cur:-<empty>} → $value"
  run gh project item-edit --id "$item" --project-id "$PROJECT_ID" --field-id "$(field_id "$field")" --single-select-option-id "$opt"
}

# pr_closes PR ISSUE_NUM [LINE_TO_REPLACE_PREFIX]
pr_closes() {
  local pr=$1 n=$2 replace_prefix=${3:-} body
  if [[ "$n" == "<new"* ]]; then echo "  DRY: PR #$pr body gets \"Closes #<issue $n>\""; CHANGES=$((CHANGES + 1)); return 0; fi
  body=$(gh pr view "$pr" --repo "$REPO" --json body --jq .body)
  if printf '%s' "$body" | grep -qE "(Closes|Fixes|Resolves) #$n\b"; then echo "  PR #$pr already says Closes #$n"; return 0; fi
  if [ -n "$replace_prefix" ] && printf '%s\n' "$body" | head -1 | grep -qF "$replace_prefix"; then
    { printf '**Closes #%s**\n' "$n"; printf '%s\n' "$body" | tail -n +2; } > "$TMP/pr-$pr.md"
  else
    { printf '**Closes #%s**\n\n' "$n"; printf '%s\n' "$body"; } > "$TMP/pr-$pr.md"
  fi
  echo "  PR #$pr: add \"Closes #$n\""
  # gh pr edit fails on repos with the deprecated classic-projects GraphQL field; use REST.
  run gh api -X PATCH "repos/$REPO/pulls/$pr" -F "body=@$TMP/pr-$pr.md" --silent
}

# ================================================================== bodies
cat > "$TMP/P1-07.md" <<'EOF'
**P1-07** · etapp-1 · priority P1

## Summary
`make test` fails on the frontend coverage gate: **functions 47.97 % < 50 %** (`frontend/vitest.config.js`). All 486 frontend tests pass. Backend coverage now meets its gate (lines 82.58 % ≥ 78.5 %), so this issue's original backend scope is done. Thresholds must not be lowered. Add tests where they also guard real bugs.

## Evidence
- `frontend/vitest.config.js:32-37` (functions: 50)
- Run on `chore/ops-01-dev-sentry`, 2026-11-22: frontend 486/486 pass, function coverage 47.97 %

## Acceptance criteria
- [ ] Frontend function coverage ≥ 50 % with unchanged thresholds; `make test` green
- [ ] New tests cover: CourseCardBuilder save paths (BUG-04/05 regressions), PermissionsTab, CourseArchiveTab, SearchTabs / ActionPlan*
- [ ] CI blocks merges on coverage failure

## Definition of done
- [ ] Tests exercise real behaviour (no mocking of module-internal code)
- [ ] `make test` and CI green

## Estimate
Base **6 h** × buffer **2.2** = **13.2 h** (buffered)

_Re-scoped 2026-11-22 by the audit issue sync (was: backend coverage 68.36 % → 78.5 %, base 16 h × 2.2 = 35.2 h)._
EOF

cat > "$TMP/P1-11.md" <<'EOF'
**P1-11** · etapp-1 · priority P0 · bug

## Summary
Production runs pm2 in cluster mode (`instances: "max"`), and every worker started the in-process scheduler. Every nightly job (inactivity warnings / avbrott, diplomas, grading reminders, APL kits / status) has therefore run **once per worker** since cluster mode went live. Users can receive duplicate e-mails wherever idempotency is check-then-write.

## Evidence
- `backend/src/services/scheduler.js`
- `backend/ecosystem.config.cjs` (`exec_mode: "cluster"`, `instances: "max"`)

## Fix
PR #78: jobs start only on pm2 worker 0 (`isSchedulerLeader()`, `NODE_APP_INSTANCE`); `SCHEDULER_ENABLED=false` turns jobs off on a node. Test: `backend/tests/unit/schedulerLeader.test.js`. OPS-02 also lowers the worker count to `PM2_INSTANCES` (default 2).

## Acceptance criteria
- [ ] With N pm2 workers each nightly job runs exactly once (worker 0); the others log "skipped (not the pm2 leader)"
- [ ] `SCHEDULER_ENABLED=false` disables jobs on a node
- [ ] Verified on production after deploy: `pm2 logs ML-Backend | grep -i scheduler`

## Open question
- Has the client noticed duplicate inactivity e-mails? Someone should tell them.

## Out of scope (only if we ever run several hosts)
- Mongo-based lease/lock and a job-run history visible to systemadmin

## Estimate
Base **5 h** × buffer **2.2** = **11 h** (buffered)

_Updated 2026-11-22 by the audit issue sync: the real defect is pm2 cluster mode, not a future multi-instance deploy._
EOF

cat > "$TMP/BUG-10.md" <<'EOF'
**BUG-10** · etapp-2 · priority P1

## Summary
Automatic diplomas and studieintyg are rendered with Puppeteer (`backend/src/services/certificatePdf.js`). **Production runs on the host via pm2, not in Docker**, so first verify that Puppeteer can launch Chrome there: browser downloaded to the deploy user's cache, system libraries present, host Node version. If it can't, the nightly diploma scan fails every night with only a log line.

The Docker production image is broken separately. It is `node:25-alpine` with node_modules copied from a `node:25-bookworm` stage, so the glibc Chrome and the native `bcrypt` module don't run there. That image is what CI and any staging container use.

## Evidence
- `backend/src/services/certificatePdf.js:143`
- `Dockerfile:5` (deps FROM bookworm), `Dockerfile:91` (production FROM alpine)

## Acceptance criteria
- [ ] On the production host: render one diplom and one intyg PDF for a fake student ("Test Elev", 19000101-0000) without saving or e-mailing it, and record the result here
- [ ] If it fails on the host: fix it (Chrome/Chromium + `PUPPETEER_EXECUTABLE_PATH`, missing libraries) and document it in `DEPLOYMENT.md`
- [ ] Docker production image: install `chromium` and set `PUPPETEER_EXECUTABLE_PATH`, or move to a Debian slim base; native modules built against the same libc as the runtime
- [ ] CI smoke test generates one PDF in the production image
- [ ] The nightly diploma scan reports PDF failures through `src/utils/monitoring.js` and the job summary, not only the log

## Definition of done
- [ ] Regression test that fails on the old code
- [ ] Verified on the production host (pm2) and in the Docker image

## Estimate
Base **4 h** × buffer **2.2** = **8.8 h** (buffered)

_Created 2026-11-22 by the audit issue sync (missing from the original issue run). Re-scoped: production runs on the host, not Docker; P0 → P1._
EOF

cat > "$TMP/OPS-01.md" <<'EOF'
**OPS-01** · Bugg / Garanti · priority P2

## Summary
Sentry error monitoring for **local development only**. Production never loads it, because student data must not go to a third party without a DPA.

## Fix
PR #79, carried into `fix/audit-etapp1-2` by PR #82 (#79 merged into the already-merged P1-11 branch):
- loaded only via `node --import ./instrument.js` from the backend `dev` script and the Docker `dev` stage, and refuses `NODE_ENV=production`
- app code reports through the no-op facade `backend/src/utils/monitoring.js`; no app module imports `@sentry/*` (enforced by `backend/tests/unit/monitoring.test.js`)
- frontend: `@sentry/vue` is imported dynamically inside `import.meta.env.DEV` and stripped by `vite build`; the SDKs are devDependencies
- Sentry org `mindful-9h` (EU region), projects `mindful-backend` / `mindful-frontend`; DSNs only in `backend/.env.development` and `frontend/.env.development.local`

## Acceptance criteria
- [ ] No Sentry in pm2, `ecosystem.config.cjs`, the Docker production stage or the production build
- [ ] Production bundle check: `__SENTRY__`, `@sentry/`, `ingest.de.sentry.io`, `browserTracingIntegration`, `initDevSentry` all count 0 in `frontend/dist/assets/*.js`
- [ ] Local dev errors from backend and frontend arrive in the EU Sentry projects

## Estimate
Base **4 h** × buffer **2.2** = **8.8 h** (buffered)

_Created 2026-11-22 by the audit issue sync._
EOF

cat > "$TMP/OPS-02.md" <<'EOF'
**OPS-02** · Bugg / Garanti · priority P1

## Summary
Harden the production deploy. The SSH + `./deploy.sh` workflow stays. Before this change, a failed build or a broken release left production half-deployed with no automatic way back. `make deploy` even reloaded pm2 before building.

## Fix
PR #80:
- `DRY_RUN=1`, a deploy lock, `PREV_SHA` recorded
- refuses unless CI for the target `main` commit is green (`FORCE=1` override, logged)
- `vite build --outDir dist.new`, swapped in only after a successful build (`dist.prev` kept)
- automatic rollback on failed `/health/live` or `/health/ready`
- `logs/deploy.log`
- `PM2_INSTANCES` (default 2) instead of `"max"`
- bash test harness in CI; `DEPLOYMENT.md` updated

## Acceptance criteria
- [ ] `DRY_RUN=1 ./deploy.sh` on the production host prints the plan and changes nothing
- [ ] Read-only GitHub token (Actions: Read) installed at `~/.config/mindful-deploy/gh_token`
- [ ] First real deploy logged in `logs/deploy.log`; pm2 runs 2 workers
- [ ] `make test-deploy` green in CI

## Estimate
Base **3 h** × buffer **2.2** = **6.6 h** (buffered)

_Created 2026-11-22 by the audit issue sync._
EOF

cat > "$TMP/OPS-03.md" <<'EOF'
**OPS-03** · priority P2

## Summary
A "deploy button": `.github/workflows/deploy.yml` with `workflow_dispatch` only and `environment: production` (required reviewer: Cyrus). It runs the CI job first, then SSHes in with a deploy key and runs the hardened `./deploy.sh` (OPS-02).

## Acceptance criteria
- [ ] Triggered only by `workflow_dispatch`; needs approval in the `production` environment
- [ ] CI job passes before the deploy job starts
- [ ] Secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`; pinned `known_hosts` (no `StrictHostKeyChecking=no`)
- [ ] Deploy key restricted on the host to running `deploy.sh`
- [ ] The job fails when `deploy.sh` exits non-zero, and shows the exit code (2 = rolled back, 3 = needs a human)
- [ ] `DEPLOYMENT.md` documents the button and the manual fallback

## Depends on
- OPS-02 merged (PR #80)

## Estimate
Base **4 h** × buffer **2.2** = **8.8 h** (buffered)

_Created 2026-11-22 by the audit issue sync._
EOF

# ================================================================== sync
echo; echo "── BUG-12: close with a comment"
N=$(issue_number BUG-12)
comment_once "$N" "<!-- audit-sync:T2:BUG-12 -->" "Closing as fixed (audit sync $TODAY): the 3 originally failing backend tests were fixed in \`2fd2566\` (see the comment above). The full backend suite now passes; last run 2216/2216 on \`chore/ops-01-dev-sentry\`."
if [ "$(issue_field "$N" .state)" != "CLOSED" ]; then run gh issue close "$N" --repo "$REPO" --reason completed; else echo "  #$N already closed"; fi
project_sync "$N" "Klar" "P2" 7

echo; echo "── P1-07: re-scope to frontend function coverage"
N=$(issue_number P1-07)
sync_issue "$N" "[P1-07] Frontend coverage below gate: functions 47.97 % < 50 %" "" "" "$TMP/P1-07.md"
project_sync "$N" "Godkänd" "P1" 14

echo; echo "── P1-11: real bug, P0, PR #78"
N=$(issue_number P1-11); P1_11=$N
sync_issue "$N" "[P1-11] Nightly jobs run once per pm2 worker: duplicate warnings, diplomas and reminders" "bug,priority:P0" "priority:P1" "$TMP/P1-11.md"
project_sync "$N" "Godkänd" "P0" 11 "Bugg / Garanti"

echo; echo "── BUG-10: PDF generation on the production host"
ensure_issue BUG-10 "[BUG-10] Verify PDF generation (diplom, intyg) on the production host; fix the Docker image" "bug,etapp-2,ci-cd,priority:P1" "$TMP/BUG-10.md"
sync_issue "$NUM" "[BUG-10] Verify PDF generation (diplom, intyg) on the production host; fix the Docker image" "bug,etapp-2,ci-cd,priority:P1" "" "$TMP/BUG-10.md"
project_sync "$NUM" "Buggar och Säkerhet" "P1" 9 "Bugg / Garanti"

echo; echo "── OPS-01: dev-only Sentry (PR #79)"
ensure_issue OPS-01 "[OPS-01] Sentry error monitoring for local development (never production)" "tech-debt,priority:P2" "$TMP/OPS-01.md"; OPS_01=$NUM
project_sync "$NUM" "Godkänd" "P2" 9 "Bugg / Garanti"

echo; echo "── OPS-02: harden deploy.sh (PR #80)"
ensure_issue OPS-02 "[OPS-02] Harden deploy.sh: CI gate, atomic frontend build, automatic rollback" "tech-debt,ci-cd,priority:P1" "$TMP/OPS-02.md"; OPS_02=$NUM
project_sync "$NUM" "Godkänd" "P1" 7 "Bugg / Garanti"

echo; echo "── OPS-03: deploy button"
ensure_issue OPS-03 "[OPS-03] Deploy button: GitHub Actions workflow_dispatch with production approval" "ci-cd,tech-debt,priority:P2" "$TMP/OPS-03.md"
project_sync "$NUM" "Specificerad & Offertad" "P2" 9

echo; echo "── PRs: Closes #N"
pr_closes 78 "$P1_11"
pr_closes 79 "$OPS_01"
pr_closes 82 "$OPS_01"
pr_closes 80 "$OPS_02" "**Issue:** OPS-02"

echo
if [ "$DRY_RUN" = "1" ]; then echo "=== DRY RUN: $CHANGES change(s) would be made ==="; else echo "=== Done: $CHANGES change(s) made ==="; fi
