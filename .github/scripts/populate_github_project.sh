#!/usr/bin/env bash
# populate_github_project.sh — create labels + issues and add them to a GitHub Project (v2).
#
# Usage (WSL2 / Linux / macOS):
#   gh auth login                      # once
#   gh auth refresh -s project         # once: Projects v2 needs the "project" scope
#   OWNER=my-org REPO=mindful-new PROJECT_NUMBER=3 .github/scripts/populate_github_project.sh
#
# Options (env vars):
#   OWNER            repo owner (user or org)                       [required]
#   REPO             repo name                                      [required]
#   PROJECT_NUMBER   number in the project URL .../projects/<N>     [required]
#   PROJECT_OWNER    owner of the project if it differs from OWNER (use "@me" for a user project)
#   DRY_RUN=1        print what would happen, change nothing
#   ESTIMATE_FIELD   name of a NUMBER field in the project to fill with the buffered hours
#                    (default "Estimate (h)"; skipped silently if the field doesn't exist)
#   ONLY             comma-separated issue IDs to create, e.g. ONLY=BUG-01,BUG-02
#
# Re-runnable: labels are upserted, issues are matched by exact title and reused,
# and adding an existing item to the project is a no-op.
set -euo pipefail

: "${OWNER:?set OWNER}"; : "${REPO:?set REPO}"; : "${PROJECT_NUMBER:?set PROJECT_NUMBER}"
PROJECT_OWNER="${PROJECT_OWNER:-$OWNER}"
DRY_RUN="${DRY_RUN:-0}"
ESTIMATE_FIELD="${ESTIMATE_FIELD:-Estimate (h)}"
ONLY="${ONLY:-}"
SLUG="$OWNER/$REPO"

command -v gh >/dev/null || { echo "gh CLI not found: https://cli.github.com" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq not found (sudo apt install jq)" >&2; exit 1; }

run() { if [[ "$DRY_RUN" == "1" ]]; then echo "DRY: $*" >&2; else "$@"; fi; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
CREATED=0; REUSED=0; FAILED=0

# ---------------------------------------------------------------- preflight
if [[ "$DRY_RUN" != "1" ]]; then
  gh auth status >/dev/null 2>&1 || { echo "Run: gh auth login" >&2; exit 1; }
  gh repo view "$SLUG" >/dev/null || { echo "Cannot access repo $SLUG" >&2; exit 1; }
  if ! gh project view "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" >/dev/null 2>&1; then
    echo "Cannot access project #$PROJECT_NUMBER for owner $PROJECT_OWNER." >&2
    echo "Run: gh auth refresh -s project   (and check PROJECT_OWNER)" >&2
    exit 1
  fi
  PROJECT_ID="$(gh project view "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json --jq .id)"
  FIELD_ID="$(gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json \
      --jq ".fields[] | select(.name==\"$ESTIMATE_FIELD\" and .type==\"ProjectV2Field\") | .id" 2>/dev/null || true)"
  [[ -n "$FIELD_ID" ]] && echo "Will fill project field '$ESTIMATE_FIELD'." || echo "No NUMBER field '$ESTIMATE_FIELD' in project — estimates stay in the issue body only."
  # Cache existing issue titles once (exact-title de-duplication).
  gh issue list --repo "$SLUG" --state all --limit 1000 --json title,url \
    --jq '.[] | [.title, .url] | @tsv' > "$TMP/existing.tsv"
else
  PROJECT_ID=""; FIELD_ID=""; : > "$TMP/existing.tsv"
fi

# ------------------------------------------------------------------ labels
ensure_label() { run gh label create "$1" --repo "$SLUG" --color "$2" --description "$3" --force >/dev/null; echo "label: $1"; }

# ------------------------------------------------------------------ issues
# create_issue ID TITLE LABELS(csv) BUFFERED_HOURS  < body
create_issue() {
  local id="$1" title="$2" labels="$3" est="$4" url="" item_id="" clean_num=""
  local bodyfile="$TMP/$id.md"; cat > "$bodyfile"
  if [[ -n "$ONLY" && ",$ONLY," != *",$id,"* ]]; then return 0; fi

  url="$(awk -F'\t' -v t="$title" '$1==t {print $2; exit}' "$TMP/existing.tsv")"
  if [[ -n "$url" ]]; then
    echo "= $id exists: $url"; REUSED=$((REUSED+1))
  else
    local args=(--repo "$SLUG" --title "$title" --body-file "$bodyfile")
    IFS=',' read -ra L <<< "$labels"; for l in "${L[@]}"; do args+=(--label "$l"); done
    if [[ "$DRY_RUN" == "1" ]]; then
      echo "DRY: gh issue create --title \"$title\" --label $labels  (${est}h)"; CREATED=$((CREATED+1)); return 0
    fi
    if ! url="$(gh issue create "${args[@]}")"; then
      echo "! $id failed to create" >&2; FAILED=$((FAILED+1)); return 0
    fi
    printf '%s\t%s\n' "$title" "$url" >> "$TMP/existing.tsv"
    echo "+ $id $url"; CREATED=$((CREATED+1))
  fi

  # Add to project (idempotent) and optionally set the estimate field.
  if [[ "$DRY_RUN" != "1" ]]; then
    if item_id="$(gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$url" --format json --jq .id 2>/dev/null || true)"; then
      if [[ -z "$item_id" ]]; then
        item_id="$(gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json --jq ".items[] | select(.content.url==\"$url\") | .id" 2>/dev/null || true)"
      fi
      if [[ -n "$FIELD_ID" && -n "$item_id" ]]; then
        clean_num="$(awk -v v="$est" 'BEGIN {
          n = v + 0;
          printf "%d\n", (n == int(n)) ? n : int(n) + 1;
        }')"
        gh project item-edit --id "$item_id" --project-id "$PROJECT_ID" --field-id "$FIELD_ID" --number "$clean_num" >/dev/null \
          || echo "  (could not set $ESTIMATE_FIELD on $id with value '$clean_num')" >&2
      fi
    else
      echo "! $id: could not add to project #$PROJECT_NUMBER" >&2; FAILED=$((FAILED+1))
    fi
  fi
}

