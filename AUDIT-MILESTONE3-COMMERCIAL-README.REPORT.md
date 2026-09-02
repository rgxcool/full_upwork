# Mindful Learning — Milestone 3 Audit Report
**Scope:** Full feature-by-feature audit of Etapp 1 + Etapp 2 specs, chatbot deep-dive, UI verification, and commercial-readiness recommendations for ~1,500 users.
**Branch audited:** `feat/milestone-3` (HEAD `4395f15`).
**Method:** Static code audit of the checked-out repo (Vue 3/Vuetify frontend, Express/Mongo backend). Every claim cites `file:line`. Status legend: **BUILT / PARTIAL / MISSING / DIVERGED** (from spec).

---

## Part 1 — Etapp 1 feature-by-feature status

### Roles & permissions (spec §"User Profiles")
| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | 7 roles with distinct permissions (elev, lärare, administratör, systemadministratör, SYV, specialpedagog, praktiksamordnare) | BUILT | `backend/src/config/permissions.js:18-26` (matrix), `backend/src/config/roles.js:1-79` (RBAC strings), `backend/src/utils/roles.js:1-11` (rank), `backend/src/models/User.js:9-28` (enum). All 7 roles exist. |
| 1b | Per-user permission overrides on top of role | PARTIAL | Per-user override objects exist (`User.permissions`, `EditUser.vue:60-103`), enforced by `canFeature`/`can` (`authorization.js:52-83,96-108`). BUT the granularity is only 9 coarse **feature flags** (`permissions.js:6-16`). There is **no** way to grant "one teacher edit-rights on the exam list" or "shared-document access for grading support" — the two spec examples. `PERMISSION_TO_FEATURE` (`authorization.js:42-48`) maps only 4 permission strings. |
| 1c | RBAC security / self-role-assignment | RESOLVED + NEW RISK | `authController.js:16-17` whitelists register to `["student","user"]`. BUT the **JWT embeds roles+permissions for 7 days** (`authController.js:94-105`, `:137-180`) without DB re-validation on API calls — role/permission revocations take up to 7 days to take effect. Overrides also read from the JWT, not the DB. |

### Search (spec §"Search Box")
| # | Item | Status | Evidence |
|---|---|---|---|
| 2 | Search by student/date/teacher/course | BUILT | `backend/src/router/searchRoutes.js:105-319`; `NavBar.vue:12-87`. |
| 2a | 3-character minimum | BUILT | `searchRoutes.js:162,164`; `NavBar.vue:757`. |
| 2b | Student by first/middle/last name | PARTIAL/DIVERGED | `Student.js:7` stores a **single** `name` field — no separate first/middle/last; searched as substring (`searchRoutes.js:171-185`). |
| 2c | Date search (course start/end that date) | BUILT | `searchRoutes.js:125-158`. |
| 2d | Teacher search → profile with active+completed courses/students | BUILT (no dedicated "Lärare" dropdown filter) | `searchRoutes.js:343-424`; teachers found under "Användare"/"Alla" (`NavBar.vue:42-61`). |
| 2e | Course search shows teacher + enrolled students | BUILT | `searchRoutes.js:442-519`. |

### Student/Staff profile tabs
| # | Tab | Status | Evidence |
|---|---|---|---|
| 3 | Tab1 Allmänt (contact, comments, support needs, exam accommodations, leave, revised/deviations flags) | BUILT | `GeneralTab.vue` (contact `34-111`, support `251-280`, accommodations `185-226`, dropout/leave `228-246`, deviations `282-318`); backend `studentDetailsController.js:275-897`. |
| 4 | Tab2 Studieplan (courses/packages, linked teacher, 5-status dropdown) | BUILT | `StudyPlanTab.vue` — all 5 statuses present: `enrolled`→Antagen, `completed`→Betygsatt, `dropped`→Avbrott, `inactive`→Ej påbörjad, `reviderad`→Reviderad (`:123-127`, `:507-511`). Teacher links clickable (`:102-108`). |
| 4a | Mirror on teacher profiles (active courses + linked students) | BUILT | `StaffCoursesTab.vue`, `StaffStudentsTab.vue`. |
| 5 | Tab3 APL (only course-package students, hidden for staff) | PARTIAL (over-broad) | `StudentDetails.vue:197-232` shows APL tab if package **OR** APL history/active status — broader than "only course-package students". Hidden on staff profiles (correct): `StaffProfile.vue:81-86` has no APL tab. |
| 6 | Tab4 Behörigheter (view/edit permissions) | BUILT | `Student/tabs/PermissionsTab.vue`; admin-only (`StudentDetails.vue:274`). |
| 7 | Tab5 Dokument (staff-uploaded docs) | BUILT | `DocumentsTab.vue` + `DocumentSection.vue`. |
| 8 | Tab6 Kursarkiv (course/final/partial exams) | BUILT | `CourseArchiveTab.vue:1-39`. |
| 9 | Cross-linking (course/teacher/student clickable everywhere) | BUILT | StudyPlan→course `:71-79,455`; teacher→profile `:102-108`; staff→student `StaffStudentsTab.vue:60-62`; staff→course students `StaffCoursesTab.vue:92-94`; router redirects `router.js:154-172`. |

