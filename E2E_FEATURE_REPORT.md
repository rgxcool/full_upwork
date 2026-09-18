# Mindful Learning — E2E Feature Verification Report

Date: 2026-09-17
Report: served via `npx playwright show-report playwright-report --port 9323`

## 1. What was done

1. Read the existing Playwright report (prev. run at `localhost:9323`) to baseline the failing tests.
2. Started the app with `bash launch.sh` (Mongo, backend :5010, frontend :5173, education data, e2e seed + FAQ seed). Services verified via `/health/live`, `/health/ready`, frontend HTTP 200.
3. Fixed the failures found, then ran the complete Playwright suite: **75 tests, 75 passed (1.9m)**.
4. Documented what works well vs. what had issues (below).

## 2. Result at a glance

| Suite / area                              | Tests | Status |
|-------------------------------------------|------:|--------|
| Public & Security features                |     5 | ✅ all |
| Student Portal                            |     6 | ✅ all |
| Teacher Portal                            |     9 | ✅ all |
| Admin Portal (30 screens incl. permissions) |    30 | ✅ all |
| System verification pass (verification.spec) |   10 | ✅ all |
| M3 flows — assignments (item29)           |     3 | ✅ all |
| M3 flows — admin/exams/APL/messaging (etapp2) |    9 | ✅ all |
| Auth setup sessions (4 roles)             |     4 | ✅ all |
| **Total**                                 |   **75** | **75 passed** |

Coverage note: `all-features.spec.js` is a breadth smoke-pass (every route renders with the right content for the right role). Deep behavioral coverage lives in `verification.spec.js` (pagination, console/network hygiene, happy-path smoke) and the two `milestone3-*` specs (grade flow, exam calendar drag & drop, APL board auto-status, participant enrollments, protected messaging).

## 3. Features that work well