echo "== Labels"
ensure_label parking-lot C5DEF5 'Idea or vendor-blocked item; not scheduled yet'
ensure_label feature 1D76DB 'Scoped / quoted feature work'
ensure_label bug D73A4A 'Broken behaviour in delivered functionality'
ensure_label etapp-1 0E8A16 'Etapp 1 – core system, permissions, registers'
ensure_label etapp-2 5319E7 'Etapp 2 – lärplattform, communication, automation'
ensure_label phase-1-wrapup FBCA04 'Remaining Etapp 1 / Milestone 3 close-out work'
ensure_label quote-separately B60205 'High-risk scope outside the agreed Etapp list – quote separately'
ensure_label security 8B0000 'Security / privacy / tenant isolation'
ensure_label tech-debt BFD4F2 'Internal quality work'
ensure_label ci-cd 006B75 'Build, test and deploy pipeline'
ensure_label needs-decision F9D0C4 'Blocked on a client / product decision'
ensure_label needs-repro FEF2C0 'Needs a reproduction before fixing'
ensure_label priority:P0 B60205 'Blocker – fix before go-live'
ensure_label priority:P1 D93F0B High
ensure_label priority:P2 FBCA04 Normal

echo "== Bugs (12 issues, 80.3 h buffered)"
create_issue BUG-01 'Hidden course-card modules are still shown to students' bug,etapp-2,priority:P0,security 11.0 <<'BODY_EOF'
**BUG-01** · etapp-2 · priority P0

## Summary
The hide-from-student flag on kurskort modules does not take effect for real data. Content is written to `CourseInstance.content` with string keys, but the visibility helper looks it up with a number, so the overlay never matches. Even when it does match, the hidden module's `sections[]` (the actual lesson text) are spread through unchanged.

## Evidence
- `backend/src/controllers/courseMatchingController.js:2867` — `instance.content.set(key, entry)` with `key = String(moduleNumber)`
- `backend/src/utils/courseContentVisibility.js:11` — `content.get(Number(module.moduleNumber))`
- `backend/tests/unit/enrollmentService.test.js:329 and learningController.test.js:174 mock `new Map([[2, …]])` with NUMBER keys, so the tests pass against a shape production never has`

## Acceptance criteria
- [ ] A module flagged `isHiddenFromStudent` is replaced by the placeholder on `/course-cards/mine`, `/students/:id/course-cards` and `/learning/instances/:id/modules` for a student caller
- [ ] Hidden modules return no `sections`, `assignment` or `instructions` to students
- [ ] Lookup works for both MongooseMap (hydrated) and plain object (`.lean()`) content
- [ ] Tests build content through the real model (string keys) and fail on the old code

## Definition of done
- [ ] Regression test that fails on the old code
- [ ] Verified on staging in the production Docker image

## Estimate
Base **5 h** × buffer **2.2** = **11 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue BUG-02 'Responsible teacher gets 403 when posting on the kurskort anslagstavla' bug,etapp-2,priority:P0 4.4 <<'BODY_EOF'
**BUG-02** · etapp-2 · priority P0

## Summary
`postCourseInstanceActivityFeed` compares `instance.responsibleTeacher` (a Teacher `_id`) with `user.userId` (a User `_id`). They never match, so only admin/systemadmin can post. This was flagged in AUDIT_REPORT.md finding 6 and is still present; there are no tests for the activity-feed routes.

## Evidence
- `backend/src/controllers/courseMatchingController.js:3034`
- `backend/src/models/CourseInstance.js:57` — `responsibleTeacher: { ref: "Teacher" }`

## Acceptance criteria
- [ ] Responsible and assistant teacher can post; any other teacher gets 403
- [ ] Resolve Teacher → userId the same way `getCourseInstanceContent` does
- [ ] Use the `roles[]` array, not only `user.role`
- [ ] Integration tests cover admin / responsible / assistant / other teacher / student