### Courses & enrollment
| # | Item | Status | Evidence |
|---|---|---|---|
| 10 | Add-course button + wizard | BUILT | `StudyPlanTab.vue:33`; `CoursePlacementWizard.vue` (7 steps); backend `POST /process-education` (`courseMatchingController.js:1179-1213`), `POST /placement/preview` (`placementRoutes.js:13-235`). |
| 11 | Alvis data import / auto-placement | MISSING | "Alvis" appears only in FAQ text and a teacher-subject dropdown; **no** Alvis API client anywhere. Only Excel bulk import exists (`courseMatchingController.js:119-1177`). |
| 12 | Kurs vs kurspaket branching | BUILT | `CoursePlacementWizard.vue:25-147`; `placementRoutes.js:93-219`. |
| 13 | 5/10/20-week toggle + auto end date | BUILT (minor UX: end date not shown in wizard) | `CoursePlacementWizard.vue:126-133`; backend calc `placementRoutes.js:107-109`, `enrollmentService.js:22`. Shown in `ManualAddStudent.vue:323-333`. |
| 14 | Exam-day selection + auto exam date | BUILT (auto-calc; no in-wizard manual override) | `slutprovDateCalculator.js:73-189` (per-teacher rules), `placementRoutes.js:112-125`; override post-creation via `PUT /enrollment-exam-config`. |
| 15 | Support-needs checkbox | PARTIAL (schema yes, wizard UI missing) | `StudentEnrollment.js:21-24`; wizard hardcodes `needsSupport: false` (`CoursePlacementWizard.vue:486`). |
| 16 | On-site vs distance auto-set by kommun (Upplands Bro exception) | BUILT | `courseMatchingService.js:46-57`; wizard `CoursePlacementWizard.vue:514-521`; `ManualAddStudent.vue:351-378`. |
| 17 | Kurspaket study pace 100/50/25% | PARTIAL (missing in kurspaket wizard branch) | Present in `StudyPlanTab.vue:8-17` & `ManualAddStudent.vue:287-319`; wizard shows no pace selector for packages and sends no `pace` (`CoursePlacementWizard.vue:119-147`,`437-440`; `placementRoutes.js:28` accepts but ignores `pace`). |
| 18 | Revise-out specific courses from package | BUILT | `CoursePlacementWizard.vue:99-116`; `courseMatchingService.js:635-657`; `reviderad` flag fed to exam/APL lists. |
| 19 | Auto per-course start/end dates (kurspaket) | BUILT | `courseMatchingService.js:676-939`; `placementRoutes.js:149-218`; 2.5+2.5 grouping into 5-week blocks. |
| 20 | Auto APL registration + "completed internship elsewhere" certificate → Dokument tab | PARTIAL (ManualAddStudent only, not wizard) | `Student.js:109-116`, `ManualAddStudent.vue:427-452,1071-1091`. Wizard has no APL checkbox/cert upload. |

### Change-of-studies
| # | Item | Status | Evidence |
|---|---|---|---|
| 21 | Avbrott (dropout): status→Avbrott, teacher notification, removed from slutprovslista+APL-lista, moved to inactive list, recoverable | BUILT | `dropoutService.js:140-326` (notification `:93-126`, exam removal `:216-291`, APL filtered `aplService.js:30`, provning removal `:257-259`); recovery `dropoutService.js:338-448`; inactive list `studentRoutes.js:442-481`; UI `InactiveStudents.vue`. |
| 22 | Revidering: replan, slutprov/APL auto-update, notify teacher **AND student** | PARTIAL (teacher notified, **student not**) | `revisionService.js:42-155`; `sendRevisionNotifications` only emails/notifies the teacher (`revisionService.js:338-393`). Spec requires confirmation to teacher **and student** — student gets nothing. |
| 23 | Inaktiva elever (returning): recognize, auto-fill, course history w/ checkboxes, or new course | BUILT | `studentDetailsController.js:586-703`; `InactiveStudents.vue:119-155,230-251`; `StudyPlanTab.vue:730-784`. |

