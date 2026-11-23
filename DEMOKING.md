# DEMOKING — the Persian court demo, play by play

A scripted demo with fake data only: **Professor Cyrus** (teacher, purple), his assistant
**Magister Xerxes**, and 26 Persian kings as students. Every step below was clicked through
in the real app on 2026-11-22. Button names are written exactly as they appear on screen.

> Never demo with `data/test_mindful_CLEAN.xlsx` (real people). `data/test_mindful.xlsx` is
> the dummy copy and is safe to show.

---

## 0. Setup (the evening before, ~10 min)

Run everything from the repo root (`/home/cyrus/mindful-new`).

```bash
bash launch.sh                                   # starts Mongo, backend :5010, frontend :5173; never deletes data
cd backend && node scripts/seedPersianDemo.js    # the Persian court (re-runnable, see §8)
```

`seedPersianDemo.js` needs the GY25 course catalogue, which `launch.sh` imports on an empty
database. It only adds its own data: re-running it replaces the previous Persian court and
anything you created *with* Cyrus/Xerxes or a Persepolis-mall during a rehearsal, nothing else.

**Re-run the seed on demo day.** The active kings show "logged in yesterday"; after ~5 days
the inactivity rules start flagging them.

**Warm up the pages once before the client joins.** In local dev, Vite compiles each page on
its first visit, so the first open of a student profile can take ~15–20 s (second open: <1 s).
Open each page in §2–§7 once while logged in as admin and as Cyrus.

Use one browser profile / incognito window per role so you can switch instantly.

### Logins

| Who | E-post | Lösenord |
|---|---|---|
| Admin | `admin@example.se` | `Admin123!` |
| Professor Cyrus (lärare, lila) | `professor.cyrus@example.se` | `Persepolis123!` |
| Magister Xerxes (lärare / assisterande) | `magister.xerxes@example.se` | `Persepolis123!` |
| Any king, e.g. Kyros | `kyros.akemenid@example.se` | `Persepolis123!` |

(`admin@example.se` is created by `launch.sh` if no admin exists. After `resetDemo.sh` the
admin is `admin@mindful.se` / `Admin123!` instead.)

### The cast

| Group | Kings | Use them for |
|---|---|---|
| Active (13) | Kyros, Kambyses, Artaxerxes, Arsakes, Fraates, Artabanos, Ardashir, Bahram Gur, Khosrow Anushirvan, Yazdegerd, Ismail, Nader, Agha Mohammad — each on one or both ongoing courses | Kurskort with real students |
| **No courses (6)** | **Arses**, **Vologases**, **Hormizd** (KCNO), **Abbas**, **Karim Zand**, **Naser al-Din** | Placing on a course / kurspaket |
| Ready to grade (3) | Dareios, Mithridates, Shapur | Betyg |
| Avbrott (2) | Bardiya, Peroz | Avbrott already registered |
| Warned (2) | Kodomannos, Kavad | Inaktivitetsrapport |

### The courses (real GY25 catalogue courses)

| Kurskort | Dates | Ansvarig | Assisterande | Built from mall |
|---|---|---|---|---|
| SVENSKA SOM ANDRASPRÅK NIVÅ 1 (SVEA1000X) | Monday 3 weeks ago → +10 weeks | Professor Cyrus | Magister Xerxes | Persepolis-mall: Svenska som andraspråk 1 |
| ENGELSKA NIVÅ 1 (ENGE1000X) | Monday 2 weeks ago → +10 weeks | Magister Xerxes | Professor Cyrus | Persepolis-mall: Engelska 1 |
| MATEMATIK NIVÅ 1A (MATE1A00X) | ended 2 weeks ago | Professor Cyrus | — | (none) |

There is also an unused **Persepolis-mall: Matematik 1A** for creating a new instance live (Act 2).

To see the exact dates: Admin → menu **Kursinstanser** → the SVEA1000X row with
"Professor Cyrus" (columns Startdatum / Slutdatum / Slutprov). Write the SVEA **Startdatum**
down — you need it in Act 3.

---

## Act 1 — Kursinstanser: the admin's overview (admin, 3 min)