## Definition of done
- [ ] Regression test that fails on the old code
- [ ] Verified on staging in the production Docker image

## Estimate
Base **2 h** × buffer **2.2** = **4.4 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue BUG-03 'Any student can read any kurskort'"'"'s content and activity feed (IDOR)' bug,etapp-2,priority:P0,security 6.6 <<'BODY_EOF'
**BUG-03** · etapp-2 · priority P0

## Summary
`GET /course-instances/:id/content` lets every user with the student role through, with no enrollment check. `GET /course-instances/:id/activity-feed` has no authorization beyond login. Assistant teachers are also refused content edit even though they are linked to the card.

## Evidence
- `backend/src/controllers/courseMatchingController.js:2745` — `isStudent` grants read access
- `backend/src/controllers/courseMatchingController.js:2972` — activity feed GET has no access check
- `backend/src/router/courseMatchingRoutes.js:194-226` — routes are `isAuthenticated` only

## Acceptance criteria
- [ ] A student can read content and feed only for instances where they have an active enrollment
- [ ] Staff access follows the same rules as `getCourseInstanceById` (incl. tenant scope)
- [ ] Assistant teacher can read; edit rights decided and documented
- [ ] Negative tests: other student → 403, unrelated teacher → 403

## Definition of done
- [ ] Regression test that fails on the old code
- [ ] Verified on staging in the production Docker image

## Estimate
Base **3 h** × buffer **2.2** = **6.6 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue BUG-04 'Saving a kurskort in CourseCardBuilder wipes the per-module date plan' bug,etapp-2,priority:P1 6.6 <<'BODY_EOF'
**BUG-04** · etapp-2 · priority P1

## Summary
`PUT /course-instances/:id/content` with `modules[]` rebuilds every module from the payload and drops `startDate`/`endDate`. Datumplanering applied at creation is lost on the first save; reports then fall back to `sectionDates` by index, which is wrong once modules are added or removed.

## Evidence
- `backend/src/controllers/courseMatchingController.js:2884` — mapping omits startDate/endDate
- `backend/src/controllers/learningController.js:60` — reports read `module.startDate` first

## Acceptance criteria
- [ ] Module dates survive a content save (merge by moduleNumber, do not replace)
- [ ] Adding a module gets a date from the teacher's schedule parameters or stays explicitly unscheduled
- [ ] Regression test: create instance → save content → dates unchanged

## Definition of done
- [ ] Regression test that fails on the old code
- [ ] Verified on staging in the production Docker image

## Estimate
Base **3 h** × buffer **2.2** = **6.6 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue BUG-05 'Kursmallar saved from the builder never auto-apply, and every save creates a duplicate' bug,etapp-2,priority:P1 13.2 <<'BODY_EOF'
**BUG-05** · etapp-2 · priority P1

## Summary
`saveAsTemplate` always POSTs (no update path), so editing a template creates a new copy. The payload has no `courseId`, while admission looks templates up by `courseId` only, so builder-made templates are never used when kurskort are auto-created. The `content` map (hidden flags) is stored as `cardContent` and ignored on reload.

## Evidence
- `frontend/src/views/Admin/CourseCardBuilder.vue:1184` — always `api.post('/course-templates')`
- `backend/src/utils/courseMatchingService.js:201` — `CourseTemplate.findOne({ courseId: mainCourseId })`
- `backend/src/models/CourseTemplate.js` — no `content` field

## Acceptance criteria
- [ ] Builder edits an existing template with PUT; 'Save as new' is a separate explicit action
- [ ] Template must be linked to a Course (picker in builder and CourseTemplates view)
- [ ] A new admission for that course creates a kurskort with the template's modules
- [ ] Hidden flags round-trip through a template

## Definition of done
- [ ] Regression test that fails on the old code
- [ ] Verified on staging in the production Docker image

## Estimate
Base **6 h** × buffer **2.2** = **13.2 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue BUG-06 '/profile (Min profil) shows an error' bug,etapp-1,priority:P1,needs-repro 6.6 <<'BODY_EOF'
**BUG-06** · etapp-1 · priority P1

## Summary
Reported error on `/profile`. A static read did not find the root cause. The page loads `GET /api/task` and `GET /api/documents/shared` on mount and toasts 'Kunde inte hämta delade dokument' on any failure. Candidates: `sharedWith` matched against `req.user.userId` when the token carries `_id`; populate failures on legacy documents; a role without tasks.

## Evidence
- `frontend/src/views/Teacher/ProfilePage.vue:256`
- `backend/src/router/documentRoutes.js:710`
- `backend/src/router/taskRoutes.js:20`

## Acceptance criteria
- [ ] Reproduced per role (student, teacher, admin, coordinator) with the network log attached
- [ ] Root cause fixed; the page loads with no toast for a user with zero tasks and zero shared docs
- [ ] Playwright test opens /profile for every role and asserts no error toast

## Definition of done
- [ ] Regression test that fails on the old code
- [ ] Verified on staging in the production Docker image