### APL module
| # | Item | Status | Evidence |
|---|---|---|---|
| 24 | Tab1 auto-populated, 6 colors (Vit/Blå/Gul/Lila/Röd/Grön) + filtering | BUILT | `APLView.vue:10-13`; `statusSystem.js:13-23` (GRAY/BLUE/YELLOW/PURPLE/RED/GREEN); `APLBoard.vue:42-48,414-423`. |
| 24a | Red auto-triggered X weeks before end | PARTIAL | Displayed effective status auto-derives RED via `aplAutoStatus.js:87-112` (default 3 wks). But persisted status auto-transition only runs via **manual button** — no scheduled job (`aplService.js:171-233`; `scheduler.js` has no APL job). |
| 24b | Fields for what student is seeking | MISSING | No `seeking`/`interest` field in `AplRecord.js`/`Student.js`/`AplTab.vue`. |
| 24c | CV/contract upload on student's own page | PARTIAL | Uploads exist but **coordinator-only** (`AplTab.vue:121-127,138-144` guard `isCoordinator`). Not student-uploadable. |
| 25 | Tab2 completed (green) w/ contact info, period, contract-upload checkbox | PARTIAL | Period shown (`AplCompletedTab.vue:31-36`); **contact info and contract checkbox MISSING** (backend exposes email/phone/cvDocId/contractDocId `aplService.js:246-249` but UI doesn't render them). |
| 26 | Tab3 APL contract file storage | BUILT | `APLFileArchive.vue`; `GET /uploads/all/apl` (`uploadRoutes.js:336-409`) GridFS. |

### Betyg (grading)
| # | Item | Status | Evidence |
|---|---|---|---|
| 27 | Auto-reminder to teachers at course end | MISSING | `taskReminderScan.js` only handles `Task` due dates, not course-end grading. No scheduled course-end scan (`scheduler.js:15-17,95`). Only pull-based `endDate<$now` query (`gradeRoutes.js:239-242`). |
| 28 | Grading page listing students needing grades | BUILT | `GET /students-to-grade` (`gradeRoutes.js:218-491`); `BetygSattning.vue:156,419` auto-populates on mount. |
| 29 | A–F dropdown, mandatory justification, optional comment | PARTIAL | Frontend enforces reason for all (`BetygSattning.vue:343-346`); **backend only enforces motivation for F** (`gradeRoutes.js:500,791`). |
| 30 | National-test score entry (Eng/Sve/Mat) | BUILT | `gradingScale.js:7,12-18`; `BetygSattning.vue:58-77`; `gradeRoutes.js:907-927`. |
| 31 | Year-editable grading scale by systemadmin | BUILT | `GradingScale.js`; `gradeRoutes.js:929-1000` (admin/systemadmin); `GradingScaleAdmin.vue`. |
| 32 | Teacher must lock grades | BUILT | `gradeRoutes.js:572-666`; lock-block `:800-802`; `BetygSattning.vue:102-111,390-417`. |
| 33 | Admin notified on lock (to submit to kommun) | PARTIAL | `GRADE_LOCKED` notification created (`gradeRoutes.js:637-647`) but **not admin-targeted** (no `teacher`/user target); no kommun submission/export implemented. |
| 34 | Admin/systemadmin unlock | BUILT | `gradeRoutes.js:134-216`; `BetygSattning.vue:401-411`. |
| 35 | Scrive digital signing of grade catalogs | PARTIAL (manual per-PDF upload) | `scriveClient.js` (OAuth1 testbed wrapper); manual upload→send per catalog (`gradeCatalogRoutes.js:140-327`; `Betygsrapporter.vue`). **No automated catalog generation** from grade data. |

### Handlingsplan (action plan)
| # | Item | Status | Evidence |
|---|---|---|---|
| 36 | Auto-notification on F that persists until filled | BUILT | `gradeRoutes.js:538-558,836-855`; `Notification.js:6` (resolved:false); resolves on save `actionPlanRoutes.js:342-357`. |
| 36a | Configurable questionnaire | PARTIAL (security gap) | `ActionPlanQuestions.js`; PUT restricted to systemadmin (`actionPlanRoutes.js:263-265`) but **POST not restricted** (any staff can delete+recreate the form: `actionPlanRoutes.js:115-120`). |
| 36b | Downloadable PDF on completion | BUILT | `actionPlanPdf.js`; `actionPlanRoutes.js:331-338`; download `ActionPlanQuestions.vue:356-381`. |
| 36c | Form editable by systemadmin | BUILT (frontend) / partial (backend POST gap above) | `ActionPlanTab.vue:12,42` (isSystemAdmin gate). |

### Prövningar (retake exams)
| # | Item | Status | Evidence |
|---|---|---|---|
| 37 | Dedicated page + searchable | BUILT | `/provningar` (`router.js:306-310`); `ProvningarCrud.vue:6-42,195-205`. |
| 38 | Students book and pay via school website | MISSING | `ExamForm.vue` is login-gated and **POST to /exams is admin-only** (`examRoutes.js:101`); **no payment gateway** (no swish/kort/stripe anywhere). Only a manual `paymentDate` field. |
| 39 | Intake list all required fields | PARTIAL | `Provning.js:5-30` has all fields, but `address` is not rendered in any form (`ExamForm.vue` no address input). |
| 40 | Teacher decision workflow (accept/push/decline + comment) | BUILT | `examRoutes.js:2536-2627`; `ExamAdminTable.vue:65-91`. |
| 41 | Material-pickup (SVE/SVA 1&3 only) + payment date visible on slutprovssida | PARTIAL | Gate is only `title.includes('sve')` — **not restricted to level 1/3 and excludes SVA** (`ExamForm.vue:140-144`). Data **not** shown on slutprovssida (EventModal has no such columns). |
| 42 | Accepted students auto-appear on teacher's slutprov | PARTIAL | `accept` writes `student.finalExamDate` (`examRoutes.js:2574-2582`) → syncable calendar; but no explicit prövning↔calendar handshake and no reverse-clearing on decision change. |
| 43 | Bulk download/upload of registrations | PARTIAL (upload only) | Import `examRoutes.js:2636-2772`; **download/export MISSING**. |

### Slutprovssida (exam calendar)
| # | Item | Status | Evidence |
|---|---|---|---|
| 44 | Auto-populates from enrollments/prövningar, auto-removes on changes | PARTIAL | Dynamic build from `finalExamDate`+`slutprovDate` (`examRoutes.js:909-1973`); auto-remove only for `dropout` flag — no removal on prövning denial/move reversal. |
| 45 | Calendar month view | BUILT | `ExamCalendar.vue:57-85`. |
| 46 | Teacher colors + click→students w/ attendance checkbox | PARTIAL | Colors `examRoutes.js:1328`; attendance checkbox `EventModal.vue:77-85`; **accommodations NOT shown as a per-student column** on slutprov list. |
| 47 | Teacher self-edit (with permission) vs admin-only | BUILT | `examRoutes.js:365-398`; `ExamCalendar.vue:238`; `EventModal.vue:238-255`. |
| 48 | Akalla/Sollentuna + 7 named rooms | DIVERGED | Locations built (`examRooms.js:6-9`); but config defines **9 rooms, not 7** (Sollentuna 5 + Akalla 4). Room selection UI is **not persisted** (EventModal `examRoom` v-model never submitted). |

### SYV / Specped
| # | Item | Status | Evidence |
|---|---|---|---|
| 49 | SYV: view, book meetings, add info, revise studieplan | BUILT | `SyvAppointments.vue` (`:145-151` booking, `:39-109` info, `:111-142` revise); `meetingroutes.js:79-138`. |
| 50 | Specped: view, book meetings, add info, **add exam accommodations** | PARTIAL | Booking/info built (`RoleBasedAppointments.vue`); exam accommodations backend built (`Student.js:95-100`, `meetingroutes.js:178-215`) but **no UI template** to render/save them (`RoleBasedAppointments.vue:1-47` has no accommodation form). |

### Ekonomi & rapporter
| # | Item | Status | Evidence |
|---|---|---|---|
| 51 | Configurable statistics page | BUILT | `AnalyticsDashboard.vue:7-77` filters (date/kommun/kurs/lärare); `analyticsRoutes.js:17`. |
| 51a | Revenue per kommun per course once graded | BUILT | `analyticsService.js:96-154` (filters graded); `municipalityPricing.js`. |
| 51b | Monthly revenue forecast | BUILT | `analyticsService.js:209-261`; forecast tab. |
| 51c | Stats by month/teacher/course/term (enrollments, dropouts, F-grades) | BUILT | `analyticsService.js:267-382,568-640,400-529`. |
| 51d | Per-course grade-curve export | BUILT | `AnalyticsDashboard.vue:829-842` (CSV+PDF). |

---

## Part 2 — Etapp 2 feature-by-feature status

| # | Item | Status | Evidence |
|---|---|---|---|
| 52 | Sollentuna auto-email (lärteamet info + PDF after acceptance) | BUILT | `emailService.js:176-202` (render), `:292-366` (brochure resolve + send), triggers on creation `studentRoutes.js:602-608` & bulk `studentController.js:566-582`. |
| 53 | Mejl/Chatt on-platform messaging | BUILT | `messagingRoutes.js:7-12`; `messagingController.js`; `messagingService.js:89-127` (role RBAC); `MessagingView.vue`. **Tenancy isolation MISSING** — no school/tenant scoping. |
| 53a | Students get email copy | BUILT | `messagingService.js:13-81` (student recipients get email copy); `emailService.js:208-225`. Non-fatal on failure. |
| 53b | Read-only push-style mobile notification (healthcare-like) | MISSING | No webpush/FCM/service worker. Only in-app polling (`NavBar.vue:533,561`); unread count API defined (`api/messaging.js:20-22`) but not wired to a badge. |
| 54 | Chatbot — see Part 3 deep-dive | DIVERGED (FAQ+keyword, not a true bot) | — |
| 55 | Lärplattform (students see plan/cards, open cards, lessons, assignments; teacher feedback + progress) | BUILT | `CourseCards.vue:27-216`; `learningController.js:42-109`; `Submissions.vue`; progress via `learningController.js:699-744`. Teacher progress view is coarse (no rich per-module column here). |
| 56 | Kursmall: admin-created, gated teachers, 5 mod × 2 sec, delprov M3, case M5, duplicate→kurskort | BUILT | `CourseTemplate.js`; `courseModuleSchema.js:40-77` (defaults, `isPartialExam`/`isCaseStudy`, clone); `CourseTemplates.vue:239-251`. |
| 57 | Kurskort automated from templates + dates | **BUILT — AUTOMATED** (spec's key question answered) | `CourseMatchingService.findOrCreateCourseInstance` (`courseMatchingService.js:128-289`) auto-creates the shared card from template modules + dates at enrollment; shared card enforced by unique index `{mainCourseId,startDate,endDate,responsibleTeacher}` (`CourseInstance.js:206-210`). Manual path also exists. |
| 57a | Kurskort displays name/start/end/period/weeks | BUILT | `CourseCards.vue:37-83`. |
| 58 | Kurskort first page: activity feed + staff-only noticeboard + teacher view of submissions + student's current module | PARTIAL | Activity feed built (staff-only post `courseMatchingController.js:2397-2411`); **no distinct noticeboard** (feed doubles as one); submissions built; **"student's current module" MISSING** — `sectionPositions` (`CourseInstance.js:109-113`) declared but never written. |
| 59 | Övningsuppgifter: return for revision; inline comments OR threaded discussion | PARTIAL | Return/`komplettera` built (`learningController.js:245-294`); inline comments shown (`CourseCards.vue:178-183`); **threaded discussion backend-only** — frontend posts flat, no `parentCommentId`, no reply UI (`Submissions.vue:79-100,219-242`). |
| 60 | Datumplanering automated from teacher params (5/10/20) auto-applied on new kurskort | **BUILT — AUTOMATED** | `TeacherScheduleParameters.js` + admin CRUD (`teacherScheduleParameterController.js`, `ScheduleParameters.vue`); auto-applied at creation (`courseMatchingService.js:226-265`, `courseMatchingController.js:1805-1843`). **No manual per-card planning editor** (replaced by automation). |
| 61 | Innehåll: admin/permitted teachers view/edit all modules, hide specific modules | PARTIAL | Content endpoint + `isHiddenFromStudent` (`courseMatchingController.js:2222-2334`; `CourseInstance.js:67-81`); **BUT hidden-content filter is NOT applied to the student course card/learning endpoints** — students still see raw modules (`enrollmentService.js:161`, `learningController.js:70`). Editor is a raw JSON textarea (`CourseContentEditor.vue:38-50`). |
| 62 | Rapporter: per-kurskort activity feeding inactivity logic; drill into student for per-module ✓/✗; "when was assignment scheduled" column | PARTIAL | Activity view feeds inactivity (`activityStatusService.js`, `InactivityReport.vue`); per-module report exists (`learningController.js:338-464`; `Reports.vue:127-129` green/gray) **BUT `completedComponents` is never written** — no code path populates it, so ✓/✗ is always empty. **"When set" column MISSING** (backend returns `scheduledDates`/`submittedAt` but UI doesn't render it, `Reports.vue:117-121,232-234`). |
| 63 | Deltagare: list/add/remove, auto-removal on dropout/staff departure, "last active" column | PARTIAL | List/add/remove built (`learningController.js:467-641`, `LearningManagement.vue`); auto-removal via dropout cascade / teacher-departure clearing (`teacherRoutes.js:417-419,509-512`). **"Last active on this kurskort" column MISSING** from the main participants table (only legacy modal shows last-login, `CourseInstances.vue:573,598`). |
| 64 | APL Etapp 2: loggbok (personalized kits issued at start, on landing page); activity color-coding | PARTIAL | Logbook CRUD built (`Student.js:154-170`, `userRoutes.js:399-533`, `LogbookTab.vue`); **no auto-issue at APL start**; landing-page link **broken** — `/apl/my` reads non-existent fields (`aplRoutes.js:37-42` reads `record.color/logbook/cvUrl/period` not on schema) → `hasLogbook` always false (`Dashboard.vue:103`). Activity behind-schedule: frontend hardcoded 14-day badge (`APLBoard.vue:345-353`); backend util `aplAutoStatus.js:130-145` is **dead code** (never wired). |
| 65 | Intyg: on-demand studieintyg button (Alvis-style) | BUILT | `studyCertificateController.js:48-115`; `StudentDetails.vue:39-56`; `CourseCards.vue:100-103`; `StudyPlanTab.vue:177-190`. (Signature is a printed text block, not cryptographic.) |
| 66 | Diploma: auto-triggered on kurspaket completion (all courses + APL approved), **sent signed to student** | PARTIAL | Eligibility verified (`studyCertificateController.js:122-251`, `certificateService.js:63-118`); daily scan creates a `diploma_ready` **staff notification** (`diplomaNotificationScan.js:17-101`) — **not auto-issued, not emailed to student**. The full approve/generate workflow router (`certificateRecordRoutes.js`, `certificateRoutes.js`) is **NOT mounted** in `router.js` → `CertificateManager.vue` cannot work. |
| 67 | Frågebank: bank of questions to generate new exams | PARTIAL | Question bank built (`Question.js`, `questionBankRoutes.js`, `QuestionBank.vue`); backend `POST /generate-exam` built (`questionBankRoutes.js:146-225`); **but `ExamGeneration.vue` is not routed and has broken calls** (GET generate-exam `:241`, non-existent save-exam `:319`) — no working exam-generation UI. |
| 67a | Frågebank kept separate from chatbot | BUILT (cleanly separated) | Distinct routers (`/api/question-bank`, `/api/course-bank`, `/api/chatbot`, `/api`) and models (`Question`/`Faq`/chatbot). No shared code. **Not conflated.** |

---

## Part 3 — Chatbot deep-dive

### 3.1 What was actually built vs. spec

**Spec wording (Etapp 2, §Chatbot):** *"Our students often ask questions about information they have already received. Would it be possible to integrate a chatbot that searches for relevant information and answers their questions?"* — i.e. a bot that **looks up information the student already received** and answers with it, not a browsable FAQ page.

**What exists:**
1. A **FAQ/knowledge base**: admin/teacher upload pdfs or author Q&A (`faqService.js`, `FaqManagement.vue`, `/admin/chatbot-faq`). Students **browse** categories→questions and click to get the pre-written answer (`ChatbotView.vue:158-192`). A click-through was added to "align chatbot FAQ answers with Mindful Q&A keyword PDF" (commit `ec523c2`).
2. A **free-text ask endpoint** `POST /chatbot/ask` (`chatbotRoutes.js:9-44`) that:
   - **Priority 1:** exact/alternate/keyword match against FAQ (`findMatchingFaq`, `faqService.js:398-446`) → returns stored answer.
   - **Priority 2:** substring/fuzzy keyword scan of the student's **enrolled course module titles/instructions** (`chatbotService.impl.js:159-224`) → returns a concatenated string (not true NLP).
   - Otherwise returns a canned "I can't find anything, contact your teacher" (`chatbotService.impl.js:102`) with no human escalation.

**Verdict:** This is a **keyword/exact FAQ lookup + naive substring match**, NOT a real conversational bot (no LLM, no retrieval ranking, no conversational memory, no intent understanding). It **does** do the "looks up information the student already has and answers" part at a basic lexical level, but:
- It can only "answer" if the FAQ keyword or an exact module substring is present. Anything phrased differently fails and returns a canned refusal.
- `status` advertises `aiProvider: openai` only if `OPENAI_API_KEY` is set (`chatbotRoutes.js:56`), **but the ConcreteChatbotService never calls an LLM** — the design comment explicitly says "this would be replaced by an LLM call" (`chatbotService.impl.js:246-247`) and never wires one.

**Latent bug:** `chatbotService.js:127` calls `StudentEnrollment.findOne(...)` but `StudentEnrollment` is **not imported** — would throw `ReferenceError` if the `courseInstanceId` path is used. Not currently exercised (ChatbotView sends only `{question}`), but it's a defect in the design interface.

### 3.2 Question bank vs. chatbot: NOT conflated (confirmed)
Separate routers/models (`Question` vs `Faq` vs chatbot). The only overlap is the generic word "question". **No conflation.**

### 3.3 Integration assessment
- **Reachable from Messaging?** NO. `MessagingView.vue` has zero chatbot references; chatbot is a standalone `/chatbot` route (`router.js:418-422`), reachable only from Dashboard/NavBar. **Not integrated with Mejl/Chatt.**
- **Logs unanswered questions?** NO. `logInteraction` only writes to `logger.info(...)` (`chatbotService.js:145-158`) — no DB persistence, no analytics model, no unanswered-question store.
- **Escalates to a human?** NO. When confidence is low/unapproved it returns a generic "contact your teacher" string; it does **not** create a notification, a message, or a ticket.
- **Tenancy/permissions:** Course-content answers are scoped to the student's own enrollments (`getEnrolledCourseInstances`, `chatbotService.js:101-117`; enrollment check `:126-133`) — good. FAQ answers are **global** (any student sees all active FAQs) — acceptable since FAQs are general school info, but must be vetted so no kommun-specific content leaks.

### 3.4 Full implementation plan for ~1,500 users

**Recommendation: hybrid retrieval, NOT a raw LLM chat.**
Given ~1,500 users, realistically a few hundred questions/day peak, a low tolerance for hallucination on factual school policy, and cost sensitivity, I recommend **retrieval-augmented FAQ/document grounding with optional LLM synthesis** — not free-form LLM chat.

| Option | Trade-off | Recommendation |
|---|---|---|
| **A) Keyword/exact FAQ (current)** | Zero cost, deterministic, but brittle (fails on rephrasing) | Keep as the **verified-answer layer** / fallback floor. |
| **B) Dense embeddings + vector retrieval (recommended)** | ~€10–50/mo for an embedding API at this volume; needs an index; high recall on rephrasing | **Primary path.** Embed FAQ items, policy docs, and per-course modules; retrieve top-k by cosine similarity; if retrieval is strong, return the top doc verbatim (zero hallucination + citation). |
| **C) LLM synthesis on top of retrieval (optional)** | ~$0.005–0.02/answer with GPT-4o-mini / Haiku tier; highest natural-language quality; small hallucination risk mitigated by strict "answer only from retrieved context" prompting | Use only to *rephrase* retrieved context when needed. Bypass entirely for low-budget rollout. |

