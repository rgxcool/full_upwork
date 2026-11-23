# Mindful Learning — Technical & Functional Audit Specification (Etapp 1 & Etapp 2)

## 1. Audit Execution Protocol

### Objective
Independently verify whether every requirement in **Etapp 1** and **Etapp 2** is genuinely implemented, wired end-to-end between Vue (`frontend/`) and Express/MongoDB (`backend/`), enforced by role-based permissions, and functional at runtime.

### Environment & Runtime Baseline
- **Repository Root:** `~/mindful-new` (`pnpm` monorepo)
- **Backend API:** `http://localhost:5010` (health check: `GET /health` and `GET /health/ready`)
- **Frontend UI:** `http://localhost:5173`
- **Database:** Local MongoDB (`mongod` on `127.0.0.1:27017`)
- **Seed Data:** `node backend/scripts/seedE2EData.js`
- **Automated Baseline Suites:**
  - `make citest` (or `pnpm --filter backend test` and `pnpm --filter frontend test`)
  - `node postman/run-tests.mjs`

### Strict Auditor Rules
1. **Do NOT modify production application code** (`backend/src/` or `frontend/src/`) during the audit.
2. Only write temporary verification scripts/tests (under `e2e/` or `/tmp`) and output the final report to `AUDIT_REPORT.md`.
3. Every requirement must be evaluated across **three layers**:
   - **Data/Model Layer:** Schema fields, indexes, and hooks exist.
   - **API/Controller Layer:** Authenticated endpoints respond accurately and enforce role/municipality permissions.
   - **UI/Browser Layer:** Vue routes/components render without console/network errors and complete user workflows via Playwright.
4. **Status Definitions:**
   - `PASS`: Verified in code **and** confirmed working at runtime across both API and UI for the expected roles.
   - `PARTIAL`: Backend logic or UI view exists, but frontend-backend wiring is incomplete, an edge case fails, or role restrictions are missing/bypassable.
   - `FAIL`: Endpoint or UI throws 4xx/5xx errors, crashes, or produces wrong calculations/data.
   - `MISSING`: Feature is stubbed, commented out, or absent from the codebase.

---

## 2. Etapp 1 — Grundläggande system, behörigheter och register

### E1-01: Användarroller & behörighetsmatris (7 roller)
- **Spec:** 7 roles (`Systemadministratör`, `Administratör`, `Lärare`, `SYV`, `Specialpedagog`, `Praktiksamordnare`, `Elev`) with controlled permissions for *slutprovskalender, meddelanden, sökning, statistik, utvärderingar, massutskick, kursskapande, användarhantering, hierarkihantering* and *egna inställningar*.
- **Codebase Touchpoints:**
  - `backend/src/models/User.js` (`roles` enum: `student`, `coordinator`, `specped`, `syv`, `teacher`, `admin`, `systemadmin`)
  - `frontend/src/components/PermissionMatrixEditor.vue`
  - `frontend/src/router/router.js`
- **Verification Criteria:**
  - Log in as each of the 7 roles and verify navigation/route guards block unauthorized views.
  - Verify API endpoints reject unauthorized roles with `403`.

### E1-02: Personanpassade behörigheter per individ
- **Spec:** Ability to customize permissions per individual user (e.g., granting a specific teacher permission to edit the slutprov list or share documents between selected teachers during grading).
- **Codebase Touchpoints:**
  - `backend/src/models/User.js` (`permissions` field)
  - `backend/src/router/userRoutes.js`, `backend/src/router/documentRoutes.js`
  - `frontend/src/views/Admin/EditUser.vue`, `frontend/src/components/PermissionMatrixEditor.vue`
- **Verification Criteria:**
  - Toggle an individual permission override on a specific teacher account, persist it, re-login as that teacher, and verify the granted capability works while other teachers remain restricted.

### E1-03: Global sökfunktion (träffar från 3 tecken)
- **Spec:** Central search box returning results starting at **3 characters** across:
  1. **Elev** (first, middle, and last name -> links to student profile)
  2. **Datum** (course start / course end)
  3. **Lärare** (profile + active/completed students and courses)
  4. **Kurs** (teacher + enrolled students)
- **Codebase Touchpoints:**
  - `frontend/src/components/NavBar.vue`
  - `backend/src/router/searchRoutes.js`
- **Verification Criteria:**
  - Verify `< 3` characters does not trigger search noise; typing 3+ characters returns grouped matches for students (including middle names), dates, teachers, and courses, and clicking each navigates to the valid target view.