## Estimate
Base **3 h** × buffer **2.2** = **6.6 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue BUG-07 'Chatbot retrieval misses lesson text and ignores hidden modules' bug,etapp-2,priority:P1,security 8.8 <<'BODY_EOF'
**BUG-07** · etapp-2 · priority P1

## Summary
The chatbot indexes `module.instructions`, which is not a schema field (lesson text lives in `sections[].instructions`), so answers come almost only from titles and assignments. It also reads `instance.modules` directly and never applies `isHiddenFromStudent`, so hidden content can leak through answers.

## Evidence
- `backend/src/services/chatbotService.impl.js:196-206`
- `backend/src/models/courseModuleSchema.js` — `instructions` exists only on sections

## Acceptance criteria
- [ ] Retrieval indexes section titles and instructions
- [ ] Hidden modules are excluded for student callers (reuse the fixed BUG-01 helper)
- [ ] Only courses the student is enrolled in are searched (already true when courseInstanceId is passed; verify the default path)

## Definition of done
- [ ] Regression test that fails on the old code
- [ ] Verified on staging in the production Docker image

## Estimate
Base **4 h** × buffer **2.2** = **8.8 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue BUG-08 'Revenue is 0 for Stockholm (no price entry)' bug,etapp-1,priority:P1,needs-decision 3.3 <<'BODY_EOF'
**BUG-08** · etapp-1 · priority P1

## Summary
Stockholm is a valid kommun but has no row in either pricing table, so revenue and forecast report 0 kr. Flagged in AUDIT_REPORT.md finding 7 and still open.

## Evidence
- `backend/src/utils/municipalityPricing.js`
- `frontend/src/utils/municipalityPricing.js`
- `backend/src/config/municipalities.js:19`

## Acceptance criteria
- [ ] Client confirms Stockholm prices (A–E / F / Streck)
- [ ] One pricing source shared by backend and frontend (remove the duplicate table)
- [ ] Startup check: every kommun in municipalities.js has a price row

## Definition of done
- [ ] Regression test that fails on the old code
- [ ] Verified on staging in the production Docker image

## Estimate
Base **1.5 h** × buffer **2.2** = **3.3 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue BUG-09 'deploy.yml is in github/ instead of .github/ and never runs' bug,etapp-1,priority:P1,ci-cd 2.2 <<'BODY_EOF'
**BUG-09** · etapp-1 · priority P1

## Summary
GitHub only reads workflows from `.github/workflows/`. `github/workflows/deploy.yml` is dead.

## Evidence
- `github/workflows/deploy.yml`

## Acceptance criteria
- [ ] Workflow moved to .github/workflows/, secrets documented, manual `workflow_dispatch` dry run passes
- [ ] The stray `github/` folder is removed

## Definition of done
- [ ] Regression test that fails on the old code
- [ ] Verified on staging in the production Docker image

## Estimate
Base **1 h** × buffer **2.2** = **2.2 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue BUG-10 'PDF generation (diplom, intyg) likely fails in the production Docker image' bug,etapp-2,priority:P0,ci-cd 8.8 <<'BODY_EOF'
**BUG-10** · etapp-2 · priority P0

## Summary
`certificatePdf.js` launches Puppeteer. The production stage is `node:25-alpine` and copies node_modules from a `node:25-bookworm` deps stage. Puppeteer's downloaded Chrome is glibc-only, is cached under /root (not copied), and no system Chromium is installed. Automatic diplomas would then fail silently every night. The same glibc→musl copy applies to the native `bcrypt` module.

## Evidence
- `Dockerfile:91 (production FROM alpine)`
- `Dockerfile:5 (deps FROM bookworm)`
- `backend/src/services/certificatePdf.js:143`

## Acceptance criteria
- [ ] Production image either installs `chromium` + sets PUPPETEER_EXECUTABLE_PATH, or the runtime moves to a Debian slim base
- [ ] Native modules are built in the same libc as the runtime
- [ ] CI smoke test runs the production image and generates one diploma PDF
- [ ] The nightly diploma scan alerts (not just logs) on PDF failure

## Definition of done
- [ ] Regression test that fails on the old code
- [ ] Verified on staging in the production Docker image

## Estimate
Base **4 h** × buffer **2.2** = **8.8 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue BUG-11 'APL kit scan always reports 0 created; idempotency depends on the kit title' bug,etapp-2,priority:P2 2.2 <<'BODY_EOF'
**BUG-11** · etapp-2 · priority P2

## Summary
`ensureStartedAplLearningKits` re-checks the stale in-memory `student.logbook` after creating the kit, so `created` is always 0. Duplicate detection is by title string, so renaming the kit would issue a second kit to everyone.

## Evidence
- `backend/src/services/aplService.js:165-175`

## Acceptance criteria
- [ ] Counter uses the return value of ensureAplLearningKit
- [ ] Kits carry a stable `kind: "apl-learning-kit"` marker used for idempotency (+ backfill)

