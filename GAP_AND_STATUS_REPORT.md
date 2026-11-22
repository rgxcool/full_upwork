# Mindful Learning: Gap & Status Report

**Date:** 2026-11-22 · **Codebase:** `mindful-new` (repomix snapshot, 705 files) · **Specs:** Etapp_1.docx, Etapp_2.docx, Etapperna_lista.odt · **Tracker baseline:** MILESTONE-3-MASTER-TASK-STATUS.md

> **Method and limits.** This is a static audit. I read the source and specs and traced the code paths, but I did **not** run the test suites, the app or Docker (no `node_modules` and no network in this environment). Items marked ✅ in the master status doc are accepted as reported unless this audit re-checked them. Where my reading contradicts the tracker, that is called out. Every new finding has a file:line reference so it can be checked in minutes.

---

## 1. Bottom line

- **Etapp 1 is functionally complete.** All spec sections have working code: roles, search, the 6 profile tabs, placement wizard, avbrott/revidering, APL board, betyg + locking, handlingsplan, prövningar, slutprov calendar, statistics. What remains is **security hardening** that was already known (field projection, `/uploads` IDOR, messaging isolation) plus small parity and UX items.
- **Etapp 2's lärplattform has real gaps.** The tracker marks it ✅, but the kurskort content pipeline (CourseCardBuilder → CourseTemplates → CourseInstance content) has **5 bugs** that the unit tests miss. The tests mock data shapes that production never produces. The worst one: **modules marked hidden are still shown to students**, and any student can read any kurskort's content.
- **The production Docker image probably cannot render PDFs**, so automatic diplomas and intyg would fail silently each night. Check this before anyone promises diplomas.
- **Five of the "Phase 2" items are not on the agreed Etapp list** (Etapperna_lista.odt): the AI chatbot, SMS, personalised APL kits, automatic diplomas and the question bank. Some of them are already partly built. They should be quoted separately, with the risks below written into the quote.

| Bucket | Issues | Base h | **Buffered h (×2.2)** |
|---|---:|---:|---:|
| Bugs (new findings) | 12 | 36.5 | **80.3** |
| Phase 1 wrap-up (carry-over + hardening) | 12 | 94 | **206.8** |
| Phase 2 in-scope features / spec alignment | 4 | 30 | **66.0** |
| **Subtotal: inside agreed scope** | **28** | **160.5** | **353.1** |
| High-risk Phase 2: quote separately (chatbot, SMS, push, APL kits, diplomas, question bank) | 6 | 144 | **316.8** |
| Integrations: quote separately (prövning payment, Scrive, Alvis) | 3 | 96 | **211.2** |
| **Total** | **37** | **400.5** | **881.1** |

**Go-live blockers (P0):** 7 issues, **110 h buffered**: BUG-01, BUG-02, BUG-03, BUG-10, P1-01, P1-02, P1-03.

---

## 2. Scope baseline: what was actually agreed

`Etapperna_lista.odt` is the short contractual list. The Etapp 1/2 docs are the long wish-list. Comparing them:

| Spec item (Etapp_2.docx) | On Etapperna_lista? | Treatment |
|---|---|---|
| Sollentuna lärteamet email, Mejl/Chatt + email copy, Lärplattform (modules/sections, feedback, dialog), Datumplanering 5/10/20, Rapporter & aktivitet, inactivity warnings | ✅ Yes | In scope: bugs and gaps fixed under the current agreement |
| Kurskort first page / anslagstavla, Deltagare "last active", Innehåll hide | Implied by "Lärplattformen (Kurssidor)" | In scope |
| **Chattbot** | ❌ No | **Quote separately** (Q-01) |
| **Mobile one-way messages (SMS / push)** | ❌ No ("Går det att…?" in spec) | **Quote separately** (Q-02, Q-03) |
| **APL loggbok / personalised kits** | ❌ No | **Quote separately** (Q-04) |
| **Intyg: studieintyg + diplom** | ❌ No | **Quote separately** (Q-05). Studieintyg already works. |
| **Prover och uppgifter (question bank)** | ❌ No ("plattformen tar fram nya prover?") | **Quote separately** (Q-06) |
| Etapp 1: prövning web booking + payment, Scrive, Alvis import | Not on the Etapp 1 list | **Quote separately** (Q-07…Q-09) |