### E1-04: Användarprofil — Flik 1: Allmänt
- **Spec:** Displays contact details, personnummer, studieplan/slutbetyg, contact pathways, and internal comments (e.g., support needs / separate room during exams for students, vacation/absence for staff, and marking of revised student).
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/EditStudent.vue`, `frontend/src/views/Teacher/ProfilePage.vue`
  - `backend/src/models/User.js` (`onVacation`, `vacationStart`, `vacationEnd`, `vacationNote`), Student model
- **Verification Criteria:**
  - Verify all fields render, save, and persist for both student and staff profiles, including vacation/absence flags and internal accommodation/revision notes.

### E1-05: Användarprofil — Flik 2: Studieplan
- **Spec:** Overview of courses/course packages, linked teacher, start/end dates, and course status (*Antagen, Betygsatt, Avbrott, Ej påbörjad, Reviderad*), plus matching overview on teacher pages.
- **Codebase Touchpoints:**
  - Student detail/profile views, `StaffProfile` view
  - Enrollment/CourseInstance controllers
- **Verification Criteria:**
  - Verify all 5 course statuses display accurately on student profiles and that teacher profile pages show their assigned active/completed courses and students.

### E1-06: Användarprofil — Flik 3: APL (döljs för personal)
- **Spec:** Internship (APL) information for students enrolled in course packages; **must be hidden for staff profiles**.
- **Codebase Touchpoints:**
  - Student profile tab components vs. `StaffProfile` / `ProfilePage.vue`
- **Verification Criteria:**
  - Open a course-package student profile and confirm the APL tab is visible with internship data; open a teacher/admin/staff profile and confirm the APL tab is hidden.

### E1-07: Användarprofil — Flik 4: Behörigheter
- **Spec:** Viewing and adjusting individual permissions directly from the user profile.
- **Codebase Touchpoints:**
  - `frontend/src/components/PermissionMatrixEditor.vue`, `frontend/src/views/Admin/EditUser.vue`
- **Verification Criteria:**
  - Open the Behörigheter tab on a user profile, modify a permission, reload, and verify the state persists.

### E1-08: Användarprofil — Flik 5: Dokument
- **Spec:** Upload, rename, type classification, and management of student documents (e.g., *handlingsplan, CV, APL-kontrakt*).
- **Codebase Touchpoints:**
  - `frontend/src/components/FileUploaderDownloader.vue`
  - `backend/src/router/documentRoutes.js`, `backend/src/router/uploadRoutes.js`
- **Verification Criteria:**
  - Upload a test PDF/DOCX, classify its document type, rename it, download it, and verify persistence and role-based access control.

### E1-09: Användarprofil — Flik 6: Kursarkiv
- **Spec:** Central collection for course-related documents such as *delprov* (partial exams) and *slutprov* (final exams).
- **Codebase Touchpoints:**
  - Profile/course archive components and `backend/src/router/documentRoutes.js`
- **Verification Criteria:**
  - Upload/view delprov and slutprov files in Kursarkiv and verify students cannot access restricted staff exam files.

### E1-10: Kursplacering, Alvis-import & automatiska beräkningar
- **Spec:** Manual placement or data import from Alvis (`ExcelUpload.vue`) with automatic calculation of:
  - Course end date (**5, 10, or 20 weeks**)
  - *Slutprovsdatum* per teacher
  - Exam location (*på plats* vs. *distans* depending on municipality)
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/ExcelUpload.vue`, `frontend/src/views/Admin/ManualAddStudent.vue`
  - `backend/src/utils/integratedEducationParser.js`, `backend/src/utils/slutprovDateCalculator.js`
  - `frontend/src/utils/municipalityPricing.js`
- **Verification Criteria:**
  - Place a student manually and via Excel/Alvis template; verify end dates for 5/10/20 weeks, auto-calculated `slutprovDate`, and municipality-based exam location (`på plats` vs `distans`).

### E1-11: Kurspaket, studietakt & studieplansändringar
- **Spec:** Course package management with study pace (`100%`, `50%`, `25%`), ability to revise/remove courses, and automatic sync against slutprov and APL lists (including uploading certificates for previously completed internship).
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/EducationEditor.vue`, `frontend/src/views/Admin/EducationDetails.vue`
  - `backend/src/router/coursePackageRoutes.js`, `backend/src/router/placementRoutes.js`
- **Verification Criteria:**
  - Enroll a student in a course package at 100%, 50%, and 25% pace; revise/remove a course; upload a prior-APL certificate; verify slutprov and APL lists update automatically.

### E1-12: Avbrott, inaktiva elever & återaktivering
- **Spec:**
  - Automatic removal from slutprov and APL lists upon dropout (*avbrott*).
  - Move to inactive students list with simple reactivation when returning students resume studies.
  - Automatic recalculation and notification/confirmation when study pace changes.
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/InactiveStudents.vue`
  - `backend/src/services/dropoutService.js`, `backend/src/services/enrollmentService.js`