## Definition of done
- [ ] Regression test that fails on the old code
- [ ] Verified on staging in the production Docker image

## Estimate
Base **1 h** × buffer **2.2** = **2.2 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue BUG-12 'Fix the 3 known failing backend tests' bug,etapp-1,priority:P2,tech-debt 6.6 <<'BODY_EOF'
**BUG-12** · etapp-1 · priority P2

## Summary
Listed as 'pre-existing noise' in the master status doc: learningController completion report (missing AssignmentSubmission.findOne mock), placementRoutes pace test (timezone-dependent), aplController.test.js file-level failure. A red baseline hides new regressions.

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md` — 'Pre-existing backend test noise'

## Acceptance criteria
- [ ] Backend suite fully green locally and in CI
- [ ] Pace test pinned to TZ=Europe/Stockholm or date-only assertions

## Definition of done
- [ ] Regression test that fails on the old code
- [ ] Verified on staging in the production Docker image

## Estimate
Base **3 h** × buffer **2.2** = **6.6 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF

echo "== Phase 1 wrap-up (12 issues, 206.8 h buffered)"
create_issue P1-01 'Per-role field projection on student endpoints (personnummer, support notes, accommodations)' phase-1-wrapup,etapp-1,priority:P0,security 26.4 <<'BODY_EOF'
**P1-01** · etapp-1 · priority P0

## Summary
Master status P15. GET /student/:id, /students and /basic return the full document to every staff role.

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md P15`

## Acceptance criteria
- [ ] A serializer per role decides which fields are returned; privileged fields are listed in one config
- [ ] Coordinator/teacher never receive personnummer unless granted
- [ ] Snapshot tests per role for each endpoint

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **12 h** × buffer **2.2** = **26.4 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue P1-02 'Messaging tenant isolation (Mejl/Chatt)' phase-1-wrapup,etapp-2,priority:P0,security 22.0 <<'BODY_EOF'
**P1-02** · etapp-2 · priority P0

## Summary
Master status P17 / item 53. Messaging is gated only by `isAuthenticated`; no kommun/school scoping.

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md P17, 53`
- `backend/src/services/messagingService.js`

## Acceptance criteria
- [ ] Recipient search and send are limited to users the sender may contact (rules agreed with client)
- [ ] Students can message only their teachers and staff
- [ ] Existing threads crossing tenants are reported, not deleted

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **10 h** × buffer **2.2** = **22 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue P1-03 'Move /uploads off public disk storage (authenticated file IDOR)' phase-1-wrapup,etapp-1,priority:P0,security 30.8 <<'BODY_EOF'
**P1-03** · etapp-1 · priority P0

## Summary
Any logged-in user can fetch public/uploads/* by filename.

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md Section A`

## Acceptance criteria
- [ ] All files are served through an authorized route (GridFS or object storage)
- [ ] Migration script moves existing files and rewrites references; dry-run mode
- [ ] Static /uploads route removed

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **14 h** × buffer **2.2** = **30.8 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue P1-04 'Tenant scope on GET /documents/:id metadata' phase-1-wrapup,etapp-1,priority:P1,security 6.6 <<'BODY_EOF'
**P1-04** · etapp-1 · priority P1

## Summary
File bytes are guarded, but staff can read document metadata across kommuner.

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md Section A (🟡)`

## Acceptance criteria
- [ ] Same tenant filter as GET /student/:id
- [ ] Cross-tenant request → 404 (not 403) to avoid enumeration

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **3 h** × buffer **2.2** = **6.6 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue P1-05 'Search students by first / middle / last name' phase-1-wrapup,etapp-1,priority:P2 17.6 <<'BODY_EOF'
**P1-05** · etapp-1 · priority P2

## Summary
Item 2b. `Student.name` is one field searched as a substring.

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md item 2b`

## Acceptance criteria
- [ ] Schema gets firstName/middleName/lastName (name kept as a computed display field)
- [ ] Backfill splits existing names; ambiguous rows are listed for manual review
- [ ] Search matches any part with a 3-character minimum; Alvis/Excel import fills the new fields

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **8 h** × buffer **2.2** = **17.6 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue P1-06 'Fine-grained per-user permission grants' phase-1-wrapup,etapp-1,priority:P2,needs-decision 35.2 <<'BODY_EOF'
**P1-06** · etapp-1 · priority P2