---

## 3. Implemented and tested

Condensed from the master doc, with a column for what this audit re-checked in code.

| Area | Status | Tests cited | Re-checked in this audit |
|---|---|---|---|
| 7 roles, RBAC, live revocation (P1), privilege-escalation fixes | ✅ | authorization + revocation suites | Route guards and the systemadmin → admin implication in the frontend guard |
| Search (3 chars, date, teacher, course) | ✅ (name split 🟡) | — | — |
| Profile tabs 1–6, cross-linking | ✅ | E2E admin portal | — |
| Placement wizard, kurs/kurspaket, pace 100/50/25, Upplands Bro rule | ✅ | placementRoutes, courseMatchingService | Template lookup at admission (see BUG-05) |
| Avbrott cascade, revidering (teacher + student), inaktiva elever | ✅ | — | — |
| APL board 6 colours, auto-RED, CV/contract, Tab 2/3 | ✅ | aplController (1 file-level failure) | Daily auto-transition wired in scheduler.js |
| Betyg A–F + mandatory motivation, NP scores, yearly scale, lock/unlock, admin notice | ✅ | gradeRoutes 63/63 | — |
| Handlingsplan (F trigger, editable form, PDF) | ✅ | — | — |
| Prövningar (intake, teacher decisions, SVE/SVA gating, CSV in/out) | ✅ | examRoutes 68/68 | — |
| Slutprov calendar (month, colours, attendance, accommodations, rooms) | ✅ | E2E | — |
| Statistics: revenue/kommun, forecast, students, dropouts, grade curves | ✅ **except Stockholm = 0 kr** | — | Pricing tables (BUG-08) |
| Sollentuna email, messaging + email copy | ✅ (tenant isolation 🔴) | — | — |
| Kursmall 5×2 + duplicate (backend), auto kurskort at admission | ✅ backend · **🟡 frontend** | courseTemplate suites | **BUG-05** |
| Datumplanering from teacher parameters | ✅ at creation · **🟡 lost on save** | — | **BUG-04** |
| Innehåll: hide modules | **⚠️ Marked ✅, but broken for real data** | Tests pass on a non-production Map shape | **BUG-01** |
| Övningsuppgifter: return + threaded discussion | ✅ | E2E 8/8 | — |
| Rapporter ✓/✗ + planned date, Deltagare last active | ✅ | — | — |
| Inactivity scanner (5-day / 14-day) | ✅ built · **not in tracker** (item 54 blank) · deviates from spec | — | **E2-04** |
| Studieintyg on demand | ✅ | — | — |
| Automatic diplomas | ✅ in code · **⚠️ production PDF risk** | — | **BUG-10** |
| Question bank → generate exams | ✅ | questionBank 52/52, E2E | — |
| CI (lint + test + docker) | ✅ ci.yml · coverage 68 % < 78.5 % gate | — | **BUG-09**: deploy.yml never runs |

---

## 4. Incomplete or buggy: new findings

### 4.1 Kurskort content pipeline (CourseCardBuilder / CourseTemplates / courseInstances)

The content model is split in two. Module-level title, instructions and hidden flag sit in `CourseInstance.content` (a Map). Sections, lesson text and dates sit in `CourseInstance.modules[]`. Every reader and writer handles this split a little differently, which is where these bugs come from:

| ID | Finding | Evidence | Impact |
|---|---|---|---|
| **BUG-01** 🔴 | **Hidden modules are not hidden.** The writer stores string keys (`"2"`); `buildVisibleModules` reads `content.get(Number(...))`, which is never found on a MongooseMap. Even on a match it spreads `...module`, so `sections[]` lesson text and the assignment still reach the student. The unit tests build `new Map([[2, …]])` with number keys, so they pass. | `courseMatchingController.js:2867`, `courseContentVisibility.js:11`, `enrollmentService.test.js:329` | Unreleased content (incl. delprov / case) is visible to students. The tracker's "fixed since original audit" claim for item 61 does not hold for real data. |
| **BUG-03** 🔴 | `GET /course-instances/:id/content` lets **any** student in, with no enrollment check. `GET …/activity-feed` has no check beyond login. | `courseMatchingController.js:2745, 2972`; routes `courseMatchingRoutes.js:194-226` | Students can read any course, at any kommun. |
| **BUG-02** 🔴 | Anslagstavla post check compares `responsibleTeacher` (a **Teacher** `_id`) with `user.userId` (a **User** `_id`), so it always fails. No tests cover this. | `courseMatchingController.js:3034`, `CourseInstance.js:57` | Teachers can't write welcome/slutprov info, which is the main use of the noticeboard. AUDIT_REPORT.md flagged this; it is still open. |
| **BUG-04** 🟠 | Saving in the builder replaces `modules[]` from the payload and drops `startDate/endDate`. | `courseMatchingController.js:2884` | Datumplanering is silently lost; Rapporter "Planerat datum" falls back to index-based `sectionDates`. |
| **BUG-05** 🟠 | "Save as template" always POSTs (no update path), so every edit makes a duplicate. No `courseId` is sent, but admission finds templates **only** by `courseId`, so builder-made templates are never auto-applied. Hidden flags are dropped. The CourseTemplates list has no duplicate button or course link, although the backend supports both. | `CourseCardBuilder.vue:1184`, `courseMatchingService.js:201`, `CourseTemplate.js` | The spec's key automation ("kurskort automatically from templates") works only for templates created through the API with a courseId. |
| **E2-02** (feature) | Templates are cloned once at admission. Template fixes never reach running kurskort, and there is no "apply template" action. | `courseMatchingService.js:300-305` | Admins have to edit every running card by hand. |

### 4.2 Other bugs

| ID | Finding | Evidence |
|---|---|---|
| **BUG-06** /profile | Reported error. No static root cause found. The page calls `GET /api/task` and `GET /api/documents/shared` on mount and toasts on any failure. Needs a per-role repro with the network log. | `ProfilePage.vue:256`, `documentRoutes.js:710`, `taskRoutes.js:20` |
| **BUG-10** 🔴 Docker/PDF | Production image is `node:25-alpine`, but node_modules come from a `bookworm` (glibc) stage. Puppeteer's Chrome is glibc-only, cached under `/root`, and no system Chromium is installed. The same libc mismatch applies to native `bcrypt`. | `Dockerfile:5, 91`; `certificatePdf.js:143` |
| **BUG-07** chatbot | Indexes `module.instructions`, which is not a schema field (text lives in `sections[]`), so retrieval mostly sees titles. It also ignores hidden flags. | `chatbotService.impl.js:196-206` |
| **BUG-08** Stockholm | No price row in either pricing table → revenue 0 kr (AUDIT_REPORT finding 7, still open). | `utils/municipalityPricing.js` (both) |
| **BUG-09** CI | `github/workflows/deploy.yml` is outside `.github/`, so it never runs. | repo root |
| **BUG-11** APL kits | The `created` counter reads stale in-memory data (always 0). Idempotency is by title string. | `aplService.js:165-175` |
| **BUG-12** tests | The 3 known failing backend tests keep the baseline red. | master doc |

### 4.3 Architecture risks found on the way

- **Scheduler** (P1-11): every nightly job runs on an in-process `setTimeout`. A second replica would double-run inactivity emails and diplomas wherever idempotency is check-then-write.
- **Two pricing tables** (frontend + backend) will drift again. Merge them as part of BUG-08.
- **Repo hygiene** (P1-12): about 50 scratch scripts (`fix_b4_v4.cjs`, `test_filter5.cjs`…) and 10+ overlapping audit reports in the repo root.

---

## 5. Carry-over open items from the master status doc

All are filed as `phase-1-wrapup` issues: P15 field projection (P1-01), P17 messaging isolation (P1-02), `/uploads` IDOR (P1-03), document metadata scope (P1-04), name split (P1-05), fine-grained grants (P1-06), coverage gate (P1-07), wizard APL parity (P1-08), wizard date preview/override (P1-09), product decisions on APL tab / rooms / contract upload (P1-10), noticeboard vs feed (E2-01).

