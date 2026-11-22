# Mindful Learning — Etapp 1 & 2 Audit Report

**Date:** 2026-11-22  **Auditor:** Claude Code (independent QA/architecture audit against `AUDIT_SPEC.md`)
**Runtime:** backend `http://localhost:5010` (`/health` OK, DB connected), frontend `http://localhost:5173`, MongoDB `mindfullearning` (seed from `seedE2EData.js`).
**Accounts used:** `sysadmin@`, `admin@`, `teacher@` (Eva Nahi), `syv@`, `specped@`, `coordinator@`, `student@` (Anna), `student2@` (Berta) — all `@mindful.se`; all 7 roles authenticated successfully.

## 0. Method & scope limits (read first)

- **No application code under `backend/` or `frontend/` was modified.** Probe scripts live in the session scratchpad only.
- **Playwright MCP could not start:** it is configured for Google Chrome at `/opt/google/chrome/chrome`, which is not installed. Browser checks were instead run with the repo's own `playwright-core@1.63.0` + cached Chromium 1255 (same engine, scripted).
- **Reduced depth (by request, to save quota):** E1-01 → E1-14 were checked in code + API + browser. E1-15 → E2-11 were first checked in code + API only.
- **Pass 2 (UI, same day):** Playwright MCP now works (bundled Chromium). Key E1-15 → E2-11 views were exercised in the browser using only standard MCP tools (navigate / click / fill / select / snapshot; no `run_code`). Admin, teacher and student ran in separate isolated browser contexts. Results are in **§3b**, and the statuses in §1 and §2–3 were updated where the UI changed the verdict. Items not reached in pass 2 are listed at the end of §3b.
- **The DB was re-seeded between pass 1 and pass 2** (all seed `_id`s changed from `6b0243…` to `6b024f…`). Pass-1 test data listed in §5 is therefore most likely gone, and IDs quoted in §2–3 refer to the old seed.
- Not run: `make citest`, `postman/run-tests.mjs`.
- **Test data was created and is still in the DB** (all tagged `AUDIT`): see §5 for the list and a reviewable cleanup script.

## 1. Summary

| ID | Requirement | Status |
|---|---|---|
| E1-01 | Roles & permission matrix | **PARTIAL** |
| E1-02 | Per-user permission overrides | **PARTIAL** |
| E1-03 | Global search (≥3 chars) | **PARTIAL** (password leak FIXED, §6) |
| E1-04 | Profile – Allmänt | **PARTIAL** |
| E1-05 | Profile – Studieplan | **PARTIAL** (Betygsatt bypass FIXED, §6) |
| E1-06 | Profile – APL (hidden for staff) | **PASS** |
| E1-07 | Profile – Behörigheter | **PARTIAL** |
| E1-08 | Profile – Dokument | **PARTIAL** |
| E1-09 | Profile – Kursarkiv | **PASS** (FIXED, §6; was FAIL) |
| E1-10 | Placement, Alvis import, auto-calculations | **PARTIAL** |
| E1-11 | Course packages, pace, plan changes | **FAIL** |
| E1-12 | Avbrott / inactive / reactivation | **PARTIAL** |
| E1-13 | APL board, 6 colour codes | **PARTIAL** |
| E1-14 | APL views & contract archive | **PARTIAL** |
| E1-15 | Grading, national tests, locking | **PARTIAL** (UI ✔; was FAIL) |
| E1-16 | Digital signing (Scrive) | **PARTIAL** (not completable locally) |
| E1-17 | F-grade & locked action plan | **PARTIAL** (reminder not locked in UI) |
| E1-18 | Prövningar | **PARTIAL** (no teacher UI) |
| E1-19 | Slutprov calendar (Sollentuna/Akalla) | **PARTIAL** (UI booking ✔) |
| E1-20 | SYV & Specialpedagog functions | **FAIL** (meeting spoofing FIXED, §6; other defects remain) |
| E1-21 | Economy & reports | **FAIL** (UI confirms) |
| E2-01 | Internal messaging | **PASS** (UI ✔) |
| E2-02 | Student chatbot | **PARTIAL** (UI confirms) |
| E2-03 | Course templates 5×2 | **PARTIAL** (UI builder 5×1; was PASS (API)) |
| E2-04 | Shared course cards | **PASS** (UI list ✔) |
| E2-05 | Course card views | **FAIL** (UI confirms) |
| E2-06 | Automatic date planning | **PARTIAL** |
| E2-07 | Course reports & participant tracking | **PARTIAL** (last-visited MISSING) |
| E2-08 | Inactivity monitoring 5/14 days | **PARTIAL** |
| E2-09 | APL kits & logbook | **FAIL** |
| E2-10 | Studieintyg & diplom | **PARTIAL** |
| E2-11 | Question bank & exam generation | **PARTIAL** (answer leak FIXED, §6) |

**Totals (after Batch 1 fixes):** 4 PASS, 0 PASS (API), 23 PARTIAL, 5 FAIL. *(Pass 2: 3 PASS, 23 PARTIAL, 6 FAIL. Pass 1: 1 PASS, 3 PASS (API), 19 PARTIAL, 9 FAIL.)*

### Top issues (fix first)