## Summary
Item 1b. Spec examples ('Angelina may edit the slutprov list', a shared grading document) need grants finer than the 9 feature flags. Document sharing already covers the second example.

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md item 1b`

## Acceptance criteria
- [ ] Client confirms the list of grantable actions
- [ ] Grants are editable in Behörigheter (Tab 4), audited, and enforced server-side

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **16 h** × buffer **2.2** = **35.2 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue P1-07 'Raise backend coverage to the 78.5 % gate (currently 68.36 %)' phase-1-wrapup,etapp-1,priority:P1,tech-debt,ci-cd 35.2 <<'BODY_EOF'
**P1-07** · etapp-1 · priority P1

## Summary
Thresholds are not met and must not be lowered. Prioritise the code where this audit found untested bugs: activity feed, content visibility, template application.

## Evidence
- `backend/vitest.config.js:14-18`

## Acceptance criteria
- [ ] `make citest` green in CI with unchanged thresholds
- [ ] CI blocks merges on coverage failure

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **16 h** × buffer **2.2** = **35.2 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue P1-08 'Placement wizard parity: APL '"'"'completed elsewhere'"'"' + certificate upload' phase-1-wrapup,etapp-1,priority:P2 8.8 <<'BODY_EOF'
**P1-08** · etapp-1 · priority P2

## Summary
Item 20. Works in ManualAddStudent.vue only.

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md item 20`

## Acceptance criteria
- [ ] Wizard has the checkbox + upload; the certificate lands in the student's Dokument tab

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **4 h** × buffer **2.2** = **8.8 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue P1-09 'Placement wizard: preview end date and allow a manual exam-date override' phase-1-wrapup,etapp-1,priority:P2 6.6 <<'BODY_EOF'
**P1-09** · etapp-1 · priority P2

## Summary
Items 13 and 14 (minor UX).

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md items 13, 14`

## Acceptance criteria
- [ ] End date and exam date shown before submit
- [ ] Exam date can be overridden with a reason

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **3 h** × buffer **2.2** = **6.6 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue P1-10 'Product decisions: APL tab rule, exam room list (7 vs 9), contract upload by student' phase-1-wrapup,etapp-1,priority:P2,needs-decision 2.2 <<'BODY_EOF'
**P1-10** · etapp-1 · priority P2

## Summary
Items 5, 24c, 48. The code works; it needs a recorded decision from the client.

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md items 5, 24c, 48`

## Acceptance criteria
- [ ] Decisions recorded in this issue
- [ ] Config changed if the client asks (config/examRooms.js)

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **1 h** × buffer **2.2** = **2.2 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue P1-11 'Background jobs: protect the in-process scheduler for multi-instance deploys' phase-1-wrapup,etapp-1,priority:P1,tech-debt 11.0 <<'BODY_EOF'
**P1-11** · etapp-1 · priority P1

## Summary
All nightly jobs (inactivity, diplomas, grading reminders, APL kits/status) run on a `setTimeout` in every Node process. Two replicas would double-send inactivity warnings and diplomas wherever idempotency is check-then-write.

## Evidence
- `backend/src/services/scheduler.js`

## Acceptance criteria
- [ ] Mongo-based lease/lock so one instance runs each job
- [ ] Job runs are recorded (start, end, counts, errors) and visible to systemadmin

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **5 h** × buffer **2.2** = **11 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue P1-12 'Repo hygiene: remove ~50 root-level scratch scripts and stale reports' phase-1-wrapup,etapp-1,priority:P2,tech-debt 4.4 <<'BODY_EOF'
**P1-12** · etapp-1 · priority P2

## Summary
fix_b4_v4.cjs, test_filter5.cjs, explore_raw.cjs etc. plus several overlapping audit reports. create_accounts.cjs contains a fixed test password.

## Evidence
- `repo root`

## Acceptance criteria
- [ ] Scripts deleted or moved to backend/scripts with a README
- [ ] One current status document; older reports archived

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **2 h** × buffer **2.2** = **4.4 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF

echo "== Phase 2 features (4 issues, 66.0 h buffered)"
create_issue E2-01 'Kurskort: separate anslagstavla (staff-only noticeboard) from the activity feed' feature,etapp-2,priority:P1 17.6 <<'BODY_EOF'
**E2-01** · etapp-2 · priority P1

## Summary
Item 58. The feed currently doubles as the noticeboard. Spec: only staff write on the noticeboard; the overview also shows activities, submissions and the student's current module. Depends on BUG-02.

## Evidence
- `Etapp 2 spec, 'Första sidan i kurskorten'`

## Acceptance criteria
- [ ] Pinned noticeboard posts (staff write, everyone linked reads), plus an automatic activity stream
- [ ] Staff see the latest submissions panel and each student's current module

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **8 h** × buffer **2.2** = **17.6 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue E2-02 'Push kursmall changes to existing kurskort (template → courseInstances sync)' feature,etapp-2,priority:P1 26.4 <<'BODY_EOF'
**E2-02** · etapp-2 · priority P1

## Summary
Kurskort are cloned from a template once at admission. Later template fixes never reach running cards, and content lives in two places (`content` map + `modules[].sections`).

## Evidence
- `backend/src/utils/courseMatchingService.js:300-305`
- `backend/src/models/CourseInstance.js:69-84`

## Acceptance criteria
- [ ] One content model (modules/sections); `content` map migrated and removed
- [ ] 'Apply template to cards' action with a preview listing affected instances
- [ ] Teacher edits on a card are preserved (per-section override flag)
- [ ] Dates and student progress are never touched by a sync

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **12 h** × buffer **2.2** = **26.4 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue E2-03 'Innehåll: hide individual sections (moment), not only whole modules' feature,etapp-2,priority:P2 13.2 <<'BODY_EOF'
**E2-03** · etapp-2 · priority P2