- **Verification Criteria:**
  - Trigger a student dropout -> confirm removal from slutprov calendar and APL board -> locate student in `InactiveStudents` -> reactivate -> confirm restoration. Change study pace and verify recalculation + notification.

### E1-13: APL-hantering & färgkodade listor (6 färgkoder)
- **Spec:** Automatic intake of course package students with 6 filterable color codes:
  - `Vit` = ny
  - `Blå` = kontaktad
  - `Gul` = APL på gång
  - `Lila` = uppföljning
  - `Röd` = automatisk varning när X veckor återstår
  - `Grön` = klar praktik
- **Codebase Touchpoints:**
  - `frontend/src/components/APLBoard.vue`
  - `backend/src/controllers/aplController.js`, `backend/src/services/aplService.js`, `backend/src/utils/aplAutoStatus.js`
- **Verification Criteria:**
  - Verify course package students appear automatically on `APLBoard`, filter by each of the 6 colors, update statuses, and verify the automatic red warning rule triggers when remaining weeks $\le X$.

### E1-14: APL-vyer & kontraktsarkiv
- **Spec:** Separate views/tabs for ongoing APL, green-marked completed students (contact details, internship period, uploaded contract), and APL contract files.
- **Codebase Touchpoints:**
  - `frontend/src/views/APLView.vue`, `frontend/src/views/Admin/AplCompletedTab.vue`, `frontend/src/components/APLFileArchive.vue`
- **Verification Criteria:**
  - Mark an APL student green with contract uploaded; verify they appear in `AplCompletedTab` with full metadata and that their contract appears in `APLFileArchive`.

### E1-15: Betygsättning, nationella prov & låsning av betyg
- **Spec:** Grading view where teachers receive reminders at course end, assign grades (`A–F`) with mandatory motivation, register national exam scores (Svenska, Engelska, Matematik) against annually updated grading scales, and lock grades with notification to administrator.
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/Betygsrapporter.vue`, `frontend/src/views/Admin/GradingScaleAdmin.vue`, `/betyg` route
  - `backend/src/router/gradeRoutes.js`, `backend/src/services/gradingReminderScan.js`
- **Verification Criteria:**
  - Attempt saving a grade without motivation (must fail validation); register national exam points and verify scale lookup; lock grade and confirm admin notification is created and further teacher edits are blocked.

### E1-16: Digital signering av betygskataloger
- **Spec:** Digital signing workflow for grade catalogs (similar to Scrive flow).
- **Codebase Touchpoints:**
  - `backend/src/router/gradeCatalogRoutes.js`
  - `frontend/src/views/Admin/Betygsrapporter.vue` / `Completions.vue`
- **Verification Criteria:**
  - Initiate digital signing on a grade catalog, complete the signing step, and verify signature metadata/status is recorded.

### E1-17: F-betyg & låst handlingsplan (PDF)
- **Spec:** Automatic notification and **locked reminder** when an `F` grade is assigned until the teacher completes an editable questionnaire that generates a downloadable action plan PDF.
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/ActionPlanManager.vue`
  - `backend/src/router/actionPlanRoutes.js`, `backend/src/utils/actionPlanPdf.js`
- **Verification Criteria:**
  - Assign an `F` grade -> verify locked reminder notification appears and cannot be dismissed prematurely -> fill out questionnaire -> download generated PDF and verify reminder unlocks.

### E1-18: Prövningar (bokning, betalning & lärargodkännande)
- **Spec:** Exam retake (*prövning*) list linked to website booking/payment (or file import), tracking payment date and picked-up material (`SVE/SVA 1` and `3`), plus teacher notification 3–4 weeks before exam to approve, postpone 1 month, or deny with motivation.
- **Codebase Touchpoints:**
  - `backend/src/router/examRoutes.js`
  - Exam/prövning admin & teacher views
- **Verification Criteria:**
  - Import/create a prövning entry, record payment date and material pickup (`SVE/SVA 1/3`), and test teacher actions (approve, postpone 1 month, deny with required motivation).