**Tracker corrections:** item 61 (hide modules) should go back to 🔴. Item 54 is blank, and the inactivity automation has no row. Section D is missing from the numbering. Add an "E2E verified in production image" column, because several ✅ rows were verified only in unit tests or dev mode.

---

## 6. High-risk Phase 2: quote separately

| ID | Item | What exists today | Main risks | Decision needed from client | **Buffered h** |
|---|---|---|---|---|---:|
| **Q-01** | AI chatbot | Keyword retrieval + optional OpenAI `gpt-4o-mini`, falls back to knowledge-base-only | **GDPR**: student questions go to a US provider (needs a DPA or an EU-hosted model). Unbounded cost (only a global IP rate limit). Weak retrieval (BUG-07). Hidden-content leakage. Answer quality is unmeasured. | Provider + DPA; acceptable monthly cost; who curates the FAQ | **88** |
| **Q-02** | One-way SMS | Nothing (vendor notes only) | Per-message cost, consent/opt-in, phone-number quality, sender-ID registration, personal data in SMS text | Vendor (46elks / Sinch / Twilio), budget | **52.8** |
| **Q-03** | Read-only push (PWA) | Nothing | iOS needs home-screen install (16.4+); service-worker caching bugs | Push instead of, or alongside, SMS? | **44** |
| **Q-04** | Personalised APL kits | One generic "APL-lärkit" per student on the APL start date | The spec wants kits *instead of* shared kurskort: new content model, coordinator authoring, activity colour codes | Kit templates per programme? Who authors them? | **52.8** |
| **Q-05** | Automatic diplomas | Nightly scan, PDF with uploaded PNG signature, email + retry | **Production PDF rendering (BUG-10)**. The image is not an e-signature. Silent auto-send of a legal document with no approval step. The flow differs from the spec (notification + button). | Auto-send vs student button vs admin approval; Scrive/BankID add-on? | **35.2** |
| **Q-06** | Question bank v2 | Create/filter/generate/save works (E2E green) | Rule-based generation, no-repeat for retakes, PDF exam + key, answer leakage via the student question-bank view | Is a printed exam the goal, or on-platform exams? | **44** |
| | **Subtotal (the five named items + push)** | | | | **316.8** |
| Q-07 | Prövning web booking + payment | Login-gated form, admin-only POST | Payments, refunds, public form abuse | Swish Handel / Stripe / Klarna | 88 |
| Q-08 | Scrive catalog automation | Manual upload per PDF | API credentials, signing-status sync | Scrive API key | 52.8 |
| Q-09 | Alvis integration | Excel import only | API access may not exist; matching errors | Alvis contract/API | 70.4 |

**Quoting guidance:** quote Q-01…Q-06 as fixed-scope add-ons. Each issue body carries acceptance criteria and a hidden-work checklist, so the quote can reference the issue. Q-05 cannot be accepted until BUG-10 is fixed, whichever way it is quoted.

---

## 7. Recommended order

1. **Week 1 (P0 bugs, about 31 h buffered):** BUG-01, BUG-03, BUG-02, BUG-10. Each is small, and each is either a data leak or a broken headline feature.
2. **Weeks 2–4 (P0 hardening, about 79 h):** P1-01, P1-02, P1-03.
3. **Then:** BUG-04/05 + E2-02 (one coherent kurskort content refactor), BUG-06 repro, BUG-08/09, E2-04 decision, coverage push (P1-07) alongside.
4. **In parallel (sales):** send quotes for Q-01…Q-06 with the decisions in §6 listed as preconditions.

---

## Appendix: full issue list (as created by `populate_github_project.sh`)