## Summary
Spec: 'olika moment inte är synliga för elever'. Today only module-level hide exists.

## Evidence
- `backend/src/models/courseModuleSchema.js`

## Acceptance criteria
- [ ] Per-section hidden flag in builder and Innehåll view, enforced server-side for students

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **6 h** × buffer **2.2** = **13.2 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue E2-04 'Inactivity automation: admin chooses avbrott or warning email (align with spec)' feature,etapp-2,priority:P1,needs-decision 8.8 <<'BODY_EOF'
**E2-04** · etapp-2 · priority P1

## Summary
Spec: the notice lets the admin choose immediate avbrott or a warning email. The scanner instead AUTO-SENDS the 14-day warning. The inactivity automation is also missing from the master status doc (item 54 is blank), so its status has not been signed off.

## Evidence
- `backend/src/services/inactivityScanner.js:1-20`
- `Etapp 2 spec, 'Inaktiva elever'`

## Acceptance criteria
- [ ] Config switch: auto-send vs admin-approve (default per client decision)
- [ ] 5-day no-login and 14-day inactivity rules covered by tests with fixed clocks
- [ ] Package students: avbrott cascades to every course in the package
- [ ] Status added to the master tracker

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **4 h** × buffer **2.2** = **8.8 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF

echo "== Phase 2 high-risk — quote separately (9 issues, 528.0 h buffered)"
create_issue Q-01 '[Quote] AI chatbot — production readiness' feature,etapp-2,priority:P1,quote-separately,security 88.0 <<'BODY_EOF'
**Q-01** · etapp-2 · priority P1

## Summary
A chatbot exists (keyword retrieval + optional OpenAI gpt-4o-mini). It is outside the Etapp 2 list in Etapperna_lista. Before go-live it needs a data-processing basis for sending student questions to a US provider (GDPR / DPA, or an EU-hosted model), per-user rate and cost limits (only a global IP limiter today), a question-length cap, an evaluation set of real student questions, an FAQ curation flow, and the BUG-07 retrieval fixes.

## Evidence
- `backend/src/services/aiAnswerService.js`
- `backend/src/router/chatbotRoutes.js`

## Acceptance criteria
- [ ] DPA / provider decision recorded
- [ ] Per-user daily quota + monthly cost ceiling with an alert
- [ ] ≥ 80 % correct on an agreed set of 50 real questions
- [ ] 'Ask a teacher' fallback logs unanswered questions for FAQ curation

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **40 h** × buffer **2.2** = **88 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue Q-02 '[Quote] One-way SMS notifications (vården-style, no replies)' feature,etapp-2,priority:P2,quote-separately,parking-lot,needs-decision 52.8 <<'BODY_EOF'
**Q-02** · etapp-2 · priority P2

## Summary
Not implemented. Vendor options are documented (46elks, Sinch, Twilio). Blocked on vendor choice and credentials. Risks: per-message cost, consent, phone-number quality, sender ID registration.

## Evidence
- `ARCHITECTURE-NOTES.md`
- `backend/src/services/messagingService.js (extension point)`

## Acceptance criteria
- [ ] Vendor + sender ID chosen
- [ ] Opt-in/opt-out per student
- [ ] Delivery receipts stored
- [ ] Message templates contain no sensitive personal data
- [ ] Monthly cost cap

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **24 h** × buffer **2.2** = **52.8 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue Q-03 '[Quote] Read-only mobile push notifications (PWA web push)' feature,etapp-2,priority:P2,quote-separately,parking-lot 44.0 <<'BODY_EOF'
**Q-03** · etapp-2 · priority P2