### E1-19: Slutprovskalender (Sollentuna & Akalla)
- **Spec:** Color-coded monthly calendar per teacher with participant list, attendance marking, display of exam accommodations (extended writing time, computer, separate room), and booking of location and room in **Sollentuna** and **Akalla**.
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/CalendarHousekeeping.vue`, `backend/src/router/examRoutes.js`
- **Verification Criteria:**
  - Open the monthly calendar filtered by teacher, inspect a scheduled exam date, verify student accommodation badges render, mark attendance, and book a room in Sollentuna and Akalla.

### E1-20: SYV- & Specialpedagogfunktioner
- **Spec:** Student view, meeting booking in calendar, and notes in student card for both `SYV` and `Specialpedagog`; study plan revision for `SYV`; registration of final exam accommodations for `Specialpedagog`.
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/MeetingModal.vue`, `backend/src/router/meetingRoutes.js`
  - `frontend/src/router/router.js` (`/specped/appointments`, SYV routes)
- **Verification Criteria:**
  - Log in as `syv` and `specped`; book a calendar meeting, add student card notes, revise a study plan (SYV), and register exam accommodations (Specialpedagog) and verify those accommodations surface in the slutprov calendar (`E1-19`).

### E1-21: Ekonomi och rapporter
- **Spec:** Statistics and export for revenue per municipality and course upon grade setting, monthly forecasts, student counts, dropouts, number of F-grades, and grade distribution curve per course.
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/AnalyticsDashboard.vue`, `frontend/src/views/Admin/EarningsOverview.vue`, `frontend/src/views/Admin/CourseStatisticsAdmin.vue`, `frontend/src/views/Admin/CoursesStats.vue`
  - `frontend/src/utils/exportUtils.js`, `backend/src/router/statsRoutes.js`
- **Verification Criteria:**
  - Load analytics/earnings views, verify municipality/course revenue, forecasts, dropout/F-grade metrics, and grade curve render accurately, and execute an export (CSV/Excel/PDF).

---

## 3. Etapp 2 — Lärplattform, kommunikation och automatiseringar

### E2-01: Intern mejl/chatt
- **Spec:** Built-in messaging system on the platform for staff and students.
- **Codebase Touchpoints:**
  - `frontend/src/api/messaging.js`, `frontend/src/components/MessageBubble.vue`, `frontend/src/components/MessageInput.vue`
  - `backend/src/router/messagingRoutes.js`
- **Verification Criteria:**
  - Send a message from a teacher/admin to a student and reply from the student account; verify delivery, unread state, and thread history.

### E2-02: Chattbot för elever
- **Spec:** Student chatbot that searches the school's existing information/FAQ on the platform and answers recurring student questions automatically.
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/FaqManagement.vue`, Chatbot view (`ChatbotView`)
  - `backend/src/router/faqRoutes.js`, `backend/src/services/chatbotService.js`, `backend/src/services/aiAnswerService.js`
- **Verification Criteria:**
  - Create/verify an FAQ entry as admin, log in as student, ask a matching question in the chatbot, and verify a relevant answer is returned without errors.

### E2-03: Kursmallar (5 moduler × 2 avsnitt, delprov & case)
- **Spec:** Template management for administrators (and selected teachers) with standard structure: **5 modules × 2 sections**, **partial exam (`delprov`) in module 3**, and **case study (`case`) in module 5**.
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/CourseTemplates.vue`, `frontend/src/views/Admin/CourseContentEditor.vue`
  - `backend/src/controllers/courseTemplateController.js`
- **Verification Criteria:**
  - Create a course template as admin, verify default/enforced structure of 5 modules × 2 sections with `isPartialExam` on Module 3 and `isCaseStudy` on Module 5, and verify selected teachers can access when permitted.

### E2-04: Automatisk generering & gruppering av delade kurskort
- **Spec:** Automatic generation and grouping of course cards upon enrollment so students taking the same course during the same start and end dates are linked to a shared course card together with the teacher.
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/CourseInstances.vue`, `frontend/src/views/Admin/CourseMatching.vue`
  - `backend/src/controllers/courseMatchingController.js`, `backend/src/services/courseMatchingService.js`
- **Verification Criteria:**
  - Enroll 2+ students into the same course with identical start and end dates; verify a single shared `CourseInstance` card is generated/reused with both students and the assigned teacher linked.

### E2-05: Kurskortsvyer (Översikt, Innehåll & Övningsuppgifter)
- **Spec:** Three core course card views:
  1. **Översikt:** Bulletin board (`anslagstavla`) writable **only by staff**, plannings, follow-up tasks, and events.
  2. **Innehåll:** Module and section tree with visibility toggle (`isHiddenFromStudent`) for students.
  3. **Övningsuppgifter:** Assignment submission, teacher feedback/comments, return for completion (*retur för komplettering*), and discussion thread.