| ID | Title | Etapp | Prio | Base h | Buffered h |
|---|---|---|---|---:|---:|
| BUG-01 | Hidden course-card modules are still shown to students | etapp-2 | P0 | 5 | **11** |
| BUG-02 | Responsible teacher gets 403 when posting on the kurskort anslagstavla | etapp-2 | P0 | 2 | **4.4** |
| BUG-03 | Any student can read any kurskort's content and activity feed (IDOR) | etapp-2 | P0 | 3 | **6.6** |
| BUG-04 | Saving a kurskort in CourseCardBuilder wipes the per-module date plan | etapp-2 | P1 | 3 | **6.6** |
| BUG-05 | Kursmallar saved from the builder never auto-apply, and every save creates a duplicate | etapp-2 | P1 | 6 | **13.2** |
| BUG-06 | /profile (Min profil) shows an error | etapp-1 | P1 | 3 | **6.6** |
| BUG-07 | Chatbot retrieval misses lesson text and ignores hidden modules | etapp-2 | P1 | 4 | **8.8** |
| BUG-08 | Revenue is 0 for Stockholm (no price entry) | etapp-1 | P1 | 1.5 | **3.3** |
| BUG-09 | deploy.yml is in github/ instead of .github/ and never runs | etapp-1 | P1 | 1 | **2.2** |
| BUG-10 | PDF generation (diplom, intyg) likely fails in the production Docker image | etapp-2 | P0 | 4 | **8.8** |
| BUG-11 | APL kit scan always reports 0 created; idempotency depends on the kit title | etapp-2 | P2 | 1 | **2.2** |
| BUG-12 | Fix the 3 known failing backend tests | etapp-1 | P2 | 3 | **6.6** |
| P1-01 | Per-role field projection on student endpoints | etapp-1 | P0 | 12 | **26.4** |
| P1-02 | Messaging tenant isolation (Mejl/Chatt) | etapp-2 | P0 | 10 | **22** |
| P1-03 | Move /uploads off public disk storage | etapp-1 | P0 | 14 | **30.8** |
| P1-04 | Tenant scope on GET /documents/:id metadata | etapp-1 | P1 | 3 | **6.6** |
| P1-05 | Search students by first / middle / last name | etapp-1 | P2 | 8 | **17.6** |
| P1-06 | Fine-grained per-user permission grants | etapp-1 | P2 | 16 | **35.2** |
| P1-07 | Raise backend coverage to the 78.5 % gate | etapp-1 | P1 | 16 | **35.2** |
| P1-08 | Placement wizard parity: APL 'completed elsewhere' | etapp-1 | P2 | 4 | **8.8** |
| P1-09 | Placement wizard: end-date preview + exam-date override | etapp-1 | P2 | 3 | **6.6** |
| P1-10 | Product decisions: APL tab, rooms 7 vs 9, contract upload | etapp-1 | P2 | 1 | **2.2** |
| P1-11 | Background jobs: multi-instance safe scheduler | etapp-1 | P1 | 5 | **11** |
| P1-12 | Repo hygiene: remove root scratch scripts | etapp-1 | P2 | 2 | **4.4** |
| E2-01 | Kurskort: separate anslagstavla from activity feed | etapp-2 | P1 | 8 | **17.6** |
| E2-02 | Push kursmall changes to existing kurskort | etapp-2 | P1 | 12 | **26.4** |
| E2-03 | Innehåll: hide individual sections | etapp-2 | P2 | 6 | **13.2** |
| E2-04 | Inactivity automation: admin choice (spec alignment) | etapp-2 | P1 | 4 | **8.8** |
| Q-01 | [Quote] AI chatbot — production readiness | etapp-2 | P1 | 40 | **88** |
| Q-02 | [Quote] One-way SMS notifications | etapp-2 | P2 | 24 | **52.8** |
| Q-03 | [Quote] Read-only mobile push (PWA) | etapp-2 | P2 | 20 | **44** |
| Q-04 | [Quote] Personalised APL kits | etapp-2 | P1 | 24 | **52.8** |
| Q-05 | [Quote] Automatic diplomas — hardening and signing | etapp-2 | P1 | 16 | **35.2** |
| Q-06 | [Quote] Question bank → exam generation v2 | etapp-2 | P2 | 20 | **44** |
| Q-07 | [Quote] Public prövning booking + payment | etapp-1 | P2 | 40 | **88** |
| Q-08 | [Quote] Scrive grade catalog automation | etapp-1 | P2 | 24 | **52.8** |
| Q-09 | [Quote] Alvis integration | etapp-1 | P2 | 32 | **70.4** |
