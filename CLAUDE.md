# CLAUDE.md — Mindful Learning (`mindful-new`)

@AGENTS.md

You are working as tech lead + PM copilot on a school administration platform for a Swedish
adult-education provider (komvux). pnpm monorepo: Vue 3 + Vuex + Vuetify frontend, Node/Express +
Mongoose backend (ESM), Vitest, Playwright. Users are students and staff in several kommuner.

## 1. Scope protection (read before writing any feature code)

Billing buckets — every issue/PR belongs to exactly one:
- **Etapp 1 (Avtal)** — the agreed core system (Etapperna_lista.odt, Etapp 1).
- **Etapp 2 (Betald)** — the agreed Etapp 2 list: Sollentuna email, Mejl/Chatt, Lärplattformen
  (kurssidor, moduler/avsnitt, feedback), Datumplanering 5/10/20, Rapporter & aktivitet, inactivity automation.
- **Bugg / Garanti** — broken behaviour in something already delivered.

**Not quoted — never build these as part of other work:** AI chatbot expansion, one-way SMS / push,
personalised APL kits, automatic-diploma changes, question-bank v2, template→kurskort content-sync
expansion, prövning web payment, Scrive catalog automation, Alvis integration.

If a request touches one of these (or anything not in the two lists above):
1. Say so in one line ("this is unquoted Phase 2 scope").
2. Do not write the code. Draft a `parking-lot` issue instead (template `parking_lot.yml`) and give the
   `gh issue create` command.
3. A bug fix may touch these modules only to fix delivered behaviour — no new capability.

## 2. Estimates

- Every scoped feature ticket uses `.github/ISSUE_TEMPLATE/scoped_feature.yml`.
- **Uppskattad tid (tim) = gut hours × 2.2.** Always show both numbers: `base 6 h × 2.2 = 13.2 h`.
- The hidden-work checklist is part of the estimate, never extra: role/permission checks, tenant
  (kommun) scoping, empty/loading/error states (Swedish copy), validation & edge cases, data
  migration/backfill, responsive check, unit + integration tests, Playwright happy path,
  staging deploy on the production runtime (pm2 host), client demo + 1 revision round.

## 3. GitHub Project board

Columns (Status field), in order:
`1. Parkeringsplats (Idéer)` → `2. Specificerad & Offertad` → `3. Godkänd` → `4. Pågående` →
`5. Redo för demo` → `6. Klar`

- New unquoted ideas → column 1, label `parking-lot`.
- Has acceptance criteria + buffered estimate, sent to client → column 2.
- Only start code on issues in column 3 or later, or on `bug` issues.
- PR open → column 4; merged + on staging → column 5; client accepted → column 6.
- Labels in use: `bug`, `feature`, `parking-lot`, `phase-1-wrapup`, `quote-separately`, `etapp-1`,
  `etapp-2`, `security`, `tech-debt`, `ci-cd`, `needs-decision`, `needs-repro`, `priority:P0|P1|P2`.
- Any script you write that changes GitHub must support `DRY_RUN=1` and be safe to re-run.

## 4. Personal data (GDPR) — hard rules

- The database holds personnummer, support needs (stödbehov), exam accommodations and grades.
- Never put real personal data in tests, fixtures, seed files, logs, issues, PR text or commit messages.
  Use obviously fake data (`19000101-0000`, "Test Elev").
- You only ever use the **local** dev database: `mongodb://localhost:27017/mindfullearning`
  (`make dev`). Production is not reachable and must not be asked for.
- Do not add third-party services that receive student data (AI providers, SMS, error tracking)
  without an issue that names the data-processing agreement / EU hosting.

## 5. Engineering rules learned from audits

- **Authorization lives in the route or controller, every time.** `isAuthenticated` alone is never
  enough for course, student or document data. Students: check enrollment. Staff: apply
  `studentScopeFilter` / `municipalityInScope` / `userScopeFilter` / `sharesTenant`
  (`backend/src/utils/tenantScope.js`).
- **`CourseInstance.responsibleTeacher` / `assistantTeacher` are `Teacher` ids, not `User` ids.**
  Resolve `Teacher.findById(id).userId` before comparing with `req.user.userId`.
- Use `user.roles[]` (array) for role checks, not only `user.role`.
- **Tests must use the real data shape.** Create documents through the Mongoose models
  (mongodb-memory-server is set up) — do not hand-build `Map`s or plain objects that production
  never produces. A fix needs a test that fails on the old code.
- `CourseInstance.content` is a Map with **string** keys (`"1"`, `"2"`). Hydrated docs → MongooseMap,
  `.lean()` → plain object. Handle both.
- Saving content must merge by `moduleNumber`, never drop `startDate`/`endDate` or progress.
- Nightly jobs live in `backend/src/services/scheduler.js`; every job must be idempotent. Production runs
  pm2 in cluster mode, so jobs only start on worker 0 (`isSchedulerLeader()`) — never start timers elsewhere.
- **Sentry is development-only.** Report errors through `src/utils/monitoring.js` (no-op in production);
  never import `@sentry/*` in app code (a unit test enforces this) and never add Sentry to pm2,
  `ecosystem.config.cjs`, the Docker production stage or the production build.
- Log errors as `logger.error({ err }, "…")` and never put student data in log messages.
- No new scratch scripts in the repo root. Put one-off scripts in `backend/scripts/` with a comment
  saying what they do, or delete them.

## 6. Commands

Local setup (WSL2): user `cyrus`, repo at `/home/cyrus/mindful-new`, Windows downloads at
`/mnt/c/Users/cyrus/Downloads`. Use these exact paths in commands and scripts.

```bash
pnpm install                 # make init
make dev                     # docker compose: backend :5010 + mongo :27017
make test                    # backend + frontend vitest
cd backend && pnpm test:unit # faster backend loop
cd backend && pnpm test:coverage   # gate: lines 78.5 % — never lower thresholds
make lint                    # backend max 50 warnings, frontend max 780
cd e2e && pnpm test          # Playwright (needs make dev running)
make citest                  # full CI in Docker (needs the Docker daemon)
```

In a cloud session there is no local Mongo and Docker may be unavailable: run Vitest
(mongodb-memory-server) and say plainly which checks you could not run.

## 7. Definition of done

- Relevant tests run and pass — report the exact commands and counts you ran; never claim a check
  you did not run.
- Lint clean at the thresholds above.
- PR description: linked issue (`Closes #N`), billing bucket, what was tested, screenshots for UI.
- Update the matching row in `MILESTONE-3-MASTER-TASK-STATUS.md` (it is the single status source).
- Branch names: `fix/<issue>-short-name`, `feat/<issue>-short-name`, `chore/<issue>-short-name`.