1. ✅ **FIXED (Batch 1, §6).** ~~**Security: password hash disclosure.** `GET /api/details/teacher/:userId` returns the full User document, including the bcrypt `password`, to every role with `search_users`: teacher, syv, specped, coordinator. `backend/src/router/searchRoutes.js:425` (`User.findById(id).lean()` with no projection).~~
2. **The legacy grade endpoint silently doesn't persist.** `POST /api/teacher/save-grade` writes into `Student.education[]`, but students placed via enrollments have `education: []`. The update matches nothing, yet the API returns `200 "✅ Betyg sparat!"`, still fires F-grade notifications, and ignores locks. `backend/src/router/gradeRoutes.js:~708`. *Pass 2: the `/betyg` UI does **not** use this path. It uses `PUT /api/update-grade/:enrollmentId`, which persists correctly, so the impact is limited to other callers of `save-grade`.*
3. ✅ **FIXED (Batch 1, §6).** ~~**Students can download staff exam files** (slutprov in Kursarkiv). `backend/src/utils/documentAuthorization.js` has no staff-only notion.~~
4. ✅ **FIXED (Batch 1, §6).** ~~**Students can read question-bank answers.** `GET /api/question-bank/` and `/:id` return `correctAnswer` to the student role.~~
5. ✅ **FIXED (Batch 1, §6).** ~~**Students can create meetings for other students** while posing as `bookedBy: "syv"`. `POST /api/meetings` has no role check (`backend/src/router/meetingroutes.js:106`).~~
6. **Broken frontend→backend wiring:** exam-accommodation saves 404, PermissionsTab gets `/api/api/permissions` → 404, StaffProfile's Behörigheter tab never renders, and responsible teachers can't post to the bulletin board (details below).
7. **Revenue is wrong for Stockholm.** There is no Stockholm price entry, so revenue computes as 0, and the Alvis import rejects "Stockholm" entirely.

## 2. Etapp 1 — details

### E1-01 Roles & permission matrix — PARTIAL
- **Model:** `backend/src/models/User.js` `roles` enum has all 7 roles. ✔
- **UI guard** (`frontend/src/router/router.js:585`, `frontend/src/store/store.js:5`): it uses a **linear hierarchy** (`student < coordinator < specped < syv < teacher < admin < systemadmin`), so any higher role passes any lower role's route. Observed in browser:
  - teacher can open `/syv/appointments` and `/specped/appointments`; syv can open `/specped/appointments`.
  - every staff role can open the student-only routes `/chatbot`, `/course-cards`, `/examform` (→ `403 GET /api/course-cards/mine`).
  - correctly blocked: student from all staff routes; coordinator from `/kalender`; non-admins from `/admin/*`.
- **API (`403` matrix)**, columns sysadmin/admin/teacher/syv/specped/coord/student:
  - `/api/users`, `/api/permissions`, `/api/grade-catalogs`, `/api/locked-grades`: `200 200 403 403 403 403 403` ✔
  - `/api/analytics/revenue`: `200 200 403 200 200 200 403` ✘ This is the **inverse of the matrix** (statistics: teacher = Ja, coordinator = Nej). Cause: `backend/src/config/roles.js` gives `analytics:read` to coordinator/syv/specped but not teacher, which contradicts `PERMISSION_MATRIX` in `backend/src/config/permissions.js`.
  - `/api/stats/courses-per-month`: 200 for **student** too (no role guard, `statsRoutes.js:10`).
  - `/api/calendar-events`, `/api/exams`: coordinator 200 (matrix: slutprov calendar = Nej).
- **Repro:** `curl -b coordinator.jar :5010/api/analytics/revenue` → 200; same as teacher → 403.

### E1-02 Per-user overrides — PARTIAL
- Persisting works: `PUT /api/users/:id/permissions` (admin) → 200. A teacher granted `statistics:true` immediately gets 200 on `/api/analytics/revenue`; a coordinator revoked `statistics:false` gets 403. ✔ (DB re-read in `middleware/authorization.js:87`.)
- ✘ Overrides are enforced only by `canFeature`/`can` on search, course templates, analytics and assignments. The spec's examples are **not override-aware**: slutprov list editing (`examRoutes.js`, `hasRole(ALLOWED_STAFF_ROLES)`) and document sharing (`documentRoutes.js:772`, uploader/admin only). The `student_documents`, `calendar_final_exam`, `mass_messaging` and `messaging` flags change nothing.
- ✘ The UI ignores overrides: a teacher with `statistics:true` is still redirected `/admin/analytics → /unauthorized` (route guard is role-only).

### E1-03 Global search — PARTIAL
- `frontend/src/components/NavBar.vue:805`: <3 chars sends no request (verified: 0 calls for "An"). ✔ Student has no search box and gets API 403. ✔
- Student by name → `/student/:id` ✔. Datum search returns students for a start/end date ✔. Course "Sven" → `/education/:id` ✔ (shows instances).
- ✘ The backend returns user results with `type` = role string (`"teacher"`, `searchRoutes.js:~300`). Consequences:
  - The **"Användare" filter drops teachers** ("Eva" → "Inga träffar"), because it filters on `['Användare','Lärare','Personal','Elev']` (`NavBar.vue:843`).
  - Clicking a teacher goes to `/detaljer/teacher/:userId` (generic page) instead of StaffProfile.
  - For admin/systemadmin results, `/api/details/admin/:id` returns an empty 200 (no `case`).
- ✘ Coordinator sees teacher and course hits but clicking gives `/unauthorized` (`/detaljer` and `/education` routes exclude coordinator).
- ✘ The teacher-details page (`SearchResultDetails`) shows a role editor with "Spara roller" to teacher/syv/specped (the backend rejects the save, but the UI offers it).
- Student model has a single `name` field (no `middleName`); multi-part regex matching covers middle names.
- **Security:** see Top issue #1. Repro: `curl -b teacher.jar :5010/api/details/teacher/6b0243e10532c8d9fcbd7dec | grep password`.

### E1-04 Profile – Allmänt — PARTIAL
- `frontend/src/views/Student/tabs/GeneralTab.vue` renders contact, personnummer, kommun, special needs, exam accommodations, support contacts, deviations, comments and history. ✔ `PUT /api/student-details/:id` and `POST …/comments` persist. ✔ REVIDERAD banner exists (`StudentDetails.vue:38`).
- Staff vacation: `PUT /api/teachers/:id/vacation` persists `onVacation/vacationStart/End/Note` (admin). ✔ ✘ A teacher can't set their own absence (403).
- ✘ Slutbetyg is not shown on Allmänt; Startdatum/Slutdatum show "Ej angivet" despite active enrollments.
- ✘ A **student opening their own profile** (`/student/<ownId>`) gets `403 GET /api/student-details/:id` (the route allows `student`).