- **Codebase Touchpoints:**
  - `frontend/src/components/Teacher/CourseOverview.vue`, `frontend/src/views/Admin/CourseContentEditor.vue`, `frontend/src/components/SubmissionsCommentThread.vue`
  - `backend/src/controllers/learningController.js`, `backend/src/router/learningRoutes.js`
- **Verification Criteria:**
  - Attempt posting to `Översikt` bulletin board as student (must be read-only/blocked) vs. teacher (succeeds).
  - Hide a module/section in `Innehåll` and confirm it is hidden in student view.
  - Submit an assignment as student -> return for completion with comment as teacher -> verify discussion thread and resubmission flow.

### E2-06: Automatisk datumplanering (5, 10 och 20 veckor)
- **Spec:** Teachers configure preset time intervals per course and length (**5, 10, or 20 weeks**) so the system automatically schedules all modules/sections (`sectionDates`) from course start when the course card is created.
- **Codebase Touchpoints:**
  - `backend/src/controllers/teacherScheduleParameterController.js`, `backend/src/router/teacherScheduleParameterRoutes.js`
- **Verification Criteria:**
  - Save teacher schedule intervals for a 5-, 10-, or 20-week course, generate a new course card, and verify `sectionDates` are populated automatically relative to `startDate`.

### E2-07: Fördjupade kursrapporter & deltagarspårning
- **Spec:**
  - Activity and 360° progress reports per student and course card including a column for **planned submission date** (*planerat inlämningsdatum*).
  - Participant list with automatic cleanup upon dropout/ended employment plus a column for **last visited course card** (*senast besökt kurskortet*).
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/LearningManagement.vue`, `frontend/src/components/Teacher/CourseOverview.vue`
  - `backend/src/controllers/learningController.js`, `backend/src/services/activityStatusService.js`
- **Verification Criteria:**
  - Open course card reports and participant list; verify the planned submission date column and last-visited timestamp column render and update when a student visits the course card.

### E2-08: Automatiserad inaktivitetsbevakning (5- och 14-dagarsregler)
- **Spec:**
  - Automatic monitoring of login and date planning: not logged in during the first **5 days**, and **14 days** of inactivity, generating notifications to teacher and administrator.
  - Direct actions inside the notification to either execute dropout (on single course or entire course package + mailings) or send a warning email with saved signatures.
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/InactivityReport.vue`, `frontend/src/components/notificationBox.vue`
  - `backend/src/services/inactivityScanner.js`, `backend/src/router/inactivityRoutes.js`
- **Verification Criteria:**
  - Run or simulate the inactivity scanner for a 5-day non-login student and a 14-day inactive student; verify notifications appear for teacher/admin and test both direct actions (dropout execution and warning email with signature).

---

## 4. Tillägg i slutet av Etapp 2 (Kontrollera mot avtal/offert)

### E2-09: Personanpassade APL-kit & loggbok
- **Spec:** Individual APL kits upon startup (visible on the student's start page instead of a shared course card) and color-coded activity warning when the student falls behind.
- **Codebase Touchpoints:**
  - `frontend/src/utils/aplKits.js`, `LogbookTab`
  - `backend/src/router/logbookRoutes.js`
- **Verification Criteria:**
  - Log in as a course-package student with APL; confirm the personalized APL kit renders on their start page (not a shared course card) and verify the logbook triggers a color-coded warning when behind schedule.

### E2-10: Studieintyg & automatiska diplom
- **Spec:** Button on student profile to generate *studieintyg*, plus automatic notification and generation of signed *diplom* when all courses in a course package and APL are passed.
- **Codebase Touchpoints:**
  - `frontend/src/views/Admin/CertificateManager.vue`, `frontend/src/api/certificates.js`
  - `backend/src/router/certificateRoutes.js`, `backend/src/services/diplomaNotificationScan.js`
- **Verification Criteria:**
  - Click the `Studieintyg` button on a student profile and verify PDF/document generation.
  - Mark all courses in a student's package and their APL as passed/completed; verify automatic diploma notification and signed diploma generation.

### E2-11: Frågebank & provgenerering
- **Spec:** Question bank where the platform can generate new exams and assignments.
- **Codebase Touchpoints:**
  - `backend/src/router/questionBankRoutes.js`
  - `ExamGeneration` view (`frontend/tests/unit/views/ExamGeneration.test.js`)
- **Verification Criteria:**
  - Open the question bank / exam generation view, add/filter questions, generate a new exam/assignment, and verify it saves/exports cleanly.