**Recommended architecture (phased):**
1. **Phase 1 (launch, low cost):** Upgrade `findMatchingFaq` (already good) + add a lightweight **BM25/keyword-expansion** ranking over FAQ + course modules to replace the current substring scan. Add DB persistence of every interaction (`ChatbotInteraction` model) with `question, answer, confidence, sources, resolved/ok flag, studentId`. This alone fixes the two biggest gaps (unanswered logging + better lookup) at near-zero infra cost.
2. **Phase 2 (target):** Add **embedding retrieval**. Index `Faq` + approved policy documents + per-course module content into a vector store (MongoDB Atlas Vector Search if already on Atlas, else a small `pgvector`/Qdrant instance). Query embedding → top-k → return best doc with citation + confidence. Use an embedding API (OpenAI `text-embedding-3-small` or `Cohere embed-multilingual-v3` for Swedish). Estimated cost trivial at this volume; **cache** identical/similar questions (LRU + normalized-question hash) to cut calls and latency.
3. **Phase 3 (optional):** LLM **synthesis** only when a single retrieved doc doesn't answer cleanly, prompted with the retrieved context and instructed to answer **only from it** and to say "I don't know — I've forwarded your question" otherwise.

**Integration with Messaging (not an isolated widget):**
- Add the chatbot as a **first-class recipient/asset inside the messages UI**: a "Ställ fråga till Studieassistenten" entry in `MessagingView.vue` that opens the existing `ChatbotView` as a panel, and a rule that a **student message to an unassigned channel** can be answered by the bot.
- **Escalation:** When the bot cannot answer with sufficient confidence, raise a `chatbot_escalation` notification to the student's responsible teacher, attach the student's question + best partial context, and reply to the student: "I couldn't answer — your teacher has been notified." Store the escalation in `ChatbotInteraction` and auto-close when the teacher replies in the thread.

