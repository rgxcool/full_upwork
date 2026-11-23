# backend/scripts

One-off and dev helper scripts. Run them from `backend/`. Unless noted otherwise they
use `backend/.env.development` (the local database `mongodb://localhost:27017/mindfullearning`).

## First run (used by `launch.sh`, never deletes)

| Script | What it does |
|---|---|
| `ensureBaseData.js` | Creates one admin, systemadmin, SYV and specped account for each role that has none (`<role>@example.se`). `--is-empty catalog\|faq` tells `launch.sh` whether to import the catalog / FAQ. `DRY_RUN=1`. |

## Migrations (#126)

| Script | What it does |
|---|---|
| `migrate.js` | Applies pending migrations from `backend/migrations/` and records them in the `migrations` collection; `status` lists applied/pending; `DRY_RUN=1`. `deploy.sh` runs it on every deploy. |

## Accounts

| Script | What it does |
|---|---|
| `createTeacher.js` | Creates or repairs a teacher login (default `test.larare@example.se` / `Larare123!`). Safe to re-run; `--email`, `--name`, `--password`, `--subject`; `DRY_RUN=1`. Refuses non-local databases. |
| `createUser.js` | Interactive: asks for name, email, password and roles (any role). |
| `createSystemAdmin.js` | Creates a systemadmin. Uses `.env.production`, see the main README (production setup). |
| `generateBcryptPassword.js` | Prints the bcrypt hash of a password. No database access. |

## Data

| Script | What it does |
|---|---|
| `updateEducation.js` | Imports programs, courses and course packages from an Excel workbook (default `data/Kurser och kurspaket GY25.xlsx`). |
| `importStudents.js` | Imports students from an Excel workbook. |
| `anonymizeStudentWorkbook.js` | Makes a dummy copy of a student workbook: fake names, personnummer (`1900…`), phones, emails and ÖVRIGT notes; keeps dates, course, kommun and teacher. Never prints cell values. |
| `seedE2EData.js` | **Wipes all users and course data**, then seeds the Playwright/demo accounts (`teacher@mindful.se` / `Teacher123!` etc.). Run it before `cd e2e && pnpm test`. |
| `seedPersianDemo.js` | **Demo cast, only adds data:** Professor Cyrus (purple) and Magister Xerxes (assistant teacher, shared document) with 26 Persian kings as students on SVEA1000X/ENGE1000X (ongoing) and MATE1A00X (ended): active, no courses (6), ready to grade (3), avbrott (2), warned for inactivity (2); one "Persepolis-mall" per course. Instance dates match the placement wizard, so placing a king with the same start and length joins the shared kurskort. Walkthrough: `DEMOKING.md`. Re-running replaces only its own data. Password `Persepolis123!`. Needs the GY25 catalog. |
| `seedDemoData.js` | Extra demo data on top of `seedE2EData.js`. Use `resetDemo.sh`. |
| `resetDemo.sh --yes` | **Wipes the local database**, then seeds everything in `DEMO_RUNBOOK.md` (e2e seed, GY25 catalog, FAQ, demo kurskort). |
| `seedMindfulFaq.js` | Upserts the chatbot FAQ. Safe to re-run. |
| `syncCalendarEvents.js` | Rebuilds slutprov calendar events from enrollments (`--enrollment <id>` for one). |
| `dbcheck.mjs` | Prints document counts per collection (read-only). |

## Resetting the local database

All three refuse non-local databases, support `DRY_RUN=1`, and are tested in `tests/integration/dbReset.test.js`.

| Script | What it does |
|---|---|
| `flushAllButAdmins.js --yes` | Clears people and activity data; keeps admins and the education catalog. |
| `dropData.js --yes` | Wipes everything, admins included. |
| `dropEducation.js` | Clears programs, courses and course packages before a re-import. |

## Other

| Script | What it does |
|---|---|
| `sync_audit_issues.sh` | Syncs audit findings to GitHub issues (`DRY_RUN=1` supported). |