- **Authentication & route guards** — login validation, session restore, unauthenticated redirect to `/login`, 404 page, and per-role navigation all behave correctly.
- **Student portal** — Profile (Översikt), Course Cards (submission upload + feedback loop), Chatbot study assistant (FAQ panel), Question Bank (Frågebank), Exam form, Messaging.
- **Teacher portal** — Kurser, Betygsättning, Signering, Submissions, Exam Calendar (drag & drop of slutprov events), Question Bank, exam generation, and the **APL board** (6 columns, drag & drop, auto-RED/AUTO badge, behind-schedule badge).
- **Admin portal** — all 30 screens render and load: user search, add user/teacher, permissions/RBAC matrix, students import + manual add, education editor, programs/courses/packages, course instances (enrollments modal with last-login column), templates, matching, enrollments, inactive students, inactivity report, reports, analytics, course stats, grade lookups/scales, exams (Prövningar), chatbot FAQ, activity feed, course-content editor, student course cards, action plans, learning management, notifications, calendar housekeeping, schedule parameters.
- **Messaging (M3 #27)** — teacher → student conversation, student read + reply, strict isolation for unrelated users (verified for a second student and an admin).
- **Security/rate limiting** — after the fix below the login/API rate limiter no longer blocks legitimate e2e runs (dev override via `AUTH_RATE_LIMIT_MAX`, prod still 5/15 min).

## 4. Issues found during this run (all fixed, suite now green)

### 4.1 App bugs (real, fixed)
1. **`GET /api/permissions` returned 500** — the handler built the RBAC map as `rbacPermissions` but consumed `RBAC_PERMISSIONS`, an undefined variable → `ReferenceError` → "Could not fetch permissions."
   Fix: `backend/src/router/userRoutes.js:307` `RBAC_PERMISSIONS` → `rbacPermissions`.
2. **`/admin/permissions` showed an error page instead of the matrix — separately broken in the frontend.** `Admin/PermissionsTab.vue` used `ref`, `onMounted`, and `client` without importing them, so the component threw during `setup()` and the global error boundary ("Något gick fel") rendered.
   Fix: added `import { ref, onMounted } from 'vue'` and `import client from '@/api/client.js'`.
   (Two stacked bugs on the same screen — backend 500 and frontend ReferenceError.)

### 4.2 Test-data staleness (fixed)
3. **APL auto-RED test (Item 40) drifted with the calendar.** The seed hardcoded Calle's CoursePackage end date `2026-08-21`, but auto-RED only fires for `0 ≤ days-remaining ≤ 21`. Once "today" passed that date the period counted as ended and Calle appeared GREEN ("Klar praktik") instead of RED with the AUTO badge — a seed bug, not an app bug (the app logic is correct).
   Fix: `backend/scripts/seedE2EData.js` — package end dates now computed relative to now (`anna +150d`, `calle +14d`), so the scenario is deterministic on any run date.

### 4.3 Test-suite quality fixes (fixed)
4. **12 `all-features.spec.js` failures were faulty selectors, not broken features:**
   - strict-mode violations (`.navbar-brand, .logo`, `h1,h2,…,body`, `form,input,body` each matched 2+ elements),
   - invalid CSS mixing `text=Fel` into a selector list,
   - wrong expectations (page `<title>` "My Profile", login page error selector, student Chatbot text locator).
   Rewrote the affected locators to targeted `getByRole`/heading selectors.

### 4.4 Fixes carried in from the earlier (quota-interrupted) session
5. **Auth rate limiter blocked e2e logins** (`authRateLimiter` fixed at 5/15 min also hitting dev/cached sessions). Now 1000 in non-production, still 5 in prod (`backend/src/middleware/security.js`).
6. **401 session-check caused a redirect loop** — the axios response interceptor now skips the login redirect for `/auth/session` (`frontend/src/api/client.js`).
7. **APL board added per-status class names** (`:class="status.key.toLowerCase()"`) so column selectors are reliable (`frontend/src/components/APLBoard.vue`).
8. **`launch.sh` now seeds e2e data + FAQ** so a fresh `bash launch.sh` produces a fully populated site for testing.

### 4.5 Real app bugs found in `backend.log` and fixed (2026-09-17)
9. **`GET /api/uploads/file-counts` returned HTTP 500 for teachers** — `CastError: Cast to ObjectId failed for value "file-counts"` in `checkStudentAccess`, twice per APL board load. Root cause was Express route ordering: `GET /uploads/:studentId` (registered at `uploadRoutes.js:280`) shadowed the literal one-segment path `/uploads/file-counts` (registered later at `:472`), so the middleware ran `Student.findById("file-counts")`. Fix: moved the `/file-counts` route **above** the `/:studentId` routes, and added a defensive `mongoose.Types.ObjectId.isValid(studentId)` guard in `checkStudentAccess` (returns 400 instead of a 500 for malformed ids). Verified: teacher login → `/api/uploads/file-counts` now returns `{"aa":0,"bb":0}`.
10. **"Introduktionskit" learning kit was never created during enrollment** — `courseMatchingService.js:483` used `new mongoose.Types.ObjectId()` but the module had no `mongoose` import, throwing "mongoose is not defined" on every course-matching enrollment attempt (logged twice). Fix: added `import mongoose from "mongoose"`. Verified: Item 31 Part B flow now logs `Created learning kit in student logbook`.

Both were real product bugs (silently failing features), exposed by monitoring `backend.log` while the e2e suite ran — they were not covered by the 75 green tests, which is exactly why a regression assertion for `/file-counts` was added to the APL Board test in `all-features.spec.js`.

## 5. Observations / minor notes (not blocking)

- **Reset password** (`/reset-password`) has no email step — it renders a heading + "Nytt lösenord" field + "Återställ lösenord" button (token-based flow). No `input[type=email]`; the test asserts the actual UI.
- All-features tests are smoke-level (route renders + key heading/element visible). They catch navigation/blank-page/error-boundary regressions but not in-depth business logic; the `milestone3-*` + `verification.spec.js` tests carry the deep assertions.

## 6. How to reproduce

```bash
bash launch.sh                       # start app + seed data
cd e2e && npx playwright test        # full suite (auth setup + all specs)
npx playwright show-report playwright-report --port 9323   # view report
```

Server state after this run: backend :5010 and frontend :5173 running against MongoDB :27017.