**Knowledge entry authoring/versioning:**
- Treat the existing FAQ as the curated knowledge base, and (Phase 2) allow **document upload** (PDFs like `folder-om-larteamet.pdf`, `Mindful_Q&A_Cyrus.pdf`) to be chunked, embedded, and kept in sync with source. Add **versioning** to `Faq` (an `effectiveFrom`/`supersedes` chain) so retired policy isn't served, plus `lastReviewedAt` for freshness. Audit all authoring via the existing `recordAudit` (`faqRoutes.js` already audits CRUD).

**Escalation + unanswered-logging:**
- Persist every interaction (fixing the current logger-only bug) with an `answered`/`escalated` flag; an admin dashboard lists unanswered/escalated questions; optionally a weekly digest of top unanswered topics to drive new FAQ entries.

**Permission & tenancy:**
- Keep course-content grounding strictly scoped to the student's own enrollments (already done). Ensure FAQ/vector index is tagged by tenant/municipality so a student never surfaces another kommun's or another student's data; enforce the student's own profile only.

**Infra/cost at 1,500 users:**
- **Rate limiting:** per-user per-minute cap on `/chatbot/ask` (e.g. 10/min) + global cap on the embedding/LLM provider (a shared token bucket) to bound spend.
- **Caching:** normalize + hash frequently asked questions; serve cached answers; TTL on vector/FAQ snapshots.
- **Self-hosted vs API:** For Swedish policy Q&A at this volume, **use hosted embedding + optional hosted cheap LLM** (OpenAI/Cohere/Anthropic). Self-hosting a model is not justified at this scale (needs GPU, ops burden) and the answer quality gap is minimal on a mostly-factual corpus. Estimated incremental cost: well under ~€100/mo including embeddings + cached cheap LLM synthesis.

