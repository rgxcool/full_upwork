# Demo runbook — kurskort, kursinstanser, inskrivning

## 0. Before the demo (≈5 min before)

```bash
DEMO=1 bash launch.sh
```

Re-run this right before the demo: it **resets the database** to a clean demo state
(any placements made during rehearsal are wiped). All dates are relative to today.

| Role    | Email              | Password    |
|---------|--------------------|-------------|
| Admin   | admin@mindful.se   | Admin123!   |
| Lärare  | teacher@mindful.se | Teacher123! |
| Elev    | student@mindful.se | Student123! |

Use separate browser profiles / incognito windows per role so you can switch instantly.

> ⚠️ Do **not** demo with `data/test_mindful.xlsx` — it contains real people's
> names, personnummer and contact details.

## What the demo data contains

- **Ongoing** "Svenska som andraspråk 1" (`SVASVE01yymm`): started Monday 3 weeks ago,
  5 weeks long, teacher Eva Nahi, 3 students (Anna, Berta, Calle) on **one shared kurskort**,
  2 anslagstavla posts.
- **Upcoming** "Matematik 1a" starting in 2 weeks, Doris admitted.
- Older/past instances (grading, certificates, APL) from the e2e seed.
- Every kurskort has content (5 modules, delprov in module 3, case in module 5).
- Mall-bank: templates for Svenska som andraspråk 1 and Matematik 1a.
- Full GY25 course catalog (84 courses + packages).

## 1. Admin — Kursinstanser (`/course-instances`)

1. Show KPIs and the instance list (start/slut/slutprov, antal inskrivna, ansvarig lärare).
2. Click 👁 on the ongoing Svenska instance → enrollments with status, **senaste inloggning**, betyg.
3. "Skapa ny instans" → show the form (huvudkurs, kurslängd, auto slutprov, ansvarig lärare).

## 2. Inskrivning — the money shot (lärare AND admin)

Spec: *"Om 4 elever läser en kurs på samma start och slutdatum kopplas samtliga till en och samma kurskort."*

1. Log in as **Lärare** → search **Doris Dahl** → tab **Studieplan** → **+ Placera kurs**.
2. *Enskild kurs* → search `SVASVE01` → **Startdatum = Monday 3 weeks ago**
   (the ongoing instance's start date, see Kursinstanser) → Nästa… → **Bekräfta placering**.
3. Go to Kursinstanser / Kurser: the ongoing instance now has **4 students** — Doris joined the
   existing shared kurskort, no duplicate was created.
4. As **Admin**, place Doris on a catalog course without a mall (e.g. search "Administration")
   → a **new** instance + kurskort is created automatically; it has no content because the course
   has no mall → segue into the Kurskortsbyggare.
5. Optional: *Kurspaket* placement shows studietakt 100/50/25 %.

## 3. Kurskort

- **Admin/Lärare** `/course-cards/overview` ("Alla kurskort"): sorted by nearest end date,
  "Öppna kurskortet" → modules, sections, inlämningsuppgift, trådar, Föregående/Nästa.
- **Kurskortsbyggare** `/admin/course-card-builder`: build modules, colour blocks, video, files;
  save/load templates in the mall-bank.
- **Mall-bank** `/course-templates`.
- **Aktivitetsflöde/anslagstavla** `/admin/activity-feed`: post a message on the ongoing instance.
- **Elev** `/course-cards` ("Mina kurser"): period, status, aktuell modul, framsteg,
  anslagstavla, kursupplägg, diplom button.

## 4. Audit trail / reports (if time)

- Grade change audit + lock notifications, inactivity report (`/admin/inactivity`),
  course statistics (`/admin/course-statistics`).

## Known limits — avoid clicking these live

- Teachers do **not** have the admin pages Kursinstanser / Student Inskrivningar / Kursmatchning
  (→ "Access Denied"); teachers enroll via the student's **Studieplan → Placera kurs**.
- A kurskort for a course without a mall opens in the builder ("Redigera innehåll") instead of the card view.
- Per-role field minimization (personnummer hidden from some staff) and messaging tenant isolation
  are documented as not done (see MILESTONE-3-MASTER-TASK-STATUS.md P15/P17).