## Summary
Item 53b. No service worker, web push or FCM; in-app polling only. A cheaper alternative or complement to SMS.

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md item 53b`

## Acceptance criteria
- [ ] PWA manifest + service worker
- [ ] VAPID web push with subscribe/unsubscribe
- [ ] iOS 16.4+ home-screen limitation documented for the client

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **20 h** × buffer **2.2** = **44 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue Q-04 '[Quote] Personalised APL kits (loggbok) replacing shared kurskort' feature,etapp-2,priority:P1,quote-separately 52.8 <<'BODY_EOF'
**Q-04** · etapp-2 · priority P1

## Summary
Today every eligible student gets the same generic 'APL-lärkit' (only name and dates differ) on the APL start date. The spec asks for personalised kits instead of a shared kurskort, visible on the student's start page, with activity colour codes. Not in Etapperna_lista.

## Evidence
- `backend/src/services/aplService.js:106-175`
- `frontend/src/views/Student/tabs/LogbookTab.vue`

## Acceptance criteria
- [ ] Kit templates per programme/package, editable by coordinator
- [ ] Kit generated per student from template + workplace + period
- [ ] Loggbok entries, coordinator feedback, activity colour codes (behind / on track)
- [ ] Shown on the student dashboard from the APL start date

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **24 h** × buffer **2.2** = **52.8 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue Q-05 '[Quote] Automatic diplomas — hardening and signing' feature,etapp-2,priority:P1,quote-separately 35.2 <<'BODY_EOF'
**Q-05** · etapp-2 · priority P1

## Summary
Implemented: a nightly scan checks package completion, APL and end dates, renders a PDF with an uploaded PNG signature and emails it, with retries. Open: the signature is an image, not an e-signature; the spec flow (student notification + 'generate' button) differs from silent auto-send; production PDF rendering is at risk (BUG-10); no human approval step before a legal document goes out.

## Evidence
- `backend/src/services/automaticDiplomaService.js`
- `backend/src/services/diplomaNotificationScan.js`

## Acceptance criteria
- [ ] Client decides: auto-send vs student button vs admin approval queue
- [ ] Optional Scrive/BankID signing quoted as an add-on
- [ ] Revocation/reissue flow with an audit trail
- [ ] Verified end-to-end in the production image

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **16 h** × buffer **2.2** = **35.2 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue Q-06 '[Quote] Question bank → exam generation v2' feature,etapp-2,priority:P2,quote-separately 44.0 <<'BODY_EOF'
**Q-06** · etapp-2 · priority P2

## Summary
Item 67 works end-to-end (create questions, filter, generate, save). It is not in Etapperna_lista. Gaps for real exam use: rule-based generation (n questions per module/difficulty), no-repeat for retakes, printable PDF exam + answer key, question versioning, and a leakage review now that students have a question-bank view.

## Evidence
- `frontend/src/views/Admin/QuestionBank/`
- `backend/src/router/questionBankRoutes.js`
- `frontend/src/views/Student/StudentQuestionBank.vue`

## Acceptance criteria
- [ ] Blueprint-based generation
- [ ] Exclude questions a student has already seen
- [ ] PDF export (exam + key)
- [ ] Student endpoints never return correctAnswer (regression test)

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **20 h** × buffer **2.2** = **44 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue Q-07 '[Quote] Public prövning booking + online payment' feature,etapp-1,priority:P2,quote-separately,parking-lot,needs-decision 88.0 <<'BODY_EOF'
**Q-07** · etapp-1 · priority P2

## Summary
Item 38. The form needs a login, the POST is admin-only, and there is no payment provider.

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md item 38`

## Acceptance criteria
- [ ] Payment provider chosen (Swish Handel / Stripe / Klarna)
- [ ] Public form with BankID or email verification
- [ ] Paid booking creates the prövning + payment date automatically
- [ ] Refund/cancel flow

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **40 h** × buffer **2.2** = **88 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue Q-08 '[Quote] Scrive: generate and send grade catalogs automatically' feature,etapp-1,priority:P2,quote-separately,parking-lot,needs-decision 52.8 <<'BODY_EOF'
**Q-08** · etapp-1 · priority P2

## Summary
Item 35. Manual per-PDF upload works; catalogs are not generated from grade data.

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md item 35`

## Acceptance criteria
- [ ] Catalog PDF generated per teacher/course/term from locked grades
- [ ] Sent to Scrive via API; signing status synced back
- [ ] Scrive API credentials provided by the client

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **24 h** × buffer **2.2** = **52.8 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF
create_issue Q-09 '[Quote] Alvis integration for automatic placement' feature,etapp-1,priority:P2,quote-separately,parking-lot,needs-decision 70.4 <<'BODY_EOF'
**Q-09** · etapp-1 · priority P2

## Summary
Item 11. Only Excel bulk import exists; no Alvis API client.

## Evidence
- `MILESTONE-3-MASTER-TASK-STATUS.md item 11`

## Acceptance criteria
- [ ] Alvis API access/contract confirmed
- [ ] Scheduled import with a review queue before placement
- [ ] Matching against existing (inactive) students

## Hidden work (included in the estimate)
- [ ] Role/permission checks (student / teacher / admin / systemadmin / coordinator / syv / specped)
- [ ] Tenant (kommun) scoping verified for scoped staff
- [ ] Empty, loading and error states in the UI (Swedish copy)
- [ ] Form validation and edge cases (null dates, missing teacher, package vs single course)
- [ ] Data migration / backfill for existing records
- [ ] Unit + integration tests (real Mongoose documents, not hand-built Maps)
- [ ] Playwright E2E happy path
- [ ] Audit log / notification side-effects reviewed
- [ ] Staging deploy + smoke test in the production Docker image
- [ ] Client demo + 1 revision round

## Estimate
Base **32 h** × buffer **2.2** = **70.4 h** (buffered)

_Generated from the 2026-11-22 code audit (static analysis of the repomix snapshot)._
BODY_EOF

echo
echo "Done: $CREATED created, $REUSED already existed, $FAILED failed."
echo "Project: gh project view $PROJECT_NUMBER --owner $PROJECT_OWNER --web"
[[ "$FAILED" -eq 0 ]]