---

## Part 4 — UI verification table

Legend: match / partial / diverged / missing.

| Screen (component) | Spec status | Notes | File refs |
|---|---|---|---|
| NavBar + global search | PARTIAL | Has Alla/Användare/Kurs/Datum; no "Lärare" filter; 3-char enforced | `NavBar.vue:42-61,757` |
| Student profile — Allmänt | MATCH | contact/comments/support/accommodations/leave/deviations | `GeneralTab.vue` |
| Student profile — Studieplan | MATCH | all 5 statuses + teacher links | `StudyPlanTab.vue:123-127` |
| Student profile — APL | PARTIAL (over-broad) | shows for package OR history/manual, not strictly package-only | `StudentDetails.vue:197-232` |
| Student profile — Behörigheter | MATCH | admin-gated matrix | `tabs/PermissionsTab.vue` |
| Student profile — Dokument | MATCH | staff-uploaded docs section | `DocumentsTab.vue` |
| Student profile — Kursarkiv | MATCH | per-enrollment docs | `CourseArchiveTab.vue` |
| Teacher/staff profile (4 tabs) | MATCH (no APL — correct) | Allmänt/Kurser/Elever/Filarkiv | `StaffProfile.vue`, `Teacher/Tabs/*` |
| Enrollment wizard | PARTIAL | branching, dates, exam, kommun mode OK; **no support checkbox**, **no kurspaket pace**, **no APL-cert checkbox** | `CoursePlacementWizard.vue` |
| ManualAddStudent | MATCH (superset) | has pace + UpplandsBro + APL-cert (unlike wizard) | `ManualAddStudent.vue:287-452` |
| Inactive students | MATCH | reactivation with course checkboxes | `InactiveStudents.vue` |
| Study plan revision modal | MATCH (UI) | history + reason; but no student notification backend | `StudyPlanRevisionModal.vue`, `revisionService.js:338-393` |
| APL board (Tab1) | PARTIAL | 6 colors + filter + auto-red display; no "seeking" field, no scheduled persisted RED | `APLBoard.vue`, `aplAutoStatus.js` |
| APL completed (Tab2) | PARTIAL | period yes; no contact info/contract check | `AplCompletedTab.vue` |
| APL archive (Tab3) | MATCH | GridFS archive | `APLFileArchive.vue` |
| Betyg (teacher grading) | PARTIAL | auto-populates; reason client-only for all, server only for F | `BetygSattning.vue:343-346`, `gradeRoutes.js:500,791` |
| Grading scale admin | MATCH | annual terms, systemadmin | `GradingScaleAdmin.vue` |
| Betygsrapporter / Scrive | PARTIAL | manual per-PDF signing | `Betygsrapporter.vue`, `gradeCatalogRoutes.js` |
| Handlingsplan (action plan) | PARTIAL | PDF + persistent notif built; POST questionnaire-edit not systemadmin-gated | `ActionPlanTab.vue`, `actionPlanRoutes.js:115-120` |
| Prövningar CRUD | PARTIAL | decision flow + import; no export, address not collectible, no payment | `ProvningarCrud.vue`, `examRoutes.js` |
| Slutprovskalender | PARTIAL | month view + colors + attendance; accommodations not on list; room not persisted; 9 rooms not 7 | `ExamCalendar.vue`, `EventModal.vue`, `examRooms.js` |
| Messaging | MATCH (in-app + email copy); no push | role RBAC; no tenancy; no push/notif badge | `MessagingView.vue`, `messagingService.js` |
| Chatbot | DIVERGED (FAQ+keyword, not true bot); no escalation/logging | — | `ChatbotView.vue`, `chatbotService*.js` |
| CourseCards (student learning) | PARTIAL | shared card + lessons + assignment submission; no hidden-module filter; no current-module | `CourseCards.vue`, `enrollmentService.js:161` |
| Course templates | MATCH | 5×2, delprov M3, case M5, clone | `CourseTemplates.vue`, `courseModuleSchema.js` |
| Schedule parameters | MATCH | teacher 5/10/20 params, auto-applied | `ScheduleParameters.vue` |
| Reports (activity) | PARTIAL | per-module ✓/✗ present but never populated; no "when set" column | `Reports.vue`, `learningController.js:338-464` |
| Learning management / participants | PARTIAL | list/add/remove; no "last active" column | `LearningManagement.vue` |
| APL loggbok | PARTIAL | CRUD built; no auto-issue at start; landing link broken | `LogbookTab.vue`, `aplRoutes.js:37-42` |
| Certificates / diploma | PARTIAL | study cert built; diploma not auto-sent; record workflow not mounted | `CertificateManager.vue`, `certificateRecordRoutes.js` |
| Question bank + exam generation | PARTIAL | bank built; generation UI orphaned/broken | `QuestionBank.vue`, `ExamGeneration.vue` |
| Analytics dashboard | MATCH | filters, revenue, forecast, distributions, export | `AnalyticsDashboard.vue` |
| Earning overview | MATCH | per-kommun per-course | `EarningsOverview.vue` |
| Inactivity report | MATCH | 5/14-day logic, warning/dropout actions | `InactivityReport.vue` |