1. Menu **Kursinstanser** (`/course-instances`). Show the KPI tiles (Totalt antal instanser,
   Aktiva instanser, Totalt antal inskrivningar) and the table: Kursnamn, Kurskod, Startdatum,
   Slutdatum, Slutprov, Inskrivningar, Ansvarig lärare.
2. On the SVEA1000X row (Ansvarig lärare: Professor Cyrus), click **Visa inskrivningar** next
   to the count → the kings on the shared kurskort, with status.
3. **Lägg till student** on the same row → search `Vologases` → pick him → **Spara**.
   He is now enrolled on Cyrus's kurskort (toast: "1 student(er) tillagd(e) till kursinstansen!").

## Act 2 — A new kurskort from a mall, with an assistant teacher (admin, 3 min)

1. **Kursinstanser** → **Skapa ny instans**.
2. **Huvudkurs**: `MATEMATIK NIVÅ 1A (MATE1A00X)`.
3. **Kursmall (kopierar moduler)**: the list now only shows mallar for the chosen course →
   `Persepolis-mall: Matematik 1A`.
4. **Startdatum**: next Monday. **Kurslängd**: `10 veckor` → Slutdatum fills in by itself.
5. **Ansvarig lärare**: `Professor Cyrus` → click **+** next to it →
   **Assisterande lärare**: `Magister Xerxes`.
6. **Skapa**. The new instance appears with 5 modules copied from the mall (open it via
   Kurskort, Act 4).

Talking point: one mall → many instances; the mall bank lives in **Kursmallar** (`/course-templates`).

## Act 3 — Placing a king on a course: the shared kurskort (admin or Cyrus, 4 min)

Spec: *students with the same course and the same start/end date share one kurskort.*

1. Search box (top) → type `Arses` → open **Arses Akemenid**.
2. Tab **Studieplan** → "Ingen utbildning registrerad" → **+ Placera kurs**.
3. **Enskild kurs** → **Nästa** → search `SVEA1000X` → pick
   `SVENSKA SOM ANDRASPRÅK NIVÅ 1` → **Nästa**.
4. **Startdatum** = the SVEA start date from Kursinstanser (Monday 3 weeks ago).
   **Kurslängd** = `10 veckor (50%)` → Beräknade datum match the kurskort → **Nästa**.
5. **Elev** step shows his details → **Nästa**. **Tenta**: På plats, Kommun Sollentuna → **Nästa**.
6. **Förhandsgranskning**: Start, Slut and **Slutprov** (the Wednesday before the end — editable) →
   **Nästa** → **Bekräfta placering**.
7. Back in **Kursinstanser**: the SVEA1000X row has one more student — Arses joined Cyrus's
   kurskort, no duplicate kurskort was created, and Professor Cyrus is still Ansvarig lärare.

Variant (kurspaket): open **Hormizd Sasanid** (kommun KCNO) → **+ Placera kurs** →
**Kurspaket** → pick a package → choose studietakt 100/50/25 % → the Tenta step offers KCNO.

## Act 4 — Kurskort: what teachers and students see (Cyrus + a king, 4 min)

1. As **Professor Cyrus**: menu **Kurskort** (`/course-cards/overview`), sorted by nearest end
   date. Filter with **Filtrera kurskort** → `SVEA`. Cyrus can open his own cards; colleagues'
   cards show **Redigera** greyed out.
2. **Öppna kurskortet** on SVEA1000X → modules, sections, "Inlämningsuppgift 1 – Reflektion",
   the anslagstavla with Cyrus's two posts ("Välkomna…", "Påminnelse…").
3. On a card without content the button says **Redigera** → opens the **Kurskortsbyggare**
   (`/admin/course-card-builder`): build modules, **Välj mall från mall-banken**, **Spara som mall**.
4. As **Kyros** (student): **Mina kurser** (`/course-cards`) → his kurskort, current module,
   progress, anslagstavla.

## Act 5 — Shared documents and the assistant teacher (Cyrus → Xerxes, 3 min)

1. As **Professor Cyrus**: **Min profil** (top right) → **Mitt filarkiv** → his own staff
   profile opens on the **Filarkiv** tab.