### E1-05 Profile – Studieplan — PARTIAL
- All 5 statuses are offered (`StudyPlanTab.vue:129`: enrolled=Antagen, completed=Betygsatt, dropped=Avbrott, inactive=Ej påbörjad, reviderad=Reviderad). `PUT /api/enrollments/:id/status` round-trips. ✔ Teacher profile `GET /api/teachers/:id/profile` returns active/completed courses + student count. ✔
- ✘ The most common seeded status `active` has no dropdown option, so the select misrepresents it.
- ✘ The package entry renders as "Okänd - APLE2E01" (package name not resolved). Kursarkiv shows "Lärare: —".
- ✘ A teacher can set an enrollment to `completed` (Betygsatt) directly, bypassing grading/locking.

### E1-06 Profile – APL tab — PASS
- The APL tab is visible on course-package student profiles for admin/teacher/syv/specped, and absent on StaffProfile (`/teacher/:id` tabs: Allmänt, Kurser, Elever, Filarkiv). `StudentDetails.vue:234`.
- Note: the tab shows "Ingen APL-registrering" for seeded students until an AplRecord exists (no back-fill from `Student.aplStatus`).

### E1-07 Profile – Behörigheter — PARTIAL
- ✔ `/admin/edit-user/:userId` (`EditUser.vue`): toggling "Statistik" → `PUT /users/:id/permissions` 200 → reload shows it persisted (browser-verified).
- ✘ The **StaffProfile Behörigheter tab never renders**: `frontend/src/views/Teacher/StaffProfile.vue:91` reads `store.getters.userRoles`, which does not exist in `store.js`, so it's always `[]`.
- ✘ The `/admin/permissions` page (`frontend/src/views/Admin/PermissionsTab.vue:66`) calls `client.get('/api/permissions')` with `baseURL` already `/api`, so it requests `/api/api/permissions` → 404. The page silently shows a hard-coded matrix.
- ✘ EditUser shows "Statistik – Standard för roll: På" for teacher while the API denies it (E1-01). The help copy also contains stray text "启用".

### E1-08 Profile – Dokument — PARTIAL
- ✔ `POST /api/documents/upload` (type CV) 200; list 200; download 200 for staff and the owning student; **other student 403** on list and download.
- ✘ **No rename or re-classify:** `PUT /api/documents/:id` → 404; `documentRoutes.js` has only upload/get/download/share/delete.

### E1-09 Profile – Kursarkiv — PASS *(after Batch 1 fix, §6; findings below are pre-fix)*
- `CourseArchiveTab.vue` uploads everything as a single `COURSE_ARCHIVE` type, with no delprov/slutprov classification (`Document.js` enum).
- ✘ **Students can access staff exam files.** Admin uploaded `AUDIT-slutprov-SVA1.pdf` to Anna's Kursarkiv; `GET /api/documents/download/:id` as Anna → **200**.

### E1-10 Placement, Alvis import, calculations — PARTIAL
- `POST /api/placement/preview` (type `course`, Mon 2027-01-11):
  - 5w → end 2027-02-15
  - 10w → 2027-03-22
  - 20w → 2027-05-31
  - slutprov is the Thursday before end (Eva rule)
  - examMode on-site (Stockholm) / **remote (Upplands Bro)** ✔
- Slutprov rules are **hard-coded by teacher first name** (`backend/src/utils/slutprovDateCalculator.js:73`); an unlisted teacher gets `null`.
- ✘ The Alvis import (`POST /api/uploads/upload/xlsxupload`):
  - **Rejects "Stockholm"** ("Could not match municipality"), although it's in `config/municipalities.js`.
  - With a STUDIETAKT column, the spreadsheet SLUT is ignored and `course.courseExtent` (default 5) is used. A 10-week row was saved as 5 weeks (`courseMatchingService.js:486`).
  - Enrollment `slutprovDate` (Tue 2027-02-09 12:00Z) differs from the CourseInstance `slutprovDate` (Thu 2027-02-11).
- ✘ The resulting slutprov calendar event has `examLocation: ""` even for a remote student.

### E1-11 Course packages, pace, changes — FAIL
- ✔ `PUT /api/students/:id/studyplan-tempo` {tempoWeeks 10/20/5} recalculates end and slutprov (50% → 2027-03-22, 25% → 2027-05-30, 100% → 2027-02-15).
- ✘ **Old slutprov events are not removed.** After 3 pace changes the student was listed on 4 slutprov dates (2027-02-09, 03-17, 05-26, 02-10) in `calendar_events`.
- ✘ No notification is created on a pace change (only a `window.confirm`). Existing `studyplan_changed` notifications render "Fält ändrade: ." (empty field list).
- ✘ `EditStudent.vue:310` sends only `tempoWeeks` (no `includeActive`), which differs from `StudyPlanTab.vue:677`. The prior-APL certificate upload is only the generic "Praktikintyg" document type; no link to the APL list.

### E1-12 Avbrott / inactive / reactivation — PARTIAL
- ✔ `POST /api/student-details/:id/dropout` (admin; teacher 403) removes the student from **all** slutprov events, sets enrollments `dropped`, excludes them from `/api/apl/eligible`, and lists them in `GET /api/students/dropouts` (`InactiveStudents.vue`).
- ✔ `POST …/reactivate` clears `dropout`.
- ✘ Re-enrolling via `reEnrollCourseIds` creates an enrollment with **`slutprovDate: null` and no calendar event**, so the returning student is not put back on the slutprov list. Its dates (02-15 → 04-25) don't match the 5-week rule.

### E1-13 APL board & colours — PARTIAL
- ✔ `frontend/src/components/APLBoard.vue` (browser, coordinator): only course-package students appear; 6 columns; the colour filter (inside the collapsed "statusöversikt" panel) filters correctly for all 6 colours. `PATCH /api/students/:id {aplStatus}` works (field-allowlisted).
- ✘ Auto-status (`backend/src/utils/aplAutoStatus.js:89`) overrides stored colours by date: ≤3 w → RED, ≤4 w → **PURPLE**, ≤8 w → **YELLOW**. Consequences:
  - The seeded **GREEN "Klar praktik" student (Calle) displays as RED "Snart slut – AUTO"**.
  - PURPLE (spec: *uppföljning*) and YELLOW are assigned by date, not by staff.
  - Any manual move sets `aplStatusManualOverride=true`, which then **disables the auto-red warning permanently** for that student.