**Conditional logic spot-checks (the half-implemented risk areas):**
- Kurs vs kurspaket branching: implemented but **kurspaket loses pace control** in wizard (flagged).
- Auto-date calc (end date, exam date, per-course scheduling): implemented and centralized (`slutprovDateCalculator.js`, `courseMatchingService.js`) — consistent.
- Color-coding (APL + exam teacher colors): implemented at display level; APL **persisted** transition not scheduled; exam room not persisted.
- Cascading avbrott/revidering → slutprov/APL → notifications: implemented for **teacher**; **student** is missing from the revidering cascade.

---

## Part 5 — Recommended additional features (commercial readiness, ~1,500 users)

### MUST-HAVE before commercial launch
1. **Personnummer + health/support data encryption at rest** — currently saved plaintext (`Student.js:8,84,95-100,172-183`), transmitted unmasked in many responses. Implement field-level encryption or tokenization (e.g. mongoose-field-encryption / a dedicated encryption service, or platform-managed encryption keys in Mongo). **GDPR/IMY-critical.**
2. **Automated backups + DR** — zero backup infra (no mongodump/cron/sidecar). Add scheduled, off-site, encrypt-at-rest backups with restore procedure. **CRITICAL.**
3. **Fix the multi-kommun/tenant isolation** — single global namespace; any admin can read/delete any municipality (`Student.js:46-77` only a field, no tenant scoping). If more than one customer/kommun is served, add tenant IDs + row-level scoping middleware; otherwise document single-operator model.
4. **Run the two "sent signed to the student" and auto-reminder gaps to completion** — (a) auto course-end grading reminder (scheduler job scanning `endDate`); (b) diploma auto-issue + signed email to student (mount `certificateRecordRoutes.js`/`certificateRoutes.js`); (c) **student notification** on revidering.
5. **Full-grade admin-notification + audit** — `GRADE_LOCKED` must be routed to admins; add **audit logging for grade create/update/lock/unlock** (`gradeRoutes.js` uses no `recordAudit`) and for student CRUD/auth events.
6. **Pagination + indexes on high-growth collections** — `Notification` has **no indexes** and `GET /notifications` returns unbounded rows (`notificationRoutes.js:131`); add indexes on `type/teacher/resolvedByUsers/meta.studentUserId/createdAt` and paginate; paginate submissions/pending endpoints.
7. **Email deliverability hardening** — `emailService` is fire-and-forget with no retry/queue/bounce/DKIM handling (`emailService.js:119-162`); add a queue with retry + bounce handling for time-sensitive auto-emails (inactivity, lärteamet, study-plan, grade reminders).
8. **CI/CD pipeline** — no `.github/workflows/`. Wire `make citest` into GitHub Actions on PR (types, lint, backend+frontend tests, e2e).