2. Under **Lärardokument**: "Betygsunderlag SVEA1000X.txt" — **Delad med 1 användare**.
3. Show sharing live: upload any file under **Lärardokument** (**Choose File** → **Ladda upp**)
   → **Dela** → type `magister.xerxes@example.se` → **Spara**.
4. As **Magister Xerxes**: **Min profil** → **Delade dokument** → both files, "delat av Professor Cyrus".
   A student cannot open them (the file link returns 403 for students).
5. Assistant role: Xerxes is **Assisterande lärare** on Cyrus's SVEA kurskort (Kursinstanser →
   **Redigera** on that row shows it) and Ansvarig on ENGE1000X, where Cyrus assists.

## Act 6 — Betyg: kings ready to grade (Cyrus, 3 min)

1. As **Professor Cyrus**: menu **Betyg** (`/betyg`).
2. **Kurs**: `MATEMATIK NIVÅ 1A (MATE1A00X)` → **Batch / Omgång**: the batch that ended 2 weeks ago.
3. Dareios, Mithridates and Shapur — each **once** (no duplicate rows) — no grade yet.
   Set a grade (and NP-poäng if you like) → **Spara alla ändringar**.
4. Talking point: Shapur's own teacher is Xerxes, but Cyrus sees him because Cyrus is
   responsible for the Matematik kurskort.

## Act 7 — Avbrott and inactivity (admin, 3 min)

1. Menu **Inaktivitetsrapport** (`/admin/inactivity`): **Kodomannos Akemenid** and
   **Kavad Sasanid** with "Varning skickad <date>", Senast inloggning "16 dagar", buttons
   **Diskutera** / **Avsluta**. Filter buttons **Alla / Avbrott / Varning**.
   (Status shows "Avbrott" because 16 days without login is past the 5-day withdrawal rule —
   the warning already went out, so the admin decides with **Avsluta**.)
2. Avbrott by hand: open **Karim Zand** (or any active king) → tab **Allmänt** → section
   **Status** → tick **Markera som avbrott** → dialog "Markera som avbrott?" → **Bekräfta**.
   All his enrollments become dropped and his teacher gets a notification. Untick to undo
   ("Ta bort avbrott-status?").
3. Already done: **Bardiya** and **Peroz** are registered avbrott.

> Don't click **Kör inaktivitets-skanning** in the local demo: it sends real warning emails to
> every inactive student in the database (not only the kings).

---

## 8. Seeding and resetting — cheat sheet

| I want to… | Command (from `backend/`) | Deletes? |
|---|---|---|
| (Re)create the Persian court | `node scripts/seedPersianDemo.js` | Only its own previous data |
| Preview what the seed would do | `DRY_RUN=1 node scripts/seedPersianDemo.js` | No |
| One extra teacher login | `node scripts/createTeacher.js --email x@example.se --name "…"` | No |
| Admin/systemadmin/SYV/specped if missing | `node scripts/ensureBaseData.js` (`launch.sh` runs it) | No |
| Old demo data (Eva Nahi, Anna…) + Playwright accounts | `bash scripts/resetDemo.sh --yes` | **Yes — wipes all users and course data** |
| Clear people, keep admins + catalogue | `node scripts/flushAllButAdmins.js --yes` | **Yes** |

Full reset to a clean Persian demo:

```bash
cd backend
bash scripts/resetDemo.sh --yes          # wipe + old demo data + GY25 catalogue
node scripts/seedPersianDemo.js          # the Persian court on top
cd .. && bash launch.sh
```

All these scripts refuse to run against anything but the local database and refuse
`NODE_ENV=production`. See `backend/scripts/README.md` for every script.

## 9. If something goes wrong live

| Symptom | Fix |
|---|---|
| A page hangs on "Laddar…" the first time | Vite is compiling it — wait, or warm up beforehand (§0) |
| Placement created a *new* kurskort instead of joining | Start date or length differs from the kurskort: use the exact SVEA Startdatum and `10 veckor (50%)` |
| A king you used in a rehearsal is in the wrong state | `node scripts/seedPersianDemo.js` (10 s) |
| Logged in but data missing after re-seeding | Log out and in again (re-seeding recreates the accounts) |