- `PATCH /api/students/:id` also accepts teacher/syv/specped (all staff).

### E1-14 APL views & contract archive — PARTIAL
- ✔ `APLView.vue` AVSLUTAD tab (`AplCompletedTab.vue`) lists GREEN AplRecords with contact and "Avtal mottaget" after a contract upload.
- ✘ The internship period is not shown, although `PUT /api/apl/records/:sid` accepts dates.
- ✘ **`frontend/src/components/APLFileArchive.vue` is not imported anywhere** (orphaned). It also reads GridFS `GET /api/uploads/all/apl`, while AplCompletedTab stores contracts via `POST /api/documents/upload`. After uploading a contract, `/api/uploads/all/apl` → `[]`.

### E1-15 Grading & locking — PARTIAL *(pass 1 API: FAIL; pass 2 UI: see §3b)*
- ✔ Missing motivation → `400 "Motivering krävs för betyg"` (`gradeRoutes.js:696`; field is `reason`).
- ✘ **Grades not persisted** (Top issue #2): `save-grade` for Doris/Berta Matematik 1a returned 200, but no grade exists on any `studentEnrollments` doc or in `Student.education`.
- ✘ `POST /api/teacher/lock-grade` locked an enrollment that had **no grade**. A `grade_locked` admin notification was created ✔. Afterwards `PUT /api/update-grade/:id` → 403 ✔, but `POST /teacher/save-grade` on the same course → 200 (no lock check on that path).
- National-test scale: `GET /api/grading-scale/terms` → `["HT26","VT26"]`; `suggest?term=HT26&subject=Matematik&points=40` → `{grade:null, hasScale:true}`, so the seeded scale yields no grade for 40 points (not investigated further).
- Course-end reminders: `services/gradingReminderScan.js` exists; a `grades_pending` notification was observed.

### E1-16 Digital signing — PARTIAL *(not completable locally)*
- `GET /api/grade-catalogs/:id` 200. `POST /api/grade-catalogs/:id/send` → `503 "Scrive är inte konfigurerat"` (no `SCRIVE_*` env). The callback/refresh code (`gradeCatalogRoutes.js:41–60`) maps `closed` → signed+locked, but this was not exercised. A Scrive test-account configuration is needed to verify.

### E1-17 F-grade & action plan — PARTIAL *(API pass 1; UI pass 2 in §3b)*
- ✔ An F grade creates `action_plan_required` + `global_action_plan_required` notifications. `PUT /api/notifications/:id/resolve` → 200, but the note stays unresolved in the DB (appears gated, as intended).
- ✘ This fires even though the F grade itself was not saved (E1-15).
- `GET /api/actionplan/:studentId/pdf` → 404 (no plan yet); the questionnaire → PDF step was not exercised.

### E1-18 Prövningar — PARTIAL *(API pass 1; UI pass 2 in §3b)*
- Model `backend/src/models/Provning.js` has `paymentDate`, `materialReceived` and decision enum `accept/move/deny`.
- ✘ `PUT /api/exams/:id/decision {"decision":"deny"}` as teacher → **200 without motivation**.
- `move` → 200, but the record has no exam date to shift (not verifiable).
- ✘ No scheduled 3–4-week teacher notification found (`services/scheduler.js` has no prövning scan). Website booking/payment integration not found; file import not verified.

### E1-19 Slutprov calendar — PARTIAL *(API pass 1; UI pass 2 in §3b)*
- ✔ Rooms: `GET /api/exam-rooms` → Sollentuna [308, 310, Lilla rummet, Aniara, Kung Agnes], Akalla [Vision, Hässja, Arkarli, 316].
- ✘ Accommodations are copied into events at creation time only. Updating a student's `examAccommodations` does not update existing slutprov events.
- Duplicate stale events: see E1-11. Attendance marking not exercised.

### E1-20 SYV & Specialpedagog — FAIL *(API/code only)*
- ✔ `POST /api/meetings` works for syv and specped (requires `bookedBy`). ✔ `PUT /api/students/:id/exam-accommodations` works for specped (teacher 403).
- ✘ **Both UIs call the wrong path:** `/meetings/students/:id/exam-accommodations` → 404 (`frontend/src/views/Appointments/RoleBasedAppointments.vue:420`, `frontend/src/views/Student/tabs/GeneralTab.vue:728`). The backend mounts it at `/api/students/:id/exam-accommodations` (`meetingroutes.js:205`).
- ✘ **SYV cannot revise study plans:** `POST /api/student-details/:id/revise-studyplan` is `hasRole(["admin","systemadmin"])` → syv 403 (`studentDetailsRoutes.js:108`).
- ✘ Students can create meetings for other students (Top issue #5).
- ✘ Accommodations don't reach the slutprov calendar (E1-19).

### E1-21 Economy & reports — FAIL *(API pass 1; UI pass 2 in §3b)*
- ✔ `/api/analytics/{revenue,forecast,students,grades,dropouts,popular-courses}` all return 200 with data. `frontend/src/utils/exportUtils.js` provides CSV + PDF (jsPDF); the export was not executed.
- ✘ **Wrong revenue:** `byMunicipality` = only "Upplands Bro" 13 200, although graded/active enrollments are mostly Stockholm. Cause: `backend/src/utils/municipalityPricing.js` has no "Stockholm" entry, so `gradeToRevenue` → 0 silently.
- Role inversion for statistics: see E1-01.

## 3. Etapp 2 — details *(pass 1 API/code; UI results for E2-01…E2-05, E2-09 in §3b)*

### E2-01 Messaging — PASS *(UI verified in §3b)*
- Teacher → student `POST /api/messages {participantIds, body}` 201. Student unread 1 → reply 201 → `POST /conversations/:id/read` → unread 0. Teacher sees both messages. Another student → 404. UI not exercised.

### E2-02 Chatbot — PARTIAL
- ✔ `POST /api/chatbot/ask` with an exact FAQ question ("Vad är Komvux?") returns the right answer; 39 FAQs present (`aiEnabled:false`, knowledge-base only).
- ✘ "Hur bokar jag ett slutprov?" returned an unrelated CSN answer instead of "don't know"/escalation.

### E2-03 Course templates — PARTIAL *(API ✔; UI builder differs, see §3b)*
- `POST /api/course-templates` (admin) creates 5 modules × 2 sections with `isPartialExam` on M3 and `isCaseStudy` on M5 (`courseTemplateController.js:52`). Note: **every** teacher can create by default (`config/roles.js`); "selected teachers" depends on manually revoking the override for the rest.

### E2-04 Shared course cards — PASS *(UI list verified in §3b)*
- Importing a second student with the same course and dates reused the existing CourseInstance `6b0247ef…` (2 members, same responsible teacher). Seeded data shows a 4-student shared instance.

### E2-05 Course card views — FAIL
- ✔ Student `PUT /api/course-instances/:id/activity-feed` → 403. Visibility filtering (`applyStudentVisibility`, `courseMatchingController.js:1777`) is in code (hide/unhide not exercised).
- ✔ Submission flow: student submits → teacher `PUT /learning/submissions/:id/feedback {status:"komplettera"}` → comment thread (other student 403) → resubmission 200.
- ✘ **The responsible teacher cannot post to the bulletin board:** 403 "Endast ansvarig lärare…". `courseMatchingController.js:~3032` compares `instance.responsibleTeacher` (a Teacher `_id`) to `user.userId` (a User `_id`), so it never matches. Only admins can post.
- ✘ Resubmission resets `feedback` to empty, losing the teacher's return comment (no history).

### E2-06 Automatic date planning — PARTIAL
- ✔ New instances get `sectionDates` from start (e.g. 2027-01-11 → weekly ×5; 10-week → bi-weekly).
- ✘ Teachers can't configure intervals: `/api/teacher-schedule-parameters` is `ADMIN_ROLES` only (`teacherScheduleParameterRoutes.js:14`) → teacher 403, though the `/schedule-parameters` UI route admits teachers.
- ✘ Offsets are validated as "exactly 5 values (one per module)", so section-level dates for the 10 sections aren't supported.

### E2-07 Reports & participant tracking — PARTIAL
- ✔ `/learning/instances/:id/reports`, `/participants` (`lastActivity`), `/access-last/:studentId` return 200.
- ✘ **"Senast besökt kurskortet" is MISSING:** no course-card visit tracking exists; `lastLogin` came back `null` even after logins. Planned date appears only as a column label in `frontend/src/views/Admin/Reports.vue:121`.
- Automatic participant cleanup on dropout: participants still listed `status:"active"` from enrollments; not verified further.

### E2-08 Inactivity monitoring — PARTIAL
- ✔ `POST /api/inactivity/scan` (admin) runs with thresholds `withdrawDays:5`, `warningDays:14`, and creates a review notification. Admin direct actions exist (`/inactivity/notifications/:id/action`, `/:studentId/warning-email`). The warning email failed with `send_failed` (no SMTP locally).
- ✘ The teacher-scoped report returns `evaluated:0` while admin sees 2 students, both belonging to this teacher (`inactivityController.js:76`). Teachers are effectively not notified (root cause not isolated).
- ✘ `INACTIVITY_AUTO_WITHDRAW_ENABLED` defaults to **on** (`inactivityScanner.js:50`). The spec asks for a staff-triggered action in the notification, not automatic withdrawal. Actions are admin-only.

### E2-09 APL kits & logbook — FAIL
- ✘ `backend/src/router/logbookRoutes.js` (spec touchpoint) does not exist. The logbook lives at `GET /api/students/:id/logbook` (`userRoutes.js:603`).
- ✘ **Student gets 403 on their own logbook**, so a personal APL kit can't render on the student start page. **Coordinator (Praktiksamordnare) also gets 403** (`frontend/src/utils/aplKits.js:10`, `LOGBOOK_ROLES` = admin/systemadmin/teacher).
- ✘ The "behind schedule" colour warning exists only in backend `aplAutoStatus.js`; no frontend reference was found.

### E2-10 Studieintyg & diplom — PARTIAL
- ✔ `GET /api/study-certificate/:enrollmentId/pdf` returns a valid PDF for teacher/admin; other students get 403.
- Automatic diploma: `diplomaNotificationScan.js` and `automaticDiplomaService.js` are registered in `scheduler.js`. The full "all courses + APL passed → signed diploma" flow was **not exercised** (blocked by E1-15 grade persistence).

### E2-11 Question bank — PARTIAL
- ✔ Create question (teacher) → filter by course/difficulty → `POST /api/question-bank/generate-exam` → 200, exam attempt persisted. Student create → 403.
- ✘ **Students receive `correctAnswer`** from `GET /api/question-bank/` and `/:id`.
- ✘ Validation errors return **500 "Intern servererror"** instead of 400 (wrong `questionType` enum, object-shaped options). Export not verified.

## 3b. Browser/UI verification, E1-15 → E2-11 (pass 2)

Run with Playwright MCP against `http://localhost:5173`, with roles in isolated contexts: admin, teacher (Eva Nahi) and student (Anna). Snapshots and screenshots are in `.playwright-mcp/audit/` (untracked). ✔ = works in the UI, ✘ = defect.

### E1-15 Grading — `/betyg` (teacher), `/admin/betygsrapporter`, `/admin/betygsskala`
- ✔ `/betyg` loads with Termin / Kurs / Batch filters, counters (Elever / Betygsatta / Kvar), a Slutbetyg / Nationellt prov toggle, and per-row grade + NP + "Visa detaljer / motivering".
- ✔ **Missing motivation is blocked:** choosing C and clicking Spara shows "✕ Motivering krävs för betyg" (`400 PUT /api/update-grade/:id`).
- ✔ **Saving persists:** with motivation "AUDIT: motivering UI-test", Berta (MAT1a VT26) is saved as C. After a full reload it still shows C / "✓ Sparat" / Betygsatta 1 (50 %). The UI path is `update-grade`, not the broken `save-grade` (Top issue #2).
- ✔ **Locking works:** "Lås betyg 🔒" shows "Betyg låst! Meddelande skickat till administratörer." The row shows "C 🔒 / 🔒 Låst", and grade, NP, motivation and comment are all disabled. The admin's `/api/notifications` contains `grade_locked`: "Betyg låst för Berta Berg (Matematik 1a) av lärare Eva Nahi."
- ✘ **National-test scales are empty.** `/admin/betygsskala` lists HT26 and VT26 Matematik, but the "Skala (min-poäng)" column is blank and Redigera shows empty A–E min-points. Root cause is in the seed, not the app: `backend/scripts/seedE2EData.js:323,339` writes `scales[].minPoints`, while `models/GradingScale.js` defines `scale[].min`. Mongoose drops the unknown fields, which also explains pass 1's `suggest → grade:null`. NP → grade lookup is therefore not verifiable on seeded data.
- `/admin/betygsrapporter` (grade-catalog list + upload form) renders, with no console errors, but the table is empty.

### E1-17 F-grade & action plan
- ✔ Choosing F opens a separate confirmation modal ("Motivering *", "Bekräfta & Sätt F"). Saving gives "✓ Betyg sparat!" and creates `action_plan_required` "Handlingsplan krävs: Doris Dahl har fått F i betyg" for the teacher.
- ✘ **The reminder is not locked.** In the teacher's bell, "Markera som löst" on that reminder removes it at once (badge 10 → 9), and it no longer appears in `GET /api/notifications`. No action plan or questionnaire was completed. The spec requires it to stay until the questionnaire/PDF is done. The questionnaire → PDF step was not exercised.

### E1-18 Prövningar — `/provningar`
- ✔ Admin list renders 4 prövningar (Namn, Kurs, Månad, Kommun, Status, Beslut, Anpassningar) with Registrera Ny / Importera / Exportera. The edit dialog has Betalningsdatum, Tentatyp, Rum, the 3 accommodation checkboxes, and "Material hämtat".
- ✘ "Material hämtat" is a **single checkbox**, with no SVE/SVA **1 vs 3** distinction.
- ✘ **Teachers have no UI for the decision.** `/provningar` is admin/systemadmin only (teacher → `/unauthorized`). The decision dialog (`ProvningarCrud.vue:164`) is only reachable there, and its comment field is labelled "Kommentar (valfritt)" even for **Neka**, matching the API accepting deny without motivation.
- Minor: mixed-language status values ("Scheduled" next to "Intresse", "Accepterad").

### E1-19 Slutprov calendar — `/kalender` (`views/Teacher/ExamCalendar.vue`)
- ✔ Month / week / day grid renders. Slutprov events (from `/calendar-events/syncable`) appear on their dates (2026-04-23, 09-24, 10-15 in this seed).
- ✔ Clicking an event opens the modal with the student list (linked names), Information, Ackommodationer, Närvaro, Provtid, Kommun (Sollentuna / Akalla), Plats and Rum.
- ✔ **Attendance** saves immediately on check (`attended:true` persisted).
- ✔ **Booking** Sollentuna / "Lilla rummet" / 09:00 persisted on the student entry.
- ✘ No **per-teacher filter** on the calendar. Colour is per teacher, but you can't filter by teacher.
- ✘ The per-student **Information** text is **not saved** by "Spara prov": `submitExam` (`EventModal.vue:697`) never sends `additionalInfo`. This is why an "AUDIT" tag could not be stored on the event.
- ✘ **Plats** and **Rum** both list the same room names, and Rum isn't filtered by the chosen Kommun (Sollentuna and Akalla rooms are mixed).
- ✘ Ackommodationer show "Inga registrerade", and the syncable student entries carry no accommodation fields. This confirms that accommodations don't reach the calendar.
- Console warns on every open: "Ingen matchande event hittades i syncable". The event start is `…T12:00Z`, the student `finalExamDate` is `…-14T22:00Z`, and the modal looks up the 14th: an off-by-one-day timezone mismatch.
- Akalla booking was not exercised (same code path).

### E1-21 Economy — `/admin/analytics`
- ✔ Tabs render without errors: Intäkter, Prognoser, Elever, Betygsfördelning, Populära kurser, Avbrott. Filters: date, Kommun, Kurs, Lärare.
- ✔ **CSV export works:** `avbrottsrapport.csv` downloaded, UTF-8 BOM, `Månad,Avbrott,Totalt,Andel (%)`.
- ✘ The export contains only the monthly table; the per-course table shown on screen is not included.
- ✘ Revenue confirmed wrong in the UI: "Totalt: 9 900 kr", Per kommun = only **Upplands Bro** (Stockholm missing, see E1-21).
- ✘ **Grade distribution is not a curve:** it's a text cell ("B: 1C: 2") per course, with a "Visa endast F-betyg" toggle and an F-andel figure. No chart element.
- Avbrott per kurs includes an "Okänd kurs" row (2 dropouts with unresolved course).

### E2-01 Messaging — `/messages`
- ✔ **End to end:** admin "+ Ny konversation" → recipient Anna, subject "AUDIT UI-test", body "AUDIT: testmeddelande från admin". The thread opens.
- ✔ The student (separate context) sees the conversation with unread badge "1", opens it, and replies "AUDIT: svar från elev". The thread shows both messages and the conversation's unread badge clears.
- ✘ Vue warning "Property `recipientSearch` was accessed during render but is not defined". The ref exists, but `views/MessagingView.vue:459` `setup()` doesn't return it, so the recipient search box in "Ny konversation" can't filter.
- Minor: after replying, the list preview still shows the previous message. The unread badge in the list is rendered as a full-width red bar (CSS).

### E2-02 Chatbot — `/chatbot` (student)
- ✔ Renders with 7 FAQ categories and a composer. "Vad är Komvux?" → correct Komvux answer.
- ✘ "Hur bokar jag ett slutprov?" → an unrelated **CSN** answer ("Du ansöker genom att följa … CSN:s hemsida"). Confirms the pass-1 API finding in the UI.

### E2-03 Course templates — `/course-templates` → `/admin/course-card-builder`
- ✔ The list renders, though one existing template shows as "Namnlös mall" with a blank module count.
- ✔ "Ny kursmall i byggaren" pre-fills 5 modules, with a **Delprov** badge on Module 3 and **Case** on Module 5.
- ✘ The UI builder pre-fills only **one section per module** ("Delmoment x.1"), i.e. 5×1. The API (`POST /api/course-templates`) creates 5×2. The two creation paths disagree with each other, and the UI disagrees with the spec.

### E2-04 Shared course cards — `/course-instances`
- ✔ Lists instances with Inskrivningar and Ansvarig lärare. The SVA1 2026-07-06 → 09-28 instance is a shared card with **4** enrollments and teacher Eva Nahi, and the teacher's `/larare/kurser` shows the same 4 students.
- Console: repeated Vue warning "Property `templates` was accessed during render but is not defined" (CourseInstances view). Import-to-instance grouping was not re-run in the UI.

### E2-05 Course card views
- ✔ **Student** `/course-cards`: shows cards with the module/section tree, assignment text, a submission form, "Trådar om uppgiften", and a read-only "Anslagstavla och aktivitet" panel with no post control.
- ✔ **Submission round-trip:** the student submits "AUDIT: UI-testinlämning modul 1" ("Väntar på återkoppling"). The teacher's `/submissions` lists it; the teacher sets **Komplettera** with "AUDIT: komplettera med fler exempel" and clicks "Spara återkoppling". The student then sees "Komplettera" + the comment.
- ✘ **The return comment is lost on resubmission.** After the student resubmits, the card shows only "Väntar på återkoppling" and the teacher's komplettering comment is gone (UI confirmation of the pass-1 finding).
- ✘ **There's no UI for a teacher to post to the bulletin board.** The only posting UI is `/admin/activity-feed` (admin-only route). The teacher course-card view (`/course-cards/overview/:id`) is a module pager with content and threads, but no anslagstavla. Combined with the pass-1 API bug, the responsible teacher has no way to post at all.
- ✘ No Översikt / Innehåll / Övningsuppgifter tab structure exists. The student gets one combined card view, and `/course-cards/overview` is staff-only (student → `/unauthorized`). Hide/unhide (`isHiddenFromStudent`) was not exercised.

### E2-09 APL kit — student start page
- ✘ Anna's `/course-cards` shows "APL-paket e2e" as an **ordinary course card**: no personal APL kit, no logbook, no colour-coded behind-schedule warning. Confirms the FAIL.

### Test-harness note
- Partway through, the first browser tab stopped dispatching clicks: fills still worked, but every click (including "Logga in") was a no-op and there were no console errors. A fresh tab behaved normally, and the affected flows (student opening a conversation, chatbot submit) **work** there. This was a browser-session artefact, **not an app bug**, and observations from the stuck tab were discarded.

### Not exercised in pass 2 (status unchanged, still API/code only)
E1-16 (Scrive), E1-20 (SYV/specped appointments, accommodation registration), E2-06 (`/schedule-parameters`), E2-07 (`/admin/learning-management`, `/admin/reports`), E2-08 (`/admin/inactivity`), E2-10 (`/admin/certificates`, Studieintyg button), E2-11 (`/larare/generera-exam`, `/student/fragebank`). Also: NP-points entry (blocked by the empty seeded scales), the Akalla booking, the action-plan questionnaire/PDF, and module hide/unhide.

## 4. Cross-cutting security findings

| Severity | Finding | Location |
|---|---|---|
| ~~Critical~~ ✅ FIXED | bcrypt password hash returned to any staff user | `searchRoutes.js:425` `GET /api/details/teacher/:id` |
| ~~High~~ ✅ FIXED | Student can download staff slutprov files | `utils/documentAuthorization.js` |
| ~~High~~ ✅ FIXED | Students can read question-bank answers | `router/questionBankRoutes.js` GET `/`, `/:id` |
| ~~Medium~~ ✅ FIXED | Student can book meetings for other students as "syv" | `router/meetingroutes.js:106` |
| ~~Medium~~ ✅ FIXED | Teacher can set enrollment to Betygsatt, bypassing grading | `PUT /api/enrollments/:id/status` |
| Medium | Two disagreeing permission systems (`roles.js` vs `PERMISSION_MATRIX`) | `config/roles.js`, `config/permissions.js` |
| Low | Linear frontend role hierarchy grants cross-role routes | `store/store.js:5` |
| Low | `/api/stats/courses-per-month` open to students | `statsRoutes.js:10` |

## 5. Test data left in the database

The cleanup step was blocked by the environment's permission guard, so this data **remains**:
- Students "AUDIT Importsson" (`6b0247c7b64c6911d3817f29`) and "AUDIT Tvåsson" (`6b024994b64c6911d3817f2a`), with their enrollments, CourseInstances and slutprov `calendar_events`.
- 3 documents (`AUDIT-handlingsplan.pdf`, `AUDIT-slutprov-SVA1.pdf`, `AUDIT-apl-kontrakt.pdf`).
- Meetings, a conversation and messages, 2 course templates, 1 question + exam attempt, 1 submission, AplRecords, and notifications, all starting with `AUDIT`.
- Seeded records modified:
  - **Anna:** comment, phone, accommodations 30 min/computer/separate room, APL override flag.
  - **Calle:** APL override flag.
  - **Eva:** vacation fields (onVacation=false, but the dates/note remain).
  - **Exam `6b0243e30532c8d9fcbd7e4c`:** decision "move".
  - **Berta's MAT1a enrollment:** locked.
- **Pass 2 data (current seed, all tagged `AUDIT` where the UI allowed text):**
  - Conversation "AUDIT UI-test", admin ↔ Anna, with 2 messages ("AUDIT: testmeddelande från admin", "AUDIT: svar från elev").
  - Anna, SVA1 (instance `6b024fb4bdb838fa291574a9`) module 1 submission: "AUDIT: kompletterad inlämning modul 1". The earlier feedback "AUDIT: komplettera med fler exempel" was overwritten on resubmission.
  - **Berta, MAT1a VT26:** grade **C**, motivation "AUDIT: motivering UI-test", **LOCKED**, plus the `grade_locked` notification.
  - **Doris, MAT1a VT26:** grade **F**, motivation "AUDIT: F-betyg UI-test". Its `action_plan_required` notification was dismissed by the teacher during the test.
  - **Untagged (the UI can't store a note):** slutprov 2026-10-15 (Eva Nahi), Doris `attended:true`, `examTime 09:00`, `examMunicipality Sollentuna`, `examLocation "Lilla rummet"`.
  - Local file `.playwright-mcp/avbrottsrapport.csv` (export test).
  - Re-running `node backend/scripts/seedE2EData.js` resets all of the above.
  - **Note:** the DB was re-seeded again around 02:48 UTC (IDs now `6b0257e…`), so the pass-2 data above is gone too. A read-only `mongosh` check confirmed the seeded `gradingscales` have `scale: []` (seed-script field-name bug, §3b E1-15).
- **Batch 1 verification data (current seed):**
  - Question `6b025ad306b58efa74bcc7ce` "AUDIT: Vad är 2+2?" (answer key "AUDIT nyckel").
  - Anna Kursarkiv document `6b025b1e06b58efa74bcc7d8` "AUDIT-slutprov-SVA1.txt" (type `SLUTPROV`).
  - 2 meetings titled "AUDIT verify" for Berta (booked as syv by syv, and as syv by admin).
  - No enrollment statuses changed: both teacher attempts were rejected with 403.
- Reviewable cleanup script from pass 1 (keeps audit logs; written for the old seed's IDs): `/tmp/claude-1000/-home-cyrus-mindful-new/c7407930-ca14-40d1-8b5a-2b86c057dfe2/scratchpad/cleanup_audit_data.js`. Alternatively re-run `node backend/scripts/seedE2EData.js`.

## 6. Batch 1 fixes: security & access control (applied after the audit)

At the user's request, the five Batch 1 security items were fixed in `backend/` and `frontend/`. These are the only application-code changes.

| # | Item | Change | Verified live |
|---|---|---|---|
| 1 | E1-03 password-hash leak | `GET /api/details/teacher/:userId` now selects `-password -mustChangePassword` (`backend/src/router/searchRoutes.js:428`). | Browser as teacher, plus curl as teacher and syv: response contains no `password` and no `$2…` hash. |
| 2 | E1-09 staff exam files | **Model and helper:** new staff-only document types `DELPROV` / `SLUTPROV` (`models/Document.js`). `utils/documentAuthorization.js` adds `STAFF_ONLY_DOCUMENT_TYPES`, `isStaffOnlyDocumentType()` and `isStaffUser()`, and `canAccessDocument()` denies these types to non-staff before any ownership or sharing check. Because the protected `/uploads/:filename` route uses the same helper, it is covered too.<br>**Routes (`router/documentRoutes.js`):** students can't upload them (403); `GET /documents/:id` accepts comma-separated `type` and filters exam types out for non-staff; `/documents/shared` filters them for non-staff.<br>**UI:** Kursarkiv (`CourseArchiveTab.vue`) offers Kursarkiv / Delprov / Slutprov through a new optional `uploadTypes` prop on `DocumentSection.vue`. Students are never offered the exam types, and each file shows a type badge. | Admin uploaded `AUDIT-slutprov-SVA1.txt` as **Slutprov** through the UI and it shows with a "Slutprov" badge.<br>**Student (Anna):** `GET /api/documents/download/:id` → **403**, `GET :5010/uploads/<file>` → **403**, list → `[]`.<br>**Staff:** admin download 200; Anna's teacher download 200. |
| 3 | E2-11 answer leak | `GET /api/question-bank/`, `/:id` and also `/by-course/:courseId` (same leak) now project out `correctAnswer` **and** `answerGuidelines` for any non-staff caller (`router/questionBankRoutes.js`). | Browser as student: list and `/:id` contain the AUDIT question with 0 `correctAnswer` / `answerGuidelines`. Teacher still receives both. |
| 4 | E1-20 meeting spoofing | `POST /api/meetings`: only syv / specped / admin / systemadmin may create (403 otherwise), and `bookedBy` must be one of the caller's own roles. Admins may book on behalf of syv/specped, which the appointments page relies on (`router/meetingroutes.js`). | curl against :5010: student as syv **403**; syv as syv 201; syv as specped **403**; admin as syv 201. |
| 5 | E1-05 Betygsatt bypass | `enrollmentService.updateEnrollmentStatus` lets a non-admin neither set `completed` directly nor change any status on a grade-locked enrollment; both return 403. The controller now passes the full `roles`. StudyPlanTab disables the "Betygsatt" option for non-admins. | curl as teacher: unlocked enrollment → completed **403** "Status Betygsatt sätts via betygssättningen"; locked enrollment → **403** "Betyget är låst". Browser as teacher: "Betygsatt" option rendered `[disabled]`. |

**Tests:**
- **Backend:** `npx vitest run` on the 9 affected suites (`documentAuthorization`, `questionBankRoutes` unit+integration, `searchRoutes` unit+integration, `enrollmentService`, `courseMatchingController`, `documentRoutes`, `meetingRoutes`) passes **279/279**. That includes 13 new tests covering each fix.
- **Updated assertions:** existing tests that set `completed` with no role now run as admin, and the `Question.findById` / `User.findById` mocks support `.select()`.
- **Frontend:** `StudyPlanTab.test.js` passes 7/7.
- Not run: the full `make citest` suite.

**Remaining caveats:**
- **Older Kursarkiv files:** these were all stored as `COURSE_ARCHIVE` (also used for student "Praktikintyg") and stay student-visible. Exam files uploaded before this fix must be re-classified as Delprov/Slutprov, for example by re-uploading them.
- **Teachers and meetings:** a teacher using "Lägg till möte" in `/kalender` sends `bookedBy: "teacher"`. That was already rejected before (400) and is now 403. If teachers should book meetings, the allowed set needs widening deliberately.
- **Exam attempts:** `GET /api/question-bank/exam-attempts` was not reviewed for embedded answers.