### SHOULD-HAVE
9. **Chatbot to validated retrieval + escalation + logging** (full plan in Part 3.4) — biggest spec-deviation and a core student-facing feature.
10. **True RBAC revocation enforcement** — JWT embeds roles/permissions for 7 days; re-validate against DB on protected writes (or shorten token / add revocation).
11. **Accessibility (WCAG) consistency** — ARIA usage is inconsistent across views; add automated a11y testing; ensure support-need-first design (extra time/computer/separate room are first-class).
12. **Mobile responsiveness/PWA** — no manifest/service-worker; add PWA (students/teachers checking on phones) and an optional **read-only push notification** channel (the spec's healthcare-style ask) that delivers "all info visible, cannot reply."
13. **Monitoring/alerting** — add Sentry + uptime/alerting on the scheduler jobs (grade reminders & inactivity emails are time-sensitive); today only in-memory counters.
14. **Retention/deletion policy + GDPR export** — physical `deleteMany({})` nuclear option on `/students` (`studentRoutes.js:905-919`); add right-to-be-forgotten + data-export endpoints and a retention policy.
15. **API documentation** — JSDoc exists but no Swagger/OpenAPI; add OpenAPI for Alvis import & Scrive e-signature integration consumers.

### NICE-TO-HAVE
16. **Alvis API auto-placement** (currently Excel-only) — spec explicitly asks whether Alvis data can be retrieved for auto-placement.
17. **Frågebank exam-generation UI** — wire the existing backend (`POST /generate-exam`) into a routed, working `ExamGeneration.vue`.
18. **Public prövning booking + online payment** — spec asks students to book and pay via the school website; today no public flow and no payment gateway.
19. **Automated grade-catalog generation for Scrive** (batch from grade data) rather than manual per-PDF upload.
20. **Auto-generated per-course grade-curve / export alignments & recommender-grade optional suggestions** — partially present; extend.
21. **Signature-template manager UI** for inactivity warning emails (today a single `EMAIL_SIGNATURE` env var — spec implies pre-saved templates).

---

## Cross-cutting defect list (from audit)
- `chatbotService.js:127` references unimported `StudentEnrollment` (ReferenceError in `courseInstanceId` path).
- `aplRoutes.js:37-42` reads fields (`color/period/workplace/supervisor/logbook/cvUrl`) absent from `AplRecord` → student landing Loggbok link never shows.
- `completedComponents` (`StudentEnrollment.js:155-156`) is only ever read, never written → per-module ✓/✗ reports always empty.
- `CertificateManager` workflow routers never mounted (`certificateRecordRoutes.js`/`certificateRoutes.js`) → its settings/templates/approve/generate cannot work.
- `ExamGeneration.vue` orphaned + wrong methods (GET generate-exam, missing save-exam) → broken.
- Action-plan questionnaire **POST** not systemadmin-gated (`actionPlanRoutes.js:115-120`) — any staff can wipe the form via direct API.
- `examRooms.js` defines 9 rooms (spec says 7); room selection `v-model` never submitted/persisted.
- Specped exam-accommodations UI missing in `RoleBasedAppointments.vue` (data/method present).
- Fixture: duplicate grading paths (`Student.education` legacy vs `StudentEnrollment`) — risk of divergence.
