# Phase 1 — Produktionshärdning: UI + API-verifiering

**Testguide för att manuellt verifiera samtliga härdade features från din egen maskin — via browsern OCH via API/curl.**

| | |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:5010 |
| Branch | `feat/polishing` |
| Omfattning | Ocommittade härdningsändringar: P15-projicering, uploads IDOR, dokument tenant scope, messaging-PII, feature flags |
| Målgrupp | Dev/QA som signerar av härdsättningen före produktion |

### Vad som verifieras

| # | Feature | Primär kodreferens |
|---|---|---|
| A | P15 — rollsbaserad elevfält-projicering | `backend/src/utils/studentSerializer.js` |
| B | Uploads IDOR-fix | `backend/index.js:118-160` (`serveUpload`), `backend/src/utils/documentAuthorization.js` |
| C | Dokument-metadata tenant scope | `backend/src/router/documentRoutes.js:273-300` |
| D | Meddelanden utan personnummer | `backend/src/controllers/messagingController.js` |
| E | Feature flags + `GET /api/features` | `backend/src/config/featureFlags.js`, `backend/src/router/router.js:47` |
| F | Regressions-smoke (UI-tungt) | — |

---

## Innehåll

1. [Snabbstart och förutsättningar](#0-snabbstart-och-förutsättningar)
2. [Testkonto-matris](#1-testkonto-matris)
3. [Rekommenderad testordning](#2-rekommenderad-testordning)
4. [Testdata-förberedelse](#3-testdata-förberedelse)
5. [A. P15 — Rollbaserad elevfält-projicering](#a-p15--rollbaserad-elevfält-projicering)
6. [B. Uploads IDOR](#b-uploads-idor)
7. [C. Dokument-metadata tenant scope](#c-dokument-metadata-tenant-scope)
8. [D. Meddelanden — inget personnummer](#d-meddelanden--inget-personnummer)
9. [E. Feature flags](#e-feature-flags)
10. [F. Inaktivitet, utloggning och avslutande regression](#f-inaktivitet--utloggning-och-avslutande-regression)
11. [Sign-off checklist](#11-sign-off-checklist)
12. [Kända avvikelser och blockeringar](#12-kända-avvikelser-och-blockeringar)
13. [Snabbreferens — curl-pack](#13-snabbreferens--curl-pack)
14. [Automatiserad körning — Postman / Newman](#14-automatiserad-körning--postman--newman)

---

## 0. Snabbstart och förutsättningar

### 0.1 Starta stacken

```bash
# Från repo-roten
make dev                      # docker compose: mongo + backend på 5010
cd frontend && pnpm dev        # Vite dev-server → http://localhost:5173
```

Verifiera att båda svarar:

```bash
curl -s http://localhost:5010/health | head -c 300; echo
curl -s -o /dev/null -w "frontend: %{http_code}\n" http://localhost:5173/
```

`/health` ska svara `success: true`; frontend ska ge `200`.

> **Obs — Mongo och `municipality`.** I den utvecklingsuppsättning som användes 2026-09-27 ligger Mongo på port **27018** (`mongodb://localhost:27018/mindfullearning`) och inte 27017. Seeden lägger dessutom inte in `municipality` alls (AV-9), så kommun-scopet måste sättas manuellt enligt §3.1 innan §C är körbar. Sektionerna i §14 sätter upp detta automatiskt.

### 0.2 DevTools — gör detta en gång

Öppna http://localhost:5173 och tryck `F12`:

1. **Network** → kryssa i **Preserve log** (behåller loggen vid navigering).
2. **Network** → filtrera på **Fetch/XHR** för att bara se API-anrop mot `http://localhost:5010/api/...`.
3. Högerklick på en request → **Copy → Copy as cURL**. Det ger färdiga cookies till API-kontrollen — nyckeln till att para UI-observation med API-svar.
4. **Application → Cookies → http://localhost:5010** → hitta cookien **`token`**. Det är auth-cookien (`httpOnly`, `sameSite: strict`, `path=/`, 7 dagar). I praktiken används **ingen** `Authorization`-header — all autentisering sker via denna cookie.
5. **Console** → håll öppen, särskilt under E och F.

> **Rate limits (utvecklingsläge):** `authRateLimiter` tillåter **1000 inloggningar / 15 min per IP** (bara 5 i produktion) — du kan alltså logga in fritt från curl. `uploadRateLimiter` är däremot **10 uppladdningar / timme** (admins undantagna). `apiRateLimiter` hoppar över `/api/auth/login`.

### 0.3 Inloggning (UI)

Gå till http://localhost:5173/login:

| Fält | Selector | Etikett i UI |
|---|---|---|
| E-post | `#email` | **E-postadress** (placeholder `din@email.com`) |
| Lösenord | `#password` | **Lösenord** (placeholder `Ange ditt lösenord`) |
| Knapp | `button[type="submit"]` | **Logga in** (visar **Loggar in...** under anropet) |

Efter inloggning landar du på **/profile**. Bekräfta alltid rätt roll via DevTools → Network → `GET /api/auth/session`:

```json
{ "requiresPasswordChange": false,
  "user": { "userId": "…", "name": "Mindful Admin", "email": "admin@mindful.se",
            "role": "admin", "roles": ["admin"] } }
```

**Rollhierarkin i frontend** (`frontend/src/store/store.js:5-15`) styr både menyfiltering och route-guard:

`guest(0) → user(1) → student(2) → coordinator(3) → specped(4) → syv(5) → teacher(6) → admin(7) → systemadmin(8)`

En roll ser allt som ligger *under* sig. Viktig konsekvens i test A — se [A.3](#a3--varför-coordinator-måste-öppna-profilen-via-direkt-url).

### 0.4 Navigering — så hittar du menyn

Det finns **ingen synlig sidomeny**. Allt ligger i hamburgaren:

1. Klicka burger-ikonen uppe till vänster (`aria-label="Öppna meny"`).
2. Panelen har rubriken **Navigation** och listar alla menyval.
3. **Logga ut** finns längst ner i samma panel och i profilmenyn (**Min profil** → **Logga ut**).

Utöver hamburgaren: logotypen (→ `/`), **Meddelanden**-bubblan (`title="Meddelanden"` → `/messages`) och **notifikationsklockan** i topbaren.

---

## 1. Testkonto-matris

Alla konton skapas av `backend/scripts/seedE2EData.js`. Kör den om databasen är tom:

```bash
cd backend && node scripts/seedE2EData.js
```

> **Seeding raderar** alla Users, Students, Courses, Enrollments, Notifications och GridFS-filer. Kör den FÖR teststart, aldrig efter att du lagt testdata.

| Roll | E-post | Lösenord | Visningsnamn | Öppnar elevprofil via | Anteckningar |
|---|---|---|---|---|---|
| **Admin** | `admin@mindful.se` | `Admin123!` | Mindful Admin | meny → **Elever** | Global kommun-åtkomst. Ser allt i menyn. |
| **Systemadmin** | `sysadmin@mindful.se` | `Admin123!` | System Admin | meny → **Elever** | Som admin + `DELETE STUDENT` + **Behörigheter**-fliken. |
| **Lärare** | `teacher@mindful.se` | `Teacher123!` | Eva Nahi | meny → **Elever** | Äger alla fem elever. Ser `Betyg`, `Betygssignering`, `Inlämningar`. |
| **Praktiksamordnare** | `coordinator@mindful.se` | `Teacher123!` | Samordnare Sten | **direkt-URL** | Ser **inte** `Elever` i menyn (se A.3). Ser `APL`, `Kalender`, `Meddelanden`. |
| **SYV** | `syv@mindful.se` | `Teacher123!` | SYV Sara | **direkt-URL** | Ser `SYV Samtal`. Ser **inte** klockan. |
| **Specialpedagog** | `specped@mindful.se` | `Teacher123!` | Specped Sven | **direkt-URL** | Ser `Specped Samtal`. Enda rollen som får redigera anpassningar. Ser **inte** klockan. |
| **Elev 1** | `student@mindful.se` | `Student123!` | Anna Andersson | egen profil | Stockholm. Har `Specialbehov` + kommentar + APL. |
| **Elev 2** | `student2@mindful.se` | `Student123!` | Berta Berg | egen profil | Stockholm. |
| **Elev 3** | `student3@mindful.se` | `Student123!` | Calle Carlsson | egen profil | Stockholm. |
| **Elev 4** | `student4@mindful.se` | `Student123!` | Doris Dahl | egen profil | **Upplands Bro** — out-of-tenant för test C. |
| **Elev 5** | `student5@mindful.se` | `Student123!` | Erik Ek | egen profil | Stockholm, `dropout: true` → visas som **INAKTIV**. |

### 1.1 Elever, kommuner och personnummer

| Elev | Personnummer | Kommun | Lärare | Övrigt |
|---|---|---|---|---|
| Anna Andersson | `19900101-1234` | Stockholm | Eva Nahi | `Specialbehov: "Extra skrivtid"`, 1 kommentar, 2 APL-paket |
| Berta Berg | `19920202-2345` | Stockholm | Eva Nahi | Betyg B (låst) |
| Calle Carlsson | `19940303-3456` | Stockholm | Eva Nahi | APL-status GUL → röd (slutar inom 3 veckor) |
| **Doris Dahl** | `19960404-4567` | **Upplands Bro** | Eva Nahi | **Endaste eleven med `completed`-inskrivning → har `Filarkiv`-fliken** |
| Erik Ek | `19980505-5678` | Stockholm | Eva Nahi | Avbruten → `INAKTIV` |

> **För test C:** alla personalkonton är *globala* (inga kommuner satta) efter seeding. För att testa kommun-scope måste du begränsa någon — se [§3.1](#31-sätt-upp-en-kommunbegränsad-personal).
>
> **För test B/C:** endast **Doris Dahl** har `Filarkiv`-fliken, eftersom fliken kräver minst en inskrivning med `status: "completed"`. Använd Doris, eller se [§3.2](#32-se-till-att-en-elev-har-filarkiv-fliken).

---

## 2. Rekommenderad testordning

Optimerad för att logga in så få gånger som möjligt och slå fler fel per inloggning.

| Steg | Innehåll | Antal roller | Tid |
|---|---|---|---|
| **0** | Förutsättningar: stack uppe, seed körd, DevTools redo | — | 5 min |
| **E-1** | `GET /api/features` + defaults ON. Ingen inloggning behövs. | ingen | 1 min |
| **A-1** | Admin: `Elever` + profil. Ger referensbilden **och elvernas `_id`** att återanvända i B/C. | admin | 5 min |
| **A-2** | Samma elev som lärare. | teacher | 3 min |
| **A-3** | Samma elev som SYV. | syv | 2 min |
| **A-4** | Samma elev som specped. | specped | 2 min |
| **A-5** | Samma elev som coordinator (direkt-URL). | coordinator | 2 min |
| **B-1** | Admin: uppladdning + nedladdning från `Filarkiv` (Doris). Notera `filename`. | admin | 4 min |
| **B-2** | Elev: laddar ner **eget** filarkiv → 200. | student4 | 2 min |
| **B-3** | Annan elev öppnar Doris fil-URL → måste nekas. | student/student2 | 2 min |
| **B-4** | Alla fem statuskoderna via curl. | cookies | 3 min |
| **§3.1** | Sätt kommun-spann på coordinator. | admin | 3 min |
| **C-1** | Admin: Doris `Filarkiv` (list/tomt/uppladdning). | admin | 3 min |
| **C-2** | Scoped coordinator → Anna OK, Doris blockeras. | coordinator | 4 min |
| **C-3** | Elev: eget 200, annans 403. | student4 | 2 min |
| **D-1** | Skapa konversation länkad till elev (inget seedas!), öppna tråd, läs header. | admin | 4 min |
| **D-2** | Skicka meddelande, bekräfta att tråden uppdateras. | admin | 2 min |
| **D-3** | Verifiera `studentId`-payloaden. | admin | 2 min |
| **E-2** | `FEATURE_MESSAGING=false` → restart → 404 + UI. | admin | 5 min |
| **E-3** | Återställ → bekräfta recovery. | admin | 2 min |
| **F** | Regressions-smoke inkl. mobil-bredd. | admin + student | 10 min |
| **§11–13** | Signering + avvikelser. | — | 5 min |

**Total: ca 70 minuter.**

**Inloggningsordning för minst antal byten:** admin → teacher → syv → specped → coordinator → student4. Öppna **två fönster** (ett admin, ett elev) så att B-2/B-3/C-3 går utan ombyten.

---

## 3. Testdata-förberedelse

### 3.1 Sätt upp en kommunbegränsad personal

Efter seeding har **all personal global åtkomst** (tom `municipalities` = globalt). Utan detta steg är C-2 meningslöst.

**Via UI (rekommenderat — verifierar också att spannet sparas):**

1. Logga in som `admin@mindful.se`.
2. Hamburgaren → **Användare** (`/användare`).
3. Klicka **Redigera** på raden **Samordnare Sten** (`coordinator@mindful.se`).
4. Scrolla till kortet **Kommuner (data-omfång)**.
5. Bocka i **Stockholm**. Lämna alla andra obockade.
6. Bekräfta att texten blir **"Valda: 1 kommun(er)"** (noll valda = *"global åtkomst"*).
7. Klicka **Spara kommun-spann**.
8. Förväntat: grön text **"Kommun-spann sparad."**

**Via API (snabbare):**

```bash
BASE=http://localhost:5010
curl -s -c /tmp/c_admin.txt -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@mindful.se","password":"Admin123!"}' > /dev/null

COORD_ID=$(curl -s -b /tmp/c_admin.txt "$BASE/api/users" \
  | node -pe 'const u=JSON.parse(require("fs").readFileSync(0)).find(x=>x.email==="coordinator@mindful.se");print(u._id||u.userId)')

curl -s -b /tmp/c_admin.txt -X PUT "$BASE/api/users/$COORD_ID/municipalities" \
  -H 'Content-Type: application/json' -d '{"municipalities":["Stockholm"]}'
```

**Verifiera att det sparades:**

```bash
curl -s -b /tmp/c_admin.txt "$BASE/api/users/$COORD_ID" | grep -o '"municipalities":\[[^]]*\]'
# Förväntat: "municipalities":["Stockholm"]
```

**Återställ efter testet** (annars påverkar du resten av smoke-testet):

```bash
curl -s -b /tmp/c_admin.txt -X PUT "$BASE/api/users/$COORD_ID/municipalities" \
  -H 'Content-Type: application/json' -d '{"municipalities":[]}'
```

> **Logga ut och in igen som coordinator efter att du sparat spannet.** JWT:en som utfärdades vid inloggning innehåller **inte** `municipalities` (`backend/src/controllers/authController.js:95-101`). Fältet läses om från databasen per request via `refreshUserAuthorization` (`backend/src/middleware/authorization.js:82-118`) — men bara på routes som går via `hasRole`. Se även **AV-1**.
>
> **Ogiltiga kommunvärden** ger `400` med hela listan. Giltiga värden: `Botkyrka, Danderyd, Göteborg, Huddinge, Järfälla, KCNO, Lidingö, Norrtälje, Nykvarn, Privat kunder, Salem, Sigtuna, Sollentuna, Solna, Stockholm, Sundbyberg, Södertälje, Täby, Upplands Bro, Upplands Väsby, Vallentuna, Vaxholm, Växjö, Österåker` (`backend/src/config/municipalities.js`).

### 3.2 Se till att en elev har `Filarkiv`-fliken

Fliken visas bara om eleven har minst en inskrivning med `status: "completed"` (`frontend/src/views/Student/StudentDetails.vue:271-282`). Efter seeding har **bara Doris Dahl** det.

Vill du hellre testa på Anna:

```bash
mongosh "mongodb://localhost:27018/mindfullearning" --quiet --eval '
  db.studentenrollments.updateMany(
    { studentId: ObjectId("<ANNAS_ID>") },
    { $set: { status: "completed" } }
  ).modifiedCount'
```

Annars: använd Doris. Om du ändrade något, sätt tillbaka `status: "active"` efteråt.

### 3.3 Lägg till en stödkontakt på testeleven

`Stödkontakter`-kortet är tomt (`Inga stödkontakter registrerade`) efter seeding. För att se en *skillnad* mellan rollerna i A måste kortet ha data:

1. Logga in som admin → **Elever** → **Anna Andersson** → flik **Allmänt**.
2. Scrolla till **Stödkontakter** → klicka **Redigera** (eller **Lägg till**).
3. Fyll i: Namn `Kurator Sara`, Roll `Kurator`, E-post `sara@example.se`, Stödtyp `kurator`.
4. Klicka **Spara** → toast **"Stödkontakter uppdaterade."**

> §A testar **Anna**. Kör du §A mot Doris i stället behöver du lägga stödkontakten på Doris också.
>
> **Läs avvikelse AV-2 innan du drar slutsatser från detta steg.**

---

## A. P15 — Rollbaserad elevfält-projicering

### A.1 Goal

En elevs JSON-payload ska bara innehålla de fält som den inloggade rollen får se, så att personnummer och stöd-/anpassningsuppgifter aldrig skickas till klienten för en roll som inte får dem — varken i listan eller i profilen.

### A.2 Preconditions

- **Roll:** `admin`, `teacher`, `syv`, `specped`, `coordinator`
- **Data:** Anna Andersson (`19900101-1234`) med `Specialbehov = "Extra skrivtid"` och minst en stödkontakt ([§3.3](#33-lägg-till-en-stödkontakt-på-testeleven)). Doris Dahl har dessutom `Filarkiv`-fliken.
- **DevTools:** Network → Fetch/XHR med `Preserve log`. Console öppen.
- **Referensmatris** (ur `backend/src/utils/studentSerializer.js:63-127`):

| Roll | `personalNumber` | `supportInfo` | `specialNeeds` | `examAccommodations` | `deviations` | `commentHistory` | `changeHistory` |
|---|---|---|---|---|---|---|---|
| systemadmin / admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| teacher | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
| coordinator | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| syv / specped | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| student (sig själv) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| student (annan elev) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### A.3 UI steps

#### A-1 · Admin — referensbilden

1. Logga in som `admin@mindful.se` → du landar på `/profile`.
2. Hamburgaren → **Elever** (`/students`). Sidan har rubriken **Elever**.
3. Notera tabellens kolumnrubriker: **Namn · Personnummer · Utbildning · Edit · Startdatum · Slutdatum · Slutprov · Kommun · Tel · Email · Övrigt · Lärare**.
4. Läs kolumnen **Personnummer** för raden **Anna Andersson** → ska vara `19900101-1234`.
5. Klicka på **namnet** `Anna Andersson` (länk) → elevprofilen öppnas på `/student/<id>`.
6. Fliken **Allmänt** är vald från början. Scrolla igenom korten:
   - **Grundläggande Information** — APL-status, Namn, **Personnummer**, Telefon, E-post, Lösenord, Kommun
   - **Status** — Startdatum, Slutdatum, Provstatus, Övrigt, **Specialbehov**, **Provlokal-anpassningar**, Avbrott (Inaktiv)
   - **Stödkontakter**
   - **Avvikelser & Undantag**
   - **Kommentarer**
   - **Ändringshistorik** (endast admin)
7. Bekräfta att **Personnummer** visar `19900101-1234`, att **Specialbehov** visar `Extra skrivtid`, och att **Ändringshistorik**-kortet finns.
8. **Kopiera Annas URL** ur adressfältet — du behöver den i A-3…A-5.

**Inspector:** `GET /api/students` → array. Öppna en post och verifiera att den innehåller `personalNumber`, `specialNeeds`, `supportInfo`, `examAccommodations`, `deviations`, `commentHistory`, `changeHistory`.

#### A-2 · Lärare — personnummer kvar, djupa stödanteckningar borta

1. **Logga ut** (`Min profil` → `Logga ut`).
2. Logga in som `teacher@mindful.se` / `Teacher123!`.
3. Hamburgaren → **Elever**. Kolumnen **Personnummer** ska visa `19900101-1234` för Anna.
4. Klicka på **Anna Andersson**.
5. På fliken **Allmänt**:
   - **Personnummer** → `19900101-1234` ✅
   - **Specialbehov** → `Extra skrivtid` ✅
   - **Provlokal-anpassningar** → anpassningar visas, annars `Inga anpassningar`
   - **Stödkontakter** → kortet **syns**. Knappen **Redigera** saknas (`v-if="isAdmin"`). Innehållet kommer från `/support` — se **AV-2**
   - **Avvikelser & Undantag** → kortet **syns** (`canCreateDeviation` gäller bara knappen). Se **AV-2**
   - Knappen **Redigera** i Status-kortet finns **inte** — allt är read-only
   - Raden **Avbrott (Inaktiv)** visas **inte**
6. Observera att **Ändringshistorik**-kortet saknas (`v-if="isAdmin"` på kortet).
7. **Kommentarer**-kortet syns (`canComment` = `teacher|admin|systemadmin`).

> ⚠️ **Blockerande avvikelse — AV-2.** Läraren ser **Stödkontakter** och **Avvikelser & Undantag**. Projektorn tar bort `supportInfo` och `deviations` ur huvud-payloaden, men korten fylls från `GET /api/student-details/:id/support` (`:905`) och `.../deviations` (`:958`) som tillåter `teacher`. **Förväntat enligt P15: båda korten ska vara dolda för lärare.Verifiera och rapportera som fail.**

**Inspector (gör detta som lärare — det är beviset):**

```bash
curl -s -b /tmp/c_teacher.txt "$BASE/api/student-details/$ANNA_ID" | node -pe 'const s=JSON.parse(require("fs").readFileSync(0));
  ["deviations","supportInfo","changeHistory"].map(k=>k+"="+(k in s)).join("  ")'
# Förväntat enligt projektorn:  deviations=false  supportInfo=false  changeHistory=false

curl -s -b /tmp/c_teacher.txt "$BASE/api/student-details/$ANNA_ID/deviations"; echo
# Förväntat enligt P15: 403
# Faktiskt (AV-2): 200 med avvikelsedata  ❌
```

#### A-3 · SYV — stödfält ska vara tillgängliga

1. Logga ut, logga in som `syv@mindful.se` / `Teacher123!`.
2. **SYV har ingen `Elever`-länk i menyn.** Gå direkt till Annas URL från A-1 steg 8.
3. På **Allmänt**: **Personnummer** och **Specialbehov** ska vara ifyllda. **Stödkontakter**-kortet visas med innehåll (AV-2), men **utan** knappen Redigera.
4. **Kommentarer**-kortet är tomt — SYV saknas i `canComment`, och projektorn tar bort `commentHistory`.
5. Menyn innehåller **SYV Samtal** (`/syv/appointments`).
6. **Notifikationsklockan saknas** för SYV (klockan visas endast för `teacher`, `admin`, `systemadmin`, `student`).

#### A-4 · Specped — samma som SYV + anpassningsredigering

1. Logga ut, logga in som `specped@mindful.se` / `Teacher123!`.
2. Gå direkt till Annas URL från A-1 steg 8.
3. **Personnummer** och **Specialbehov** ifyllda. **Stödkontakter**-kortet visas med innehåll (AV-2), **utan** Redigera-knapp. **Kommentarer** tomt.
4. Vid **Provlokal-anpassningar** finns det nu en extra knapp **Redigera** bredvid etiketten — specped-rollens särskilda behörighet (`v-if="isSpecped && !editMode && !specpedAccommodationMode"`, `GeneralTab.vue:188`). Klicka inte på **Spara** (det räcker att se att knappen finns).
5. Menyn innehåller **Specped Samtal**.

#### A-5 · Coordinator — PII och stöd ska vara borta

1. Logga ut, logga in som `coordinator@mindful.se` / `Teacher123!`.
2. **Coordinator har ingen `Elever`-länk i menyn.** Gå direkt till Annas URL från A-1 steg 8.
3. På **Allmänt** förväntar du dig:
   - **Personnummer:** `Ej angivet`
   - **Specialbehov:** `Ej angivet`
   - **Provlokal-anpassningar:** `Inga anpassningar`
   - **Stödkontakter:** kortet **syns med innehåll** ⚠️ *(AV-2)* — ska enligt P15 vara helt dolt
   - **Avvikelser & Undantag:** kortet **syns med innehåll** ⚠️ *(AV-2)*
   - **Kommentarer:** tomt (projektorn tar bort `commentHistory`)
   - **Ändringshistorik** och **Avbrott (Inaktiv)**: saknas
   - Knappen **Redigera** finns inte (bara Status-kortet gates av `isAdmin`; övriga kort saknar helt knapp)
4. **Inspektera Network:** du ser `GET /api/student-details/<id>/support` → 200 och `.../deviations` → 200, trots att korten skull döljas. Det är AV-2.

#### A.3 — varför coordinator måste öppna profilen via direkt-URL

`/students` är deklarerad med `meta.role: ['admin','teacher']` (`frontend/src/router/router.js:185-190`). `hasPermission` jämför hierarkiindex, så `coordinator`(3) klarar varken `admin`(7) eller `teacher`(6) → du skickas till `/unauthorized` ("Access Denied"). Route `/student/:id` har `meta.role: ['student','teacher','syv','specped','admin','systemadmin']` — `coordinator`(3) passerar därför där (`coordinator ≥ student`), vilket är meningen: coordinator ska kunna öppna en elevprofil, bara inte listan. Samma gäller SYV och Specped (båda står uttryckligen i listan).

### A.4 What to look at in the UI

| Yta | Admin | Lärare | SYV / Specped | Coordinator |
|---|---|---|---|---|
| Kolumnen **Personnummer** i `Elever` | `19900101-1234` | `19900101-1234` | n/a (ingen `Elever`) | n/a (ingen `Elever`) |
| **Personnummer:** (profil) | `19900101-1234` | `19900101-1234` | `19900101-1234` | **`Ej angivet`** |
| **Specialbehov:** | `Extra skrivtid` | `Extra skrivtid` | `Extra skrivtid` | **`Ej angivet`** |
| **Provlokal-anpassningar:** | värde / `Inga anpassningar` | värde / `Inga anpassningar` | värde / `Inga anpassningar` | **`Inga anpassningar`** |
| **Stödkontakter** (kort) | ifylld | **ifylld ⚠️ AV-2** | **ifylld ⚠️ AV-2** | **ifylld ⚠️ AV-2** |
| Knapp **Redigera** i Stödkontakter | finns | saknas | saknas | saknas |
| **Avvikelser & Undantag** (kort) | ifyllt | **ifyllt ⚠️ AV-2** | **ifyllt ⚠️ AV-2** | **ifyllt ⚠️ AV-2** |
| **Kommentarer** (kort) | ifyllt | ifyllt | tomt (`commentHistory` saknas) | tomt |
| **Ändringshistorik** (kort) | finns | saknas | saknas | saknas |
| **Avbrott (Inaktiv)** | finns | saknas | saknas | saknas |
| Knapp **Redigera** (huvud) | finns | saknas | saknas | saknas |
| **Behörigheter**-flik | finns | saknas | saknas | saknas |
| **DELETE STUDENT** | visas (även admin) | saknas | saknas | saknas |

> **Kortens `v-if` gäller bara knapparna, inte korten.** `Stödkontakter`, `Avvikelser & Undantag` och `Kommentarer` är `<div class="card">` utan villkor (`GeneralTab.vue:258`, `:289`, `:327`) — det är bara knapparna **Redigera**/**Lägg till** som är gated (`isAdmin` respektive `canCreateDeviation`/`canComment`). Eftersom kortens innehåll kommer från de sekundära anropen i AV-2 renderas stöd- och avvikelsedata för **lärare och coordinator**. Endast `Ändringshistorik` har `v-if="isAdmin"` på själva kortet (`GeneralTab.vue:388`).

Övrigt att notera:

- **Dolda värden renderas som `Ej angivet`**, inte som tom ruta. Det är korrekt. Hittar du `19900101-1234` någonstans för coordinator är det ett **fail**.
- Det finns **aldrig en `alert()`-dialog**. Fel visas som toast eller in-page-banner.
- Raden **Lösenord:** visas bara för admin.
- `Ctrl+F` i DevTools → söka på `19900101` som coordinator. Får inte finnas.

### A.5 Network/API steps

**Nyckelinsikt:** P15 påverkar **två** endpoints. Jämför alltid båda.

```bash
BASE=http://localhost:5010
login () { curl -s -c "/tmp/c_$1.txt" -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$2\",\"password\":\"$3\"}" > /dev/null; }

login admin       admin@mindful.se       'Admin123!'
login teacher     teacher@mindful.se     'Teacher123!'
login syv         syv@mindful.se         'Teacher123!'
login specped     specped@mindful.se     'Teacher123!'
login coordinator coordinator@mindful.se 'Teacher123!'

SID=$(curl -s -b /tmp/c_admin.txt $BASE/api/students \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(x=>x.name==="Anna Andersson")._id')
echo "Anna _id = $SID"
```

**A.5.1 — Matrisen på profilen, alla roller på en gång**

```bash
for r in admin teacher syv specped coordinator; do
  echo "--- $r ---"
  curl -s -b "/tmp/c_$r.txt" "$BASE/api/student-details/$SID" \
   | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const s=JSON.parse(d);
       for (const k of ["personalNumber","specialNeeds","supportInfo","examAccommodations","deviations","commentHistory","changeHistory"])
         console.log("  "+k.padEnd(20), k in s ? "PRESENT" : "absent");})'
done
```

**A.5.2 — Samma matris på listan**

```bash
for r in admin teacher syv specped coordinator; do
  echo "--- $r ---"
  curl -s -b "/tmp/c_$r.txt" $BASE/api/students \
   | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const a=JSON.parse(d).find(x=>x.name==="Anna Andersson");
       if (!a) { console.log("  (elven syns inte alls)"); return; }
       for (const k of ["personalNumber","specialNeeds","supportInfo","examAccommodations"])
         console.log("  "+k.padEnd(20), k in a ? "PRESENT" : "absent");})'
done
```

**A.5.3 — Nyckelskillnad mellan två roller**

```bash
keys () { curl -s -b "/tmp/c_$1.txt" "$BASE/api/student-details/$SID" \
  | node -pe 'Object.keys(JSON.parse(require("fs").readFileSync(0))).sort().join("\n")'; }

keys admin       > /tmp/keys_admin.txt
keys teacher     > /tmp/keys_teacher.txt
keys coordinator > /tmp/keys_coord.txt

diff /tmp/keys_admin.txt /tmp/keys_coord.txt
# Förväntat: personalNumber, specialNeeds, supportInfo, examAccommodations,
#            commentHistory, changeHistory saknas (< endast)

diff /tmp/keys_admin.txt /tmp/keys_teacher.txt
# Förväntat: supportInfo, changeHistory saknas (< endast)
```

> **`deviations` finns aldrig i elevpaketet.** Avvikelser lever i en egen `Deviation`-collection och läses via `GET /api/student-details/:id/deviations` (`studentDetailsRoutes.js:144`). Diffarna ovan kan därför inte förvänta sig att fältet är *borttaget* — det existerar inte i dokumentet. Bekräftat mot databasen 2026-09-27: `students`-dokumentens nycklar är `aplStatus, aplStatusHistory, attendedExam, changeHistory, commentHistory, dropout, email, examAccommodations, examHistory, lastLearningActivityAt, logbook, name, paidExamFee, personalNumber, priorAplCompleted, priorAplIntygDocId, specialNeeds, supportInfo, teacherId` — varken `deviations` eller `municipality` (se AV-9).

**A.5.4 — Påståendekontroller (exit 0 = PASS, 1 = FAIL)**

```bash
# coordinator får INTE se personnummer — varken profil eller lista
! curl -s -b /tmp/c_coordinator.txt "$BASE/api/student-details/$SID" | grep -q '19900101-1234' \
  && echo "PASS: profil ren" || echo "FAIL: LÄCKA i profil"
! curl -s -b /tmp/c_coordinator.txt $BASE/api/students | grep -q '19900101-1234' \
  && echo "PASS: lista ren" || echo "FAIL: LÄCKA i /students"

# coordinator får inte se stöddata  (deviations ingår inte — egen collection, se A.5.3)
! curl -s -b /tmp/c_coordinator.txt "$BASE/api/student-details/$SID" | grep -qE '"(supportInfo|specialNeeds|examAccommodations|commentHistory)"' \
  && echo "PASS: stödfält borttagna" || echo "FAIL: stödfält läckt"

# lärare FÅR se personnummer
curl -s -b /tmp/c_teacher.txt "$BASE/api/student-details/$SID" | grep -q '19900101-1234' \
  && echo "PASS: lärare ser personnummer" || echo "FAIL: lärare förlorade data den har rätt till"

# lärare får INTE se supportInfo
! curl -s -b /tmp/c_teacher.txt "$BASE/api/student-details/$SID" | grep -q '"supportInfo"' \
  && echo "PASS: supportInfo borttaget för lärare" || echo "FAIL: supportInfo läckt till lärare"

# syv/specped FÅR se supportInfo
curl -s -b /tmp/c_syv.txt "$BASE/api/student-details/$SID" | grep -q '"supportInfo"' \
  && echo "PASS: syv ser stödfält" || echo "FAIL: syv förlorade stödfält"

# inga lösenord i något svar
for r in admin teacher syv specped coordinator; do
  curl -s -b "/tmp/c_$r.txt" "$BASE/api/student-details/$SID" \
    | grep -qE '"(password|hashedPassword)"' \
    && echo "FAIL: lösenordsfält hos $r" || echo "PASS: inga lösenord hos $r"
done
```

**A.5.6 — `GET /api/student/:id` och `/basic` (även projicerade)**

```bash
for ep in "/api/student/$SID" "/api/student/$SID/basic"; do
  echo "--- $ep ---"
  for r in admin coordinator; do
    printf '  %-12s ' "$r"
    curl -s -b "/tmp/c_$r.txt" "$BASE$ep" \
      | node -pe 'const o=JSON.parse(require("fs").readFileSync(0));"personalNumber="+("personalNumber" in o)+" specialNeeds="+("specialNeeds" in o)'
  done
done
```

**A.5.7 — Enda fältlistan (för arkivering)**

```bash
keys admin | tr '\n' ' '; echo
```

### A.6 Expected pass criteria

**UI**
- Admin: `Elever` visar `19900101-1234` i Personnummer-kolumnen; profilen visar Personnummer, Specialbehov, Stödkontakter, Avvikelser, Kommentarer, Ändringshistorik.
- Lärare: Personnummer `19900101-1234` + Specialbehov syns; **Redigera** saknas; Ändringshistorik saknas; **Stödkontakter och Avvikelser ska vara helt dolda** (se AV-2 — förväntat utfall just nu är att de syns).
- SYV och Specped: Personnummer, Specialbehov syns; tomt Kommentarer-kort; ingen Ändringshistorik. Specped har **Redigera** vid Provlokal-anpassningar.
- Coordinator: **Personnummer: `Ej angivet`**, **Specialbehov: `Ej angivet`**, **Provlokal-anpassningar: `Inga anpassningar`**, ingen Ändringshistorik, ingen Avbrott-rad, ingen Redigera, **inga Stödkontakter/Avvikelser**.
- Ingen `alert()` dyker upp.

**API**
- `GET /api/student-details/:id`:
  - admin/systemadmin → alla 7 nycklar `PRESENT`
  - teacher → `personalNumber`, `specialNeeds`, `examAccommodations`, `commentHistory` `PRESENT`; `supportInfo`, `deviations`, `changeHistory` `absent`
  - coordinator → **samtliga 7 `absent`**
  - syv/specped → alla utom `changeHistory` `PRESENT`
- `GET /api/students` → `personalNumber` `PRESENT` för admin/teacher, `absent` för coordinator.
- `GET /api/student-details/:id/support` → **`403`** för teacher och coordinator.
- `GET /api/student-details/:id/deviations` → **`403`** för teacher och coordinator.
- Inget svar innehåller `password` eller `hashedPassword`, för någon roll.
- `student.user.password` är alltid `undefined` (lösenord rensas ur det inbäddade user-objektet).

### A.7 Fail signals

| Signal | Betydelse |
|---|---|
| `19900101-1234` syns någonstans för coordinator | **Blockerande** — P15 läcker PII |
| `specialNeeds` / `supportInfo` / `examAccommodations` i coordinator-JSON | **Blockerande** |
| `deviations` eller `commentHistory` i coordinator-JSON | **Blockerande** |
| Lärare förlorar `personalNumber` eller `specialNeeds` | Regression — data tas bort för en roll som har behörighet |
| SYV/specped förlorar `supportInfo` eller `examAccommodations` | Regression — behörighet förlorad |
| Admin ser `password` / `hashedPassword` | **Blockerande** — kvarvarande credential-läcka |
| Admin ser inte `personalNumber` | Regression — P15 felaktigt aktiv för admin |
| `Filarkiv`/`Allmänt` kraschar med vit skärm eller `Något gick fel` | Frontend-krasch orsakad av saknad fält |
| **Stödkontakter/Avvikelser visas för lärare eller coordinator** | **Blockerande, AV-2** — sekundära endpointen kringgår projektorn |
| `/support` eller `/deviations` svarar 200 för lärare/coordinator | **Blockerande, AV-2** |
| Console fylls med `Error loading support info` för en elev | AV-2 punkt 3 — onödiga 403 per profilvy |

---

## B. Uploads IDOR

### B.1 Goal

En uppladdad fil ska bara kunna laddas ner av den som har behörighet till eleven filen tillhör, och filnamnet ska inte kunna användas för att nå filer utanför upload-katalogen.

### B.2 Preconditions

- **Data:** Doris Dahl (`student4@mindful.se`, Upplands Bro) har `Filarkiv`-fliken. Anna Andersson har **ingen** `Filarkiv`-flik ([§3.2](#32-se-till-att-en-elev-har-filarkiv-fliken)).
- **Roller:** `admin`, `student4` (Doris), `student` (Anna), `student2` (Berta)
- **DevTools:** Network med `Preserve log`. Eftersom nedladdningen sker via en `<a target="_blank">` (inte axios) dyker den **inte** upp under Fetch/XHR — filtrera på **All** för att se den.
- **Två fönster:** ett admin, ett elev.

### B.3 UI steps

#### B-1 · Admin laddar upp och laddar ner

1. Logga in som `admin@mindful.se`.
2. Hamburgaren → **Elever** → klicka **Doris Dahl**.
3. Klicka på fliken **Filarkiv**. Du ser fyra sektioner: **Allmänna dokument**, **Cv**, **APL-kontrakt**, **Praktikintyg**.
4. Vid **Allmänna dokument**: klicka filvalsfältet och välj en liten fil, t.ex. `filarkiv-test.txt`. Knappen bredvid heter **Ladda upp**.
5. **Servera svaret:** `POST /api/documents/upload` → **201** `{…}`.
6. **Toast:** `Filen laddades upp framgångsått!`
7. Filnamnet visas nu som en länk i listan (länktexten är `originalName`).
8. **Notera serverns filnamn:** DevTools → Network → klicka på `upload`-svaret och leta efter `filename`. Det ser ut som `1712345678901-123456789-filarkiv-test.txt` (timestamp + random + saniterat originalnamn).
9. **Kopiera nedladdnings-URL:en.** Högerklick på länken → *Kopiera länkadress*:
   ```
   http://localhost:5010/uploads/1712345678901-123456789-filarkiv-test.txt
   ```
   > Länken byggs från `VITE_API_URL` (`frontend/.env` → `http://localhost:5010`) och pekar mot **backend direkt**, inte Vite-proxyn.
10. Klicka på länken. En ny flik öppnas med filens innehåll. **Förväntat: 200 + innehåll.**
11. Inspektera i DevTools → Network → filnamnet → status **200**, korrekt `Content-Type`.

#### B-2 · Elev laddar ner sitt eget filarkiv

1. **Byt till elevfönstret**, logga in som `student4@mindful.se` / `Student123!`.
2. Gå till `http://localhost:5173/student/<DORIS_ID>` (kopiera `_id` från B-1:s listan, eller hämta via `GET /api/students` som admin).
3. Klicka på fliken **Filarkiv**.
4. **Samma filnamn ska finnas i listan** under **Allmänna dokument**.
5. Klicka på länken → **filen öppnas (200)**.
6. Inspektera: `GET /uploads/1712345678901-…-filarkiv-test.txt` → **200**.
7. Observera att eleven **inte** ser knappen **Ladda upp**.

#### B-3 · En elev försöker nå en annan elevs fil (detta är IDOR-testen)

1. **Stanna kvar i elevfönstret** som Doris.
2. Öppna en ny flik och klistra in en URL som pekar på Doris' fil **med Bertas cookie**. Enklaste sättet: logga in som `student2@mindful.se` (Berta) i en tredje flik och klistra in samma URL från B-1 steg 9.
   - Berta har ingen `Filarkiv`-flik, men det spelar ingen roll — du testar fil-URL:en direkt.
3. **Förväntat: 403 Forbidden** med JSON:
   ```json
   { "error": "Forbidden" }
   ```
4. Filen får **inte** visas. Kontrollera att inget filinnehåll renderas i fliken.
5. Kontroll mot: öppna samma URL som admin i en fjärde flik → **200**.

> **Varför Doris inte fungerar som "offrig elev" mot sin egen fil:** Doris *ska* kunna ladda ner sin egen fil (B-2). IDOR-fallet kräver **två olika elever**.

### B.4 What to look at in the UI

| Situation | Förväntat UI-resultat |
|---|---|
| Admin öppnar Filarkiv | Lista visas, **Ladda upp** syns, inga fel |
| Efter uppladdning | Toast `Filen laddades upp framgångsått!`, filen syns i listan |
| Filarkiv utan filer | Text `Inga dokument uppladdade än.` i varje sektion |
| Elev öppnar eget Filarkiv | Lista syns, **ingen** uppladdningsknapp |
| Elev öppnar annan elevs fil-URL | JSON `{"error":"Forbidden"}` i fliken. **Inget** filinnehåll, ingen tom ruta |
| Okänd fil-URL | JSON `{"error":"File not found"}` |
| Uppladdning av otillåten filtyp (`.exe`) | Röd toast `Kunde inte ladda upp filen: …`, 400 i Network |
| Uppladdning av fil > 10 MB | 400, `Filen är för stor. Max storlek är 10MB.` |

### B.5 Network/API steps

```bash
BASE=http://localhost:5010

login () { curl -s -c "/tmp/c_$1.txt" -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$2\",\"password\":\"$3\"}" > /dev/null; }
login admin   admin@mindful.se    'Admin123!'
login doris   student4@mindful.se 'Student123!'
login anna    student@mindful.se  'Student123!'
login berta   student2@mindful.se 'Student123!'
login teacher teacher@mindful.se  'Teacher123!'

FILENAME='1712345678901-123456789-filarkiv-test.txt'   # ← från B-1 steg 8
DORIS_ID=$(curl -s -b /tmp/c_admin.txt $BASE/api/students | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(x=>x.name==="Doris Dahl")._id')

# Skapa filen deterministiskt om du inte körde B-1
printf 'idor-probe\n' > /tmp/probe.txt
UP=$(curl -s -b /tmp/c_admin.txt -X POST $BASE/api/documents/upload \
  -F "file=@/tmp/probe.txt" -F "studentId=$DORIS_ID" -F "type=GENERAL" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).filename')
FILENAME=${FILENAME:-$UP}
echo "filename = $FILENAME"
```

**Test 1 — Okänd filnamn → 404**

```bash
curl -s -o /dev/null -w 'unknown filename  -> %{http_code}\n' \
  -b /tmp/c_admin.txt "$BASE/uploads/definitely-not-a-real-file-12345.pdf"
# Förväntat: 404

curl -s -b /tmp/c_admin.txt "$BASE/uploads/definitely-not-a-real-file-12345.pdf"
# Förväntat: {"error":"File not found"}
```

**Test 2 — Path traversal → 404 (inte 400, se AV-3)**

```bash
# URL-kodad traversal så att den överlever klientens URL-normalisering
curl -s -o /dev/null -w 'encoded traversal -> %{http_code}\n' \
  -b /tmp/c_admin.txt "$BASE/uploads/..%2F..%2F..%2Fetc%2Fpasswd"

curl -s -b /tmp/c_admin.txt "$BASE/uploads/..%2F..%2F..%2Fetc%2Fpasswd"
# Förväntat: 404  {"error":"File not found"}
```

> ⚠️ **Avvikelse från specen.** Testplanen du fick angav **400** för path traversal. Implementeringen returnerar **404** — det är medvetet: `serveUpload` behandlar *ogiltigt filnamn*, *saknad DB-rad* och *fil saknas på disk* identiskt med 404 (`backend/index.js:124-146`), vilket undviker att avslöja om ett filnamn existerar. Registrera 404 som rätt svar.
>
> Notera också att `curl "$BASE/uploads/../../../etc/passwd"` (utan `%2F`) **inte** testar något — curl och webbläsaren normaliserar sökvägen innan förfrågan skickas, så serverns routing matchar `GET /uploads/anything` (och inget annat). Använd alltid `%2F`.

**Test 3 — Behörig användare → 200**

```bash
curl -s -o /dev/null -w 'admin   own student file -> %{http_code}\n' -b /tmp/c_admin.txt   "$BASE/uploads/$FILENAME"
curl -s -o /dev/null -w 'doris   own file         -> %{http_code}\n' -b /tmp/c_doris.txt   "$BASE/uploads/$FILENAME"
curl -s -o /dev/null -w 'teacher own student file -> %{http_code}\n' -b /tmp/c_teacher.txt "$BASE/uploads/$FILENAME"
# Förväntat: 200 / 200 / 200
```

**Test 4 — Obehörig → 403**

```bash
curl -s -o /dev/null -w 'anna    doris file       -> %{http_code}\n' -b /tmp/c_anna.txt  "$BASE/uploads/$FILENAME"
curl -s -o /dev/null -w 'berta   doris file       -> %{http_code}\n' -b /tmp/c_berta.txt "$BASE/uploads/$FILENAME"
# Förväntat: 403 / 403

curl -s -b /tmp/c_anna.txt "$BASE/uploads/$FILENAME"
# Förväntat: {"error":"Forbidden"}

# Inget filinnehåll får läcka:
curl -s -b /tmp/c_anna.txt "$BASE/uploads/$FILENAME" | grep -q 'idor-probe' \
  && echo "FAIL: filinnehåll läckt" || echo "PASS: inget filinnehåll"
```

**Test 5 — Utan autentisering → 401**

```bash
curl -s -o /dev/null -w 'no cookie       -> %{http_code}\n' "$BASE/uploads/$FILENAME"
# Förväntat: 401  {"error":"Ingen giltig token angiven."}

curl -s -o /dev/null -w 'garbage cookie  -> %{http_code}\n' --cookie 'token=not-a-jwt' "$BASE/uploads/$FILENAME"
# Förväntat: 401  {"error":"Ogiltig token."}
```

**Test 6 — Svarshuvudena**

```bash
curl -s -D - -o /dev/null -b /tmp/c_doris.txt "$BASE/uploads/$FILENAME" | grep -iE '^(HTTP|content-type)'
curl -s -D - -o /dev/null -b /tmp/c_anna.txt  "$BASE/uploads/$FILENAME" | grep -iE '^(HTTP|content-type)'
# 200-svaret ska ha rätt content-type; 403-svaret ska INTE ha någon filtyp.
```

**Test 7 — Hela matrisen i en rad**

```bash
printf '%-34s %s\n' "ingen cookie"        "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/uploads/$FILENAME")"
printf '%-34s %s\n' "ogiltig cookie"      "$(curl -s -o /dev/null -w '%{http_code}' --cookie 'token=xx' "$BASE/uploads/$FILENAME")"
printf '%-34s %s\n' "okänt filnamn"       "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/c_admin.txt "$BASE/uploads/no-such-file.pdf")"
printf '%-34s %s\n' "path traversal"       "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/c_admin.txt "$BASE/uploads/..%2F..%2Fetc%2Fpasswd")"
printf '%-34s %s\n' "admin (behörig)"      "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/c_admin.txt   "$BASE/uploads/$FILENAME")"
printf '%-34s %s\n' "lärare (behörig)"     "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/c_teacher.txt "$BASE/uploads/$FILENAME")"
printf '%-34s %s\n' "elev (behörig, egen)" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/c_doris.txt   "$BASE/uploads/$FILENAME")"
printf '%-34s %s\n' "annan elev"           "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/c_anna.txt    "$BASE/uploads/$FILENAME")"
# Förväntat:  401 / 401 / 404 / 404 / 200 / 200 / 200 / 403
```

**Test 8 — GridFS-vägen (den andra uppladdningskanalen)**

```bash
GF=$(curl -s -b /tmp/c_doris.txt -X POST "$BASE/api/uploads/$DORIS_ID" \
  -F "file=@/tmp/probe.txt" \
  | node -pe 'const o=JSON.parse(require("fs").readFileSync(0));print(o._id||o.fileId||"")')
curl -s -o /dev/null -w 'gridfs doris -> egen  : %{http_code}\n' -b /tmp/c_doris.txt "$BASE/api/uploads/download/$GF"
curl -s -o /dev/null -w 'gridfs anna  -> doris : %{http_code}\n' -b /tmp/c_anna.txt  "$BASE/api/uploads/download/$GF"
# Förväntat: 200 / 403
```

### B.6 Expected pass criteria

**UI**
- Admin: uppladdning ger toast `Filen laddades upp framgångsått!`, filen syns, nedladdning öppnar filen i ny flik.
- Elev: ser sitt eget filarkiv, kan ladda ner, ser ingen uppladdningsknapp.
- Elev som öppnar annan elevs fil-URL ser `{"error":"Forbidden"}` och **inget** filinnehåll.

**API**

| Fall | Förväntad status | Förväntad svarskropp |
|---|---|---|
| Ingen cookie | `401` | `{"error":"Ingen giltig token angiven."}` |
| Ogiltig cookie | `401` | `{"error":"Ogiltig token."}` |
| Okänt filnamn | `404` | `{"error":"File not found"}` |
| Path traversal (`%2F`) | `404` | `{"error":"File not found"}` |
| Admin → fil | `200` | filinnehåll, korrekt `Content-Type` |
| Lärare → egen elevs fil | `200` | filinnehåll |
| Elev → egen fil | `200` | filinnehåll |
| Annan elev → fil | `403` | `{"error":"Forbidden"}` |
| GridFS: annan elevs fil | `403` | — |

### B.7 Fail signals

| Signal | Betydelse |
|---|---|
| **200 för annan elev** | **Blockerande IDOR** — kvarvarande horisontell behörighetslucka |
| **Fil serveras utan inloggning** | **Blockerande** — `express.static` har kommit tillbaka |
| 200 med filinnehåll när status är 403 | **Blockerande** — innehåll läcker trots felstatus |
| 404 i stället för 403 för annan elev | Acceptabelt (fail-closed). Notera i rapporten, inte blockerande |
| 500 istället för 404/403 | Fel — `serveUpload` ska aldrig kasta |
| `Content-Type: text/html` för uppladdad `.html` | Kontrollera att farliga extensioner blockeras vid uppladdning (ska ge 400) |
| Nedladdningslänken pekar på `localhost:5001` | **Regression** — `DocumentSection.vue:68` har felaktig fallback-URL. Lokalt funkar det bara för att `.env` sätter `VITE_API_URL` |
| Nedladdningen kräver ny inloggning i ny flik | Cookie-problem, inte säkerhetsproblem. Verifiera att `token` har `path=/` |

---

## C. Dokument-metadata tenant scope

### C.1 Goal

Dokumentlistan för en elev ska bara kunna läsas av inom rätt kommun, och en elev ska bara se sina egna dokument — aldrig en annan elevs, oavsett om hen gissar elevens `_id`.

### C.2 Preconditions

- **Roll:** `admin`, `coordinator` (kommunbegränsad till **Stockholm**, se [§3.1](#31-sätt-upp-en-kommunbegränsad-personal)), `student4` (Doris), `student` (Anna), `student2` (Berta)
- **Data:** Doris Dahl (**Upplands Bro**), Anna Andersson (**Stockholm**), Berta Berg (Stockholm)
- **Kritiskt:** [§3.1](#31-sätt-upp-en-kommunbegränsad-personal) måste vara utförd, och du måste logga ut/in som coordinator efteråt.
- **DevTools:** Network → Fetch/XHR med `Preserve log`.

### C.3 UI steps

#### C-1 · Admin — alla elever, alla kommuner

1. Logga in som `admin@mindful.se`.
2. Hamburgaren → **Elever** → **Doris Dahl** (Upplands Bro) → flik **Filarkiv**.
3. Bekräfta att listan laddar (antifiler eller filer) och att **Ladda upp** syns. Ladda gärna upp en fil till Doris här.
4. Gå tillbaka till **Elever** → **Anna Andersson** (Stockholm).
5. Observera att `Filarkiv`-fliken **inte** visas (Anna saknar `completed`-inskrivning — [§3.2](#32-se-till-att-en-elev-har-filarkiv-fliken)). Detta är korrekt beteende, inte ett fel.
6. Inspektera: `GET /api/documents/<DORIS_ID>` → **200** med array.

#### C-2 · Scoped coordinator — Stockholm ja, Upplands Bro nej

1. **Logga ut**, logga in som `coordinator@mindful.se`. (Gör detta **efter** att du sparat kommun-spannet.)
2. Bekräfta i DevTools att `GET /api/auth/session` visar `role: "coordinator"`.
3. Gå direkt till `http://localhost:5173/student/<DORIS_ID>` (Upplands Bro).
4. **Förväntat:** felmeddelandet **"Kunde inte ladda elevinformation"** i rött (`StudentDetails.vue:29-31`). Anropet `GET /api/student-details/<DORIS_ID>` svarar **403** `{"error":"Forbidden"}`. Ingen `Filarkiv`-flik, inga elevdata.
5. Gå nu till `http://localhost:5173/student/<ANNA_ID>` (Stockholm).
6. **Förväntat:** Annas profil laddar normalt. `Personnummer: Ej angivet` (P15, se A-5).
7. Inspektera i Network:
   - `GET /api/student-details/<DORIS_ID>` → **403**
   - `GET /api/student-details/<ANNA_ID>` → **200**
   - `GET /api/students` → **200**, men listan ska bara innehålla Stockholm-elever (Anna, Berta, Calle, Erik — **inte** Doris)

#### C-3 · Elev — eget 200, annas 403

1. **Byt till elevfönstret**, logga in som `student4@mindful.se` (Doris).
2. Gå till `http://localhost:5173/student/<DORIS_ID>` → flik **Filarkiv** → listan visas.
3. Inspektera: `GET /api/documents/<DORIS_ID>` → **200**.
4. I samma elevsession, öppna en ny flik med Annas elev-URL: `http://localhost:5173/student/<ANNA_ID>`.
5. **Förväntat:** "Kunde inte ladda elevinformation". Inspektera: `GET /api/student-details/<ANNA_ID>` → **403**.
6. För dokumentlistan, klistra in i **Console** (du är inloggad som Doris):
   ```js
   const annaId = 'ANNAS_ID_HÄR';
   const r = await fetch(`/api/documents/${annaId}`, { credentials: 'include' });
   console.log(r.status, await r.text());
   // Förväntat: 403 {"message":"Du har inte behörighet att komma åt dokumenten"}
   ```

> **Notera:** `GET /api/documents/:id` svarar 403 med `{message: …}`, medan `GET /uploads/:filename` svarar 403 med `{error: …}`. Det är kosmetiskt — matcha på **statuskoden**, inte på meddelandefältet.

### C.4 What to look at in the UI

| Situation | Förväntat UI-resultat |
|---|---|
| Admin → Doris (Upplands Bro) `Filarkiv` | Lista laddar, uppladdning fungerar |
| Scoped coordinator → Doris profil | Felbanner "Kunde inte ladda elevinformation"; 403; ingen data |
| Scoped coordinator → `/students` | Omedelbar redirect till `/unauthorized` ("Access Denied") — route guard, före API-anropet |
| Scoped coordinator → Annas profil | Laddar, `Personnummer: Ej angivet` |
| Scoped coordinator → elevlista (via API) | Endast Stockholm-elever. **Doris får inte finnas med** |
| Elev → eget `Filarkiv` | Lista visas |
| Elev → annan elevs profil-URL | Felbanner + 403 |
| Elev → annan elevs dokument-URL | 403, `Du har inte behörighet att komma åt dokumenten` |
| Dokumentlista utan filer | `Inga dokument uppladdade än.` |
| Uppladdning till annan elevs id | 403 `Du har inte behörighet att ladda upp dokument för denna elev` |

### C.5 Network/API steps

```bash
BASE=http://localhost:5010
login () { curl -s -c "/tmp/c_$1.txt" -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$2\",\"password\":\"$3\"}" > /dev/null; }

login admin       admin@mindful.se       'Admin123!'
login coordinator coordinator@mindful.se 'Teacher123!'
login doris       student4@mindful.se    'Student123!'
login anna        student@mindful.se     'Student123!'
login berta       student2@mindful.se    'Student123!'
login teacher     teacher@mindful.se     'Teacher123!'

DORIS_ID=$(curl -s -b /tmp/c_admin.txt $BASE/api/students | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(x=>x.name==="Doris Dahl")._id')
ANNA_ID=$(curl -s -b /tmp/c_admin.txt $BASE/api/students | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(x=>x.name==="Anna Andersson")._id')
echo "Doris (Upplands Bro) = $DORIS_ID ; Anna (Stockholm) = $ANNA_ID"
```

**Test 1 — Admin (global) → 200**

```bash
curl -s -o /dev/null -w 'admin -> Doris docs : %{http_code}\n' -b /tmp/c_admin.txt "$BASE/api/documents/$DORIS_ID"
curl -s -o /dev/null -w 'admin -> Anna docs  : %{http_code}\n' -b /tmp/c_admin.txt "$BASE/api/documents/$ANNA_ID"
# Förväntat: 200 / 200
```

**Test 2 — Scoped coordinator → 403 utanför kommun, 200 inom**

```bash
curl -s -o /dev/null -w 'coordinator -> Doris (Uppl. Bro) : %{http_code}\n' -b /tmp/c_coordinator.txt "$BASE/api/documents/$DORIS_ID"
curl -s -b /tmp/c_coordinator.txt "$BASE/api/documents/$DORIS_ID"; echo
curl -s -o /dev/null -w 'coordinator -> Anna  (Stockholm)  : %{http_code}\n' -b /tmp/c_coordinator.txt "$BASE/api/documents/$ANNA_ID"
# Förväntat: 403 {"message":"Du har inte behörighet att komma åt dokumenten"}  och  200
```

**Test 3 — Kritiskt: bekräfta att spannet faktiskt är aktivt**

Om Test 2 ger `200` för Doris, kontrollera först att scope alls är satt:

```bash
# a) Finns spannet kvar i databasen?
curl -s -b /tmp/c_admin.txt "$BASE/api/users" | grep -o '"email":"coordinator@mindful.se"[^}]*'

# b) Är listan filtrerad? (Detta BÖR fungera — /students går via hasRole.)
curl -s -b /tmp/c_coordinator.txt "$BASE/api/students" \
 | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const a=JSON.parse(d);
     console.log("Antal elever:", a.length);
     a.forEach(s=>console.log("  ", s.name, "|", s.municipality?.type));})'
# Förväntat: Doris Dahl (Upplands Bro) ska INTE finnas med.
```

> ⚠️ Om (b) visar Doris **men** Test 2 gav 200, läs **AV-1** och rapportera det. Om (b) visar Doris alls är kommun-spannet inte sparat — gå tillbaka till [§3.1](#31-sätt-upp-en-kommunbegränsad-personal).

**Test 4 — Elev: eget 200, annans 403**

```bash
curl -s -o /dev/null -w 'doris  -> egna docs  : %{http_code}\n' -b /tmp/c_doris.txt "$BASE/api/documents/$DORIS_ID"
curl -s -o /dev/null -w 'doris  -> Annas docs : %{http_code}\n' -b /tmp/c_doris.txt "$BASE/api/documents/$ANNA_ID"
curl -s -b /tmp/c_doris.txt "$BASE/api/documents/$ANNA_ID"; echo
curl -s -o /dev/null -w 'berta -> Doris docs : %{http_code}\n' -b /tmp/c_berta.txt "$BASE/api/documents/$DORIS_ID"
curl -s -o /dev/null -w 'anna  -> egna docs : %{http_code}\n' -b /tmp/c_anna.txt  "$BASE/api/documents/$ANNA_ID"
# Förväntat: 200 / 403 / 403 / 200
```

**Test 5 — Lärare: egen elev 200**

```bash
curl -s -o /dev/null -w 'teacher (Eva -> Doris) : %{http_code}\n' -b /tmp/c_teacher.txt "$BASE/api/documents/$DORIS_ID"
# Förväntat: 200 (Eva äger Doris i seedet)
# För 403-spåret behövs en andra Teacher-post, vilket seedet inte skapar.
```

**Test 6 — Uppladdning till annan elev (negativ)**

```bash
printf 'probe\n' > /tmp/probe.txt
curl -s -b /tmp/c_doris.txt -X POST "$BASE/api/documents/upload" \
  -F "file=@/tmp/probe.txt" -F "studentId=$ANNA_ID" -F "type=GENERAL" -w '\nHTTP %{http_code}\n'
# Förväntat: HTTP 403  {"message":"Du har inte behörighet att ladda upp dokument för denna elev"}

curl -s -b /tmp/c_coordinator.txt -X POST "$BASE/api/documents/upload" \
  -F "file=@/tmp/probe.txt" -F "studentId=$DORIS_ID" -F "type=GENERAL" -w '\nHTTP %{http_code}\n'
# Förväntat: HTTP 403 för scoped coordinator (Doris ligger i Upplands Bro)
```

**Test 7 — Radering (403 för icke-ägaren)**

```bash
DOC_ID=$(curl -s -b /tmp/c_admin.txt "$BASE/api/documents/$DORIS_ID" | node -pe 'const x=JSON.parse(require("fs").readFileSync(0))[0];print(x?x._id:"")')
curl -s -o /dev/null -w 'doris radera admins fil : %{http_code}\n' -b /tmp/c_doris.txt -X DELETE "$BASE/api/documents/$DOC_ID"
# Förväntat: 403
curl -s -o /dev/null -w 'admin  radera sin fil    : %{http_code}\n' -b /tmp/c_admin.txt -X DELETE "$BASE/api/documents/$DOC_ID"
# Förväntat: 200 {"message":"Raderad"}
```

**Test 8 — Sammanfattande matris**

```bash
printf '%-14s %-16s %-16s\n' "roll" "Doris(UB)" "Anna(Sthlm)"
for r in admin teacher coordinator doris anna; do
  a=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/c_$r.txt "$BASE/api/documents/$DORIS_ID")
  b=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/c_$r.txt "$BASE/api/documents/$ANNA_ID")
  printf '%-14s %-16s %-16s\n' "$r" "$a" "$b"
done
echo
echo "admin=global staff | teacher=Eva (äger båda) | coordinator=scoped till Stockholm"
echo "doris=elev Upplands Bro | anna=elev Stockholm"
echo "Förväntat: admin 200/200 · teacher 200/200 · coordinator 403*/200 · doris 200/403 · anna 403/200"
echo "          (* 200 = AV-1, se avvikelser)"
```

### C.6 Expected pass criteria

**UI**
- Admin: `Filarkiv` laddar för valfri elev, oavsett kommun.
- Scoped coordinator: Doris (Upplands Bro) → felbanner + 403, **aldrig** en full dokumentlista. Anna (Stockholm) → laddar normalt.
- Scoped coordinator: `Elever`-listan innehåller **inte** Doris.
- Elev: eget filarkiv laddar; annan elevs profil-URL ger 403; annan elevs dokument-URL ger 403.

**API**

| Roll | `GET /documents/:id` (Doris) | `GET /documents/:id` (Anna) |
|---|---|---|
| admin / systemadmin | `200` | `200` |
| teacher (äger båda) | `200` | `200` |
| coordinator scoped till Stockholm | **`403`** ⚠️ se AV-1 | `200` |
| student (Doris) | `200` | **`403`** |
| student (Anna) | **`403`** | `200` |
| student (Berta) | **`403`** | `200` |
| ingen autentisering | `401` | `401` |

- `GET /api/students` som scoped coordinator → 200 utan Doris.
- `POST /api/documents/upload` med annan elevs `studentId` → `403`.
- `DELETE /api/documents/:id` av icke-ägaren → `403`.

### C.7 Fail signals

| Signal | Betydelse |
|---|---|
| **403 saknas för annan elev på `/api/documents/:id`** | **Blockerande IDOR** på dokumentlistan |
| **Doris syns i scoped coordinators elevlista** | **Blockerande** — kommun-scope ej applicerat |
| Scoped coordinator ser Doris dokumentlista (200) | **Blockerande** — läs **AV-1** för mekanismen innan du rapporterar |
| Uppladdning till annan elev lyckas (200/201) | **Blockerande** |
| Radering av annans dokument lyckas | **Blockerande** |
| 500 istället för 403 | Fel i `canAccessStudentDocuments` |
| `Document.findOne({filename})`-koppling saknas → 404 för alla nedladdningar | Regression från B-fixen |
| Anna saknar `Filarkiv`-flik | **Förväntat** om du inte kört §3.2 — inte ett fel |
| Felmeddelandet är en `alert()`-dialog | Regression — ska vara in-page-banner/toast |

---

## D. Meddelanden — inget personnummer

### D.1 Goal

Konversationslistan ska aldrig innehålla en elevs personnummer — varken för admin eller för någon annan roll. Identiteten ska representeras med namn.

### D.2 Preconditions

- **Roll:** `admin` (och gärna `teacher` för jämförelse)
- **Data:** ⚠️ **Inga konversationer seedas.** Du måste skapa en — se D-3.
- **DevTools:** Network → Fetch/XHR. Titta på `GET /api/conversations`.
- **Krav på eleven:** använd Anna Andersson (`19900101-1234`) så att personnumret är entydigt identifierbart i svaret.

### D.3 UI steps

#### D-1 · Skapa en konversation länkad till en elev

1. Logga in som `admin@mindful.se`.
2. Klicka på **Meddelanden**-bubblan i topbaren (eller hamburgaren → **Meddelanden**) → `/messages`.
3. Sidan visar en lista till vänster med sökfältet **"Sök konversation…"**.
   - Tomt läge: `Inga konversationer hittades.`
   - Laddar: `Laddar konversationer…`
4. Klicka på **Ny konversation** uppe till höger.
5. I dialogen: fältet **Mottagare** — sök på `student@mindful.se` (eller "Anna"). Sökfältets placeholder är **"Sök på namn eller e-post…"**.
6. Välj **Anna Andersson**.
7. **Ämne:** skriv `P15 Verifiering`.
8. **Meddelande:** skriv `Hej Anna, detta är ett P15-testmeddelande.`
9. Klicka **Skicka** (knappen blir **Skickar…** under anropet).
10. Dialogen stängs och den nya tråden visas i listan med ämnet `P15 Verifiering`.
11. **Klicka på tråden för att öppna den.**

#### D-2 · Inspektera trådens header

1. I trådens header (toppen av högra panelen) ser du:
   - En ikon
   - **Trådens titel** — elevens namn, hämtad ur `studentId.name` (`MessagingView.vue:422-427`)
   - Ett chip med texten **"Elev: Anna Andersson"** (`MessagingView.vue:76-83`)
   - Under det: ämnet och tidsstämpeln
2. **Läs header noga.** Det får **inte** finnas någon 10–13 siffrig sifferserie.
3. Scrolla genom hela meddelandet. Inget personnummer någonstans.

#### D-3 · Skicka ett svar och verifiera att tråden uppdateras

1. Skriv i fältet **"Skriv ett meddelande…"** längst ner: `Tack, mötet bokas inom kort.`
2. Klicka **Skicka** (eller tryck Enter).
3. Din bubbla ska dyka upp direkt i tråden (optimistisk rendering) med tidsstämpel och **Skickat**.
4. Inspektera: `POST /api/messages` → **201** `{…}`.
5. Bekräfta att trådens förhandsvisning i listan uppdateras till den nya texten.

#### D-4 · Verifiera den rå payloaden (det viktigaste steget)

1. DevTools → Network → `GET /api/conversations`.
2. Öppna **Response**.
3. Leta upp posten vars `subject` är `P15 Verifiering`.
4. Expandera `studentId`:

```json
{
  "_id": "…",
  "participants": [ { "userId": "…", "name": "Mindful Admin", "email": "admin@mindful.se", "roles": ["admin"] } ],
  "studentId": {
    "_id": "…",
    "name": "Anna Andersson"
  },
  "subject": "P15 Verifiering",
  "lastMessageAt": "…"
}
```

5. **`studentId` ska ha exakt två nycklar: `_id` och `name`.** Om du ser `personalNumber`, `email`, `phone` eller något annat där → **fail**.
6. Samma sak för `participants`: får **inte** innehålla `municipalities`.

#### D-5 · Sök bevis på läckor över hela svaret

Klistra in i **Console** (du är inloggad som admin):

```js
const r = await fetch('/api/conversations', { credentials: 'include' });
const raw = await r.text();
// 1) Finns personnumret någonstans i hela svaret?
console.log('personnummer i svaret:', raw.includes('19900101-1234') ? 'LÄCKA ❌' : 'saknas ✅');
// 2) Vilka nycklar har studentId?
const convs = JSON.parse(raw);
convs.forEach(c => console.log('studentId-nycklar:', c.studentId ? Object.keys(c.studentId) : null));
// 3) Vilka nycklar har participants[0]?
console.log('participant-nycklar:', Object.keys(convs[0]?.participants?.[0] ?? {}));
```

**Förväntat utdata:**

```
personnummer i svaret: saknas ✅
studentId-nycklar: [ '_id', 'name' ]
participant-nycklar: [ 'userId', 'name', 'email', 'roles' ]
```

#### D-6 · Jämför som lärare

1. Logga ut, logga in som `teacher@mindful.se`.
2. Öppna **Meddelanden**. Läraren ser inte tråden (om hen inte är deltagare) — det är korrekt, konversationer filtreras på `participants`.
3. För att kunna jämföra: låt admin lägga till läraren som mottagare när du skapar tråden.
4. Upprepa D-5 som lärare. Samma förväntan.

### D.4 What to look at in the UI

| Yta | Förväntat |
|---|---|
| Tom konversationslista | `Inga konversationer hittades.` |
| Laddar | `Laddar konversationer…` |
| Trådlista | Avatar-initialler, namn, `d.m.yyyy`-tidsstämpel, ämne (eller `Inget ämne`), 50-teckens förhandsvisning (eller `Inga meddelanden ännu`), oläst-badge |
| Trådens header | **Elev: Anna Andersson** — inget personnummer |
| Sökning | `Sök konversation…` |
| Ny konversation | `Mottagare` / `Ämne (valfritt)` / `Meddelande`, knapparna `Avbryt` och `Skicka` |
| Meddelandefält | `Skriv ett meddelande…`, knapp `Skicka` |
| Bubbla | Tid i `sv-SE`-format, `Skickat` / `Läst` |
| Äldre meddelanden | `Ladda äldre meddelanden` |
| Fel | Röd, dismissbar banner överst (`MessagingView.vue:10-13`) — **aldrig** `alert()` |

**Sök även efter läckor i DOM:en.** Ctrl+F i DevTools-källan efter `19900101` — det får inte finnas någonstans i den renderade sidan.

### D.5 Network/API steps

```bash
BASE=http://localhost:5010
login () { curl -s -c "/tmp/c_$1.txt" -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$2\",\"password\":\"$3\"}" > /dev/null; }
login admin   admin@mindful.se   'Admin123!'
login teacher teacher@mindful.se 'Teacher123!'
login anna    student@mindful.se 'Student123!'

ANNA_USER_ID=$(curl -s -b /tmp/c_admin.txt $BASE/api/users | node -pe 'const u=JSON.parse(require("fs").readFileSync(0)).find(x=>x.email==="student@mindful.se");print(u._id||u.userId)')
ANNA_STUDENT_ID=$(curl -s -b /tmp/c_admin.txt $BASE/api/students | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(x=>x.name==="Anna Andersson")._id')
echo "userId=$ANNA_USER_ID  studentId=$ANNA_STUDENT_ID"
```

**Test 1 — Skapa konversationen via API (snabbare än UI:t)**

```bash
curl -s -b /tmp/c_admin.txt -X POST $BASE/api/messages \
  -H 'Content-Type: application/json' \
  -d "{\"participantIds\":[\"$ANNA_USER_ID\"],\"studentId\":\"$ANNA_STUDENT_ID\",\"subject\":\"P15 Verifiering\",\"body\":\"Hej Anna, detta är ett P15-testmeddelande.\"}" \
  -w '\nHTTP %{http_code}\n'
# Förväntat: HTTP 201
```

**Test 2 — Nyckeln i `studentId` (kärnkontrollen)**

```bash
curl -s -b /tmp/c_admin.txt $BASE/api/conversations | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const convs = JSON.parse(d);
  const c = convs.find(x => x.subject === "P15 Verifiering");
  if (!c) { console.log("Hittade ingen tråd"); process.exit(1); }
  console.log("studentId-nycklar :", Object.keys(c.studentId ?? {}));
  console.log("studentId         :", JSON.stringify(c.studentId));
  console.log("participant[0]    :", Object.keys(c.participants?.[0] ?? {}));
  const bad = Object.keys(c.studentId ?? {}).filter(k => k !== "_id" && k !== "name");
  console.log(bad.length ? "FAIL: extra nycklar " + bad : "PASS: endast _id + name");
});'
```

**Test 3 — Råtextsökning i hela svaret**

```bash
RAW=$(curl -s -b /tmp/c_admin.txt $BASE/api/conversations)
echo "$RAW" | grep -q '19900101-1234'   && echo "FAIL: personnummer i /conversations"  || echo "PASS: inget personnummer"
echo "$RAW" | grep -q 'personalNumber'   && echo "FAIL: nyckeln personalNumber finns"   || echo "PASS: nyckeln personalNumber saknas"
echo "$RAW" | grep -q 'municipalities'   && echo "OBS: municipalities finns kvar"        || echo "PASS: municipalities borttaget"
```

**Test 4 — Samma kontroll som elev**

```bash
curl -s -b /tmp/c_anna.txt $BASE/api/conversations | grep -q '19900101-1234' \
  && echo "FAIL: elev ser sitt personnummer" || echo "PASS: elev ser inget personnummer"
```

**Test 5 — Övriga messaging-endpoints (inga PII-läckor)**

```bash
for ep in "$BASE/api/conversations" "$BASE/api/unread-count" "$BASE/api/recipients"; do
  out=$(curl -s -b /tmp/c_admin.txt "$ep")
  echo "$ep  ->  $(echo "$out" | grep -q '19900101-1234' && echo 'LÄCKA ❌' || echo 'ren ✅')"
done
```

**Test 6 — Skicka och verifiera**

```bash
CONV_ID=$(curl -s -b /tmp/c_admin.txt $BASE/api/conversations | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(x=>x.subject==="P15 Verifiering")._id')

curl -s -b /tmp/c_admin.txt -X POST $BASE/api/messages \
  -H 'Content-Type: application/json' \
  -d "{\"conversationId\":\"$CONV_ID\",\"body\":\"Tack, mötet bokas inom kort.\"}" -w '\nHTTP %{http_code}\n'
# Förväntat: HTTP 201

curl -s -b /tmp/c_admin.txt "$BASE/api/conversations/$CONV_ID/messages?limit=10" \
 | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const m=JSON.parse(d).messages;
     console.log("antal meddelanden:", m.length);
     m.forEach(x=>console.log("  ", x.senderId, "|", x.body));})'
# Förväntat: 2 meddelanden, dina båda texter
```

**Test 7 — Tomt meddelande → 400**

```bash
curl -s -o /dev/null -w 'tomt meddelande -> %{http_code}\n' -b /tmp/c_admin.txt -X POST $BASE/api/messages \
  -H 'Content-Type: application/json' -d "{\"conversationId\":\"$CONV_ID\",\"body\":\"   \"}"
# Förväntat: 400  {"message":"Meddelandetexten får inte vara tom"}
```

**Test 8 — Andras konversation → 404**

```bash
curl -s -o /dev/null -w 'icke-deltagare läser tråd -> %{http_code}\n' -b /tmp/c_teacher.txt "$BASE/api/conversations/$CONV_ID/messages"
# Förväntat: 404  {"message":"Konversationen hittades inte eller så har du inte tillgång till den"}
```

**Test 9 — Flaggan (se även E)**

```bash
curl -s $BASE/api/features | node -pe 'JSON.parse(require("fs").readFileSync(0)).MESSAGING'
# Förväntat: true
```

### D.6 Expected pass criteria

**UI**
- Ny konversation kan skapas och visas i listan.
- Trådens header visar **Elev: Anna Andersson** — inget personnummer.
- Inget meddelandetext innehåller personnumret.
- Skicka uppdaterar tråden direkt (optimistisk bubbla) och listans förhandsvisning.
- `Ctrl+F` i DevTools hittar ingen `19900101`.

**API**
- `GET /api/conversations` → `studentId` har **exakt** `["_id","name"]`.
- `participants[]` har inga `municipalities`.
- Hela svaret innehåller varken `19900101-1234` eller nyckeln `personalNumber`.
- `GET /api/unread-count` och `GET /api/recipients` är PII-fria.
- `POST /api/messages` → 201; tom body → 400; konversation du inte deltar i → 404.
- Samma resultat oavsett roll (admin, lärare, elev).

### D.7 Fail signals

| Signal | Betydelse |
|---|---|
| `studentId.personalNumber` i svaret | **Blockerande** — PII-läcka |
| `personalNumber` någonstans i `/conversations` | **Blockerande** |
| Personnummer syns i trådens header eller i UI:t | **Blockerande** |
| `participants[].municipalities` finns kvar | Läcka — kommun-span läcker (lägre allvarlighetsgrad) |
| `POST /api/messages` → 500 istället för 201 | Regression i `sendMessage` efter refaktorn |
| Konversation försvinner ur listan efter att ha skickats | Regression — `getConversations`-filtrering/paginering |
| Lärare ser trådar hen inte deltar i | **IDOR** — kontrollera `participants`-filtret |
| Du kan läsa en konversation du inte deltar i via `GET /conversations/:id/messages` | **Blockerande IDOR** |
| `alert()` vid fel i Meddelanden | Regression — ska vara röd banner |

---

## E. Feature flags

### E.1 Goal

En avstängd feature flag ska stänga av hela modulen serverled med ett entydigt 404-svar, exponera aktuellt flaggläge via en publik endpoint, och kunja slås på igen utan dataförlust.

### E.2 Preconditions

- **Roll:** `admin` (för UI), ingen autentisering behövs för `/api/features`.
- **Redigeringsrätt:** du måste kunna ändra `backend/.env.development`.
- **Kommandon:** `Ctrl+C` och omstart av backend.
- **Bakgrund:** `FEATURE_FLAGS` fryses vid import, men både `isFeatureEnabled()` och `GET /api/features` läser `process.env` vid anrop — **processen måste ändå startas om** för att plocka upp ett nytt `.env`-värde.

### E.3 UI steps

#### E-1 · Defaults ON

1. Logga in som `admin@mindful.se`.
2. Hamburgaren → öppna och bekräfta att följande laddar **utan** felbanner:
   - **Meddelanden** (`/messages`)
   - **Vanliga frågor (Chatbot)** (`/admin/chatbot-faq`)
   - **Intyg & Diplom** (`/admin/certificates`) — flikar: **Inställningar · Mallar · Förhandsvisning · Godkänn & generera · Historik**
3. Sök i hamburgermen efter `Frågebank` — den finns för admin (admin ser allt i menyn).

#### E-2 · Stäng av MESSAGING

1. Stoppa backend: `Ctrl+C`.
2. Öppna `backend/.env.development` och lägg till eller ändra:
   ```bash
   FEATURE_MESSAGING=false
   ```
   > Flaggnamn är `FEATURE_` + nyckeln i versaler: `MESSAGING`, `CERTIFICATES`, `FAQ`, `LMS`, `APL`, `PROVNINGAR`, `INACTIVITY`, `ANALYTICS`, `QUESTION_BANK`, `ACTION_PLANS`, `APPOINTMENTS`.
3. Starta om backend.
4. Verifiera flaggan direkt:
   ```bash
   curl -s http://localhost:5010/api/features | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const f=JSON.parse(d);console.log("MESSAGING =",f.MESSAGING);console.log("FAQ       =",f.FAQ);})'
   # Förväntat: MESSAGING = false    FAQ = true
   ```
5. Uppdatera sidan (hard refresh, `Ctrl+Shift+R`).
6. **Klicka på Meddelanden** i hamburgarmen (eller bubblan i topbaren).
7. **Förväntat observerat beteende:**
   - `GET /api/conversations` → **404** `{"success":false,"error":{"message":"Feature not available"}}`
   - Sidan visar fel-/tomt läge, **aldrig** en lista med konversationer
   - **Menynyckeln `Meddelanden` är kvar** — läs **AV-4**
8. Inspektera Network → alla fyra messaging-anrop ska svara 404: `GET /api/conversations`, `GET /api/unread-count`, `GET /api/recipients`, och `POST /api/messages`.

#### E-3 · Stäng av flera moduler samtidigt (valfritt men rekommenderat)

Lägg till i `.env.development`:

```bash
FEATURE_MESSAGING=false
FEATURE_CERTIFICATES=false
FEATURE_FAQ=false
```

Starta om och verifiera:

```bash
curl -s http://localhost:5010/api/features
curl -s -o /dev/null -w 'conversations -> %{http_code}\n' -b /tmp/c_admin.txt http://localhost:5010/api/conversations
curl -s -o /dev/null -w 'cert settings -> %{http_code}\n' -b /tmp/c_admin.txt http://localhost:5010/api/certificates/settings
curl -s -o /dev/null -w 'faq categor.  -> %{http_code}\n' -b /tmp/c_admin.txt http://localhost:5010/api/chatbot/faq/categories
# Förväntat: 404 / 404 / 404
```

Kontrollera att **inte-flaggade** moduler fortfarande fungerar:

```bash
curl -s -o /dev/null -w 'students     -> %{http_code}\n' -b /tmp/c_admin.txt http://localhost:5010/api/students
curl -s -o /dev/null -w 'features     -> %{http_code}\n' http://localhost:5010/api/features
# Förväntat: 200 / 200
```

#### E-4 · Återställ och bekräfta recovery

1. Ta bort alla `FEATURE_*`-rader ur `backend/.env.development` (eller sätt dem till `true`).
2. Starta om backend.
3. Verifiera att inga flaggor är avstängda:

   ```bash
   curl -s http://localhost:5010/api/features | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const f=JSON.parse(d);
     const off=Object.entries(f).filter(([,v])=>!v);
     console.log(off.length? "AVSTÄNGDA: "+JSON.stringify(off) : "Alla 11 flaggor ON ✅");})'
   ```

   **Förväntat:** `Alla 11 flaggor ON ✅`
4. Gå till **Meddelanden** → tråden från D finns kvar och är läsbar.
5. Skicka ett meddelande → det går igenom igen.

### E.4 What to look at in the UI

| Situation | Förväntat |
|---|---|
| Defaults ON, `/messages` | Lista med trådar, sökfält `Sök konversation…` |
| Defaults ON, `/admin/certificates` | Flikarna **Inställningar / Mallar / Förhandsvisning / Godkänn & generera / Historik** laddar |
| Defaults ON, `/admin/chatbot-faq` | FAQ-lista laddar |
| `MESSAGING=false`, klicka Meddelanden | **404 i Network.** Fel-/tomt läge i UI. Ingen konversationslista |
| `MESSAGING=false`, bubblan i topbaren | Leder till samma fel-läge (se AV-4) |
| `MESSAGING=false`, menynyckeln | **Kvar** (se AV-4) |
| `CERTIFICATES=false`, `/admin/certificates` | 404, felbanner (`v-alert type="error"`) |
| Alla defaults ON igen | Allt fungerar, inga kvarstående fel |
| Konversationer efter återställning | Dina trådar finns kvar — **ingen dataförlust** |

### E.5 Network/API steps

```bash
BASE=http://localhost:5010
```

**Steg 1: defaults (inget inloggning behövs — endpointen är publik)**

```bash
curl -s $BASE/api/features
```

**Förväntat (defaults ON):**

```json
{ "MESSAGING": true, "CERTIFICATES": true, "FAQ": true, "LMS": true, "APL": true,
  "PROVNINGAR": true, "INACTIVITY": true, "ANALYTICS": true, "QUESTION_BANK": true,
  "ACTION_PLANS": true, "APPOINTMENTS": true }
```

**Kontrollera svarsform och innehåll:**

```bash
curl -s $BASE/api/features | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const f=JSON.parse(d);
  const expected=["MESSAGING","CERTIFICATES","FAQ","LMS","APL","PROVNINGAR","INACTIVITY","ANALYTICS","QUESTION_BANK","ACTION_PLANS","APPOINTMENTS"];
  console.log("antal nycklar :", Object.keys(f).length, expected.length===Object.keys(f).length ? "✅" : "❌");
  console.log("saknas        :", expected.filter(k=>!(k in f)));
  console.log("extra         :", Object.keys(f).filter(k=>!expected.includes(k)));
  console.log("avstängda     :", Object.entries(f).filter(([,v])=>v===false).map(([k])=>k));
});'
```

**Steg 2: stäng av och verifiera 404 per modul**

```bash
# Kör med FEATURE_MESSAGING=false
for ep in /api/conversations /api/messages /api/unread-count /api/recipients; do
  printf '%-28s %s\n' "$ep" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/c_admin.txt "$BASE$ep")"
done
# Förväntat: alla 404

echo
echo "Flaggad modul 404-svar:"
curl -s -b /tmp/c_admin.txt $BASE/api/conversations; echo
# Förväntat: {"success":false,"error":{"message":"Feature not available"}}
```

**Steg 3: skilj på "feature av" och "route finns inte"**

```bash
# Befintlig route (404 med "Feature not available")
curl -s $BASE/api/conversations; echo
# Ej befintlig route (404 med "Route not found")
curl -s $BASE/api/this-route-does-not-exist; echo
```

| | Meddelande | Värde |
|---|---|---|
| Feature avstängd | `Feature not available` | `{"success":false,"error":{"message":"Feature not available"}}` |
| Route finns inte | `Route not found` | `{"success":false,"error":{"message":"Route not found"}}` |

> Detta är en bra positiv/negativ kontroll: båda är 404, men **meddelandena skiljer dem åt**. Använd detta för att bevisa att det är flaggan som stänger av, inte en trasig route.

**Steg 4: alla flaggade moduler**

```bash
check () { printf '%-42s %s\n' "$1" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/c_admin.txt "$BASE$2")"; }

# Med respektive FEATURE_* satta till false. NB: varje path nedan är en FAKTISK
# sub-route — att slå på själva mount-prefixet ger "Route not found" även när
# flaggan är ON, vilket skulle ge en falsk träff.
check "MESSAGING     /conversations"                    /api/conversations
check "CERTIFICATES  /certificates/settings"            /api/certificates/settings
check "FAQ           /chatbot/faq/categories"            /api/chatbot/faq/categories
check "LMS           /learning/submissions/pending"     /api/learning/submissions/pending
check "PROVNINGAR    /exams"                            /api/exams
check "INACTIVITY    /report"                           /api/inactivity/report
check "ANALYTICS     /filters"                          /api/analytics/filters
check "QUESTION_BANK /question-bank/"                   /api/question-bank/
check "ACTION_PLANS  /actionplans/:id"                  /api/actionplans/$ANNA_ID
check "APPOINTMENTS  /meetings"                         /api/meetings
# Förväntat: alla 404

# Kontroll: när flaggan är ON ska samma paths svara 403/200, ALDRIG 404.
# Kör om blocket ovan med defaults och jämför rad för rad.
```

**Steg 5: stödflöden (ej flaggade → ska alltid fungera)**

```bash
BASE=http://localhost:5010
curl -s -c /tmp/c_admin.txt -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@mindful.se","password":"Admin123!"}' -o /dev/null
ANNA_ID=$(curl -s -b /tmp/c_admin.txt $BASE/api/students \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(x=>x.name==="Anna Andersson")._id')

check () { printf '%-42s %s\n' "$1" "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/c_admin.txt "$BASE$2")"; }
check "students      /students"          /api/students           # 200
check "features      /features"          /api/features           # 200
check "documents     /documents/:id"     /api/documents/$ANNA_ID # 200
check "messages      /messages"          /api/messages           # 200 (skicka) / 404 om MESSAGING=false
```

**Steg 6: env-parsegning (bra driftdokumentation)**

| Värde i `.env` | Resultat |
|---|---|
| `FEATURE_MESSAGING=false` | `false` |
| `FEATURE_MESSAGING=0` | `false` |
| `FEATURE_MESSAGING=NO` | `false` |
| `FEATURE_MESSAGING=off` | `false` |
| `FEATURE_MESSAGING=true` / `1` / `yes` / `on` | `true` |
| `FEATURE_MESSAGING=` (tomt) | `true` |
| Raden saknas helt | `true` (fail-open) |
| `FEATURE_MESSAGING=banan` | `true` ⚠️ stavfel ger tyst fail-open |

### E.6 Expected pass criteria

**UI**
- Med defaults: **Meddelanden**, **Vanliga frågor (Chatbot)** och **Intyg & Diplom** laddar utan fel.
- Med `FEATURE_MESSAGING=false`: `/messages` visar fel-/tomt läge, `GET /api/conversations` är 404, ingen konversationslista visas. Se AV-4 för menynyckeln.
- Efter återställning: allt fungerar, konversationerna finns kvar.

**API**
- `GET /api/features` → 200 utan autentisering, exakt 11 nycklar, alla `true` som default.
- `GET /api/conversations` → 404 `{"success":false,"error":{"message":"Feature not available"}}` när `MESSAGING=false`.
- Samma 404 för `/messages`, `/unread-count`, `/recipients`.
- Okända 404:ar har meddelandet `Route not found` — **inte** `Feature not available`.
- `GET /api/features` fungerar fortfarande när andra moduler är avstängda.
- Ej flaggade moduler (`/api/students`, `/api/documents`) påverkas inte.

### E.7 Fail signals

| Signal | Betydelse |
|---|---|
| `GET /api/conversations` → 200 när `MESSAGING=false` | **Blockerande** — flaggan appliceras inte |
| `/messages` visar konversationslistan när flaggan är av | **Blockerande** |
| `GET /api/features` kräver autentisering → 401 | Regression — endpointen är avsiktligt publik |
| `GET /api/features` → 404 | Regression — route registreras först av alla |
| Felaktigt antal nycklar (t.ex. 10 eller 12) | Regression — `FEATURE_KEYS` ändrad utan avsedd effekt |
| `/api/students` → 404 när `MESSAGING=false` | Kollateral skada — fel modul avstängd |
| `429` från rate limiter | Se 0.2. I development är gränserna generösa |
| Konversationer försvinner efter återställning | **Datakonsekvens-fel** — data gick förlorad |
| `404` med `Route not found` för `/conversations` | Betyder att routingen är trasig, inte att flaggan är av. Kontrollera backendloggen |

---

## F. Inaktivitet / utloggning och avslutande regression

### F.1 Goal

Sessionen ska sitta, logout ska rensa allt på både server- och klientsida, ingen inloggad data får läcka till nästa användare i samma webbläsarprofil, och `INACTIVITY`-modulen ska stängas av och på korrekt.

### F.2 Preconditions

- **Roll:** `admin`, `teacher` och `student` (två olika fönster)
- **Inaktivitetsflagga:** `FEATURE_INACTIVITY` default `true`. Sätt till `false` för att verifiera 404-spåret.
- **DevTools:** Network → Fetch/XHR, `Preserve log` **påslaget** så att logout-anropet inte försvinner vid navigation.
- **Att veta:** `INACTIVITY` gäller *elever*, inte sessioner. JWT-livslängd är 7 dygn; det finns ingen idle-logout (**AV-8**).

### F.3 UI steps

#### F-1 · Logga in och verifiera att sessionen sätter

1. Logga in som `admin@mindful.se`.
2. Uppdatera sidan (hard refresh).
3. **Förväntat:** du är **fortfarande inloggad**. Applikationen ska komma ihåg dig via `sessionStorage`/cookie.
4. Inspektera: DevTools → Application → Cookies → se `token` med `path=/`.
5. DevTools → Network → `GET /api/auth/session` → **200** med `role: "admin"`.

#### F-2 · Utloggning rensar allt

1. Klicka på **Logga ut** (avatar-meny längst upp till höger → **Logga ut**, eller direkt i hamburgermen).
2. **Förväntat:** omdirigering till `/login`.
3. Inspektera DevTools → Network → `POST /api/auth/logout` → **200** `{"message":"Logout successful"}`.
4. Verifiera att auth-cookien är borttagen: DevTools → Application → Cookies → `token` ska **inte** finnas kvar.
5. **Ladda om sidan manuellt** (`Ctrl+R` på `/login`).
6. **Förväntat:** du hamnar på `/login`, **inte** inne i en autentiserad vy.

> ⚠️ Om F-2 steg 5 visar att du är inloggad efter manuell omladdning → **regression på session-clearing**. Logout måste rensa både backend-cookien och frontend-storage.

#### F-3 · Data läcker inte till nästa användare

1. Lämna `/login` öppet.
2. **Byt till elevfönstret**, logga in som `student@mindful.se`.
3. Gå till `http://localhost:5173/student/<ANNA_ID>` och notera att Annas uppgifter visas.
4. Nu: gå tillbaka till adminfönstret. Logga ut, logga in som `teacher@mindful.se`.
5. Gå till **Elever** → **Anna Andersson**.
6. **Förväntat:** du ser **Elev**-vyn, **inte** elevens egen inloggning. Annas `Personnummer: Ej angivet` (P15 — se A-5), inte hennes personnummer.
7. Inspektera DOM: Ctrl+F efter `19900101-1234` — ska inte finnas.
8. **Förväntat:** ingen kvarvarande data från elevsessionen.

#### F-4 · `INACTIVITY` är en *elev*-rapport, inte en session-timeout

> ⚠️ **Vanlig missuppfattning.** `INACTIVITY`-flaggan styr **inte** utloggning efter inaktivitet. Den styr *inaktivitetsspårning av elever*: en rapport, ett schemalagt scan och utskick av påminnelse-mejl. Det finns **ingen** client-side idle-timer i frontend (`frontend/src/` innehåller ingen session-manager) och JWT gäller i **7 dygn** (`authController.js:102`). Se **AV-8**.

1. Logga in som `admin@mindful.se`.
2. Hamburgaren → **Inaktivitetsrapport** (`/admin/inactivity`) — rollen `admin`, `systemadmin` eller `teacher`.
3. **Förväntat:** rapporten laddar med en lista över inaktiva elever, kolumner som `Elev`, `Sista inloggning`, `Dagar inaktiv`.
4. Inspektera: `GET /api/inactivity/report` → **200** med array.
5. Gå till **Inaktiva elever** (`/inaktiva-elever`) — bara `admin`/`systemadmin`. Laddar utan fel.
6. Med `FEATURE_INACTIVITY=false` (starta om backend):
   ```bash
   curl -s -o /dev/null -w 'inactivity report -> %{http_code}\n' -b /tmp/c_admin.txt http://localhost:5010/api/inactivity/report
   curl -s -b /tmp/c_admin.txt http://localhost:5010/api/inactivity/report; echo
   # Förväntat: 404  {"success":false,"error":{"message":"Feature not available"}}
   ```
7. `/admin/inactivity` i UI:t ska nu visa felbanner. Lärarens menylänk ska vara kvar (**AV-4**).
8. Återställ flaggan och bekräfta att rapporten laddar igen.

#### F-5 · Felaktig inloggning hanteras

1. Gå till `/login`.
2. Ange `admin@mindful.se` med fel lösenord (`Wrong123!`).
3. **Förväntat:** röd felbanner med texten **Fel email eller lösenord** (in-page, inte `alert()`).
4. Inspektera: `POST /api/auth/login` → **401** `{"error":"Fel email eller lösenord"}`.
5. Prova igen med rätt lösenord → **200** och redirect till `/dashboard` eller `/`.

### F.4 What to look at in the UI

| Situation | Förväntat |
|---|---|
| Hard refresh på autentiserad vy | Fortfarande inloggad |
| `GET /api/auth/session` | 200 med korrekt roll |
| Klick **Logga ut** | Redirect till `/login` |
| `POST /api/auth/logout` | 200 `{"message":"Logout successful"}` |
| Auth-cookie efter logout | Borttagen |
| Manuell omladdning efter logout | Stannar på `/login` |
| Byte från elev till lärare | Ingen kvarvarande PII från förra sessionen |
| `/admin/inactivity` (ON) | Rapport laddar: `Elev`, `Sista inloggning`, `Dagar inaktiv` |
| `/inaktiva-elever` (ON) | Laddar utan fel (endast admin/systemadmin i menyn) |
| `FEATURE_INACTIVITY=false` | `/api/inactivity/report` → 404, UI visar felbanner |
| `FEATURE_INACTIVITY=false`, elevlista | `/inaktiva-elever` visas **inte** fel — kontrollera att bara rapporten är avstängd |
| `INACTIVITY` återställd | Rapporten laddar igen utan dataförlust |
| Fel lösenord | Röd in-page banner med **Fel email eller lösenord**, inte `alert()` |
| Rätt uppgifter efter fel | Loggar in normalt |

### F.5 Network/API steps

```bash
BASE=http://localhost:5010
login () { curl -s -c "/tmp/c_$1.txt" -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$2\",\"password\":\"$3\"}" > /dev/null; }
login admin   admin@mindful.se   'Admin123!'
login teacher teacher@mindful.se 'Teacher123!'
login anna    student@mindful.se 'Student123!'
```

**Test 1 — Session uthämtar inloggad användare**

```bash
curl -s -b /tmp/c_admin.txt $BASE/api/auth/session | node -pe 'const u=JSON.parse(require("fs").readFileSync(0));u.role'
# Förväntat: admin
```

**Test 2 — Utan session → 401**

```bash
curl -s -o /dev/null -w 'ingen cookie -> %{http_code}\n' $BASE/api/auth/session
# Förväntat: 401
```

**Test 3 — Logout**

```bash
curl -s -o /dev/null -w 'logout -> %{http_code}\n' -b /tmp/c_admin.txt -X POST $BASE/api/auth/logout
curl -s -b /tmp/c_admin.txt -X POST $BASE/api/auth/logout; echo
# Förväntat: 200  {"message":"Logout successful"}

# Efter logout ska samma cookie inte längre ge 200 på /session
curl -s -o /dev/null -w 'session efter logout -> %{http_code}\n' -b /tmp/c_admin.txt $BASE/api/auth/session
# Förväntat: 401
```

**Test 4 — Fel lösenord**

```bash
curl -s -o /dev/null -w 'fel lösenord -> %{http_code}\n' -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"admin@mindful.se","password":"Wrong123!"}'
curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@mindful.se","password":"Wrong123!"}'; echo
# Förväntat: 401  {"error":"Fel email eller lösenord"}
```

**Test 5 — Session efter logout med gammal cookie**

```bash
curl -s -o /dev/null -w 'gammal cookie -> %{http_code}\n' -b /tmp/c_admin.txt $BASE/api/auth/session
# Förväntat: 401 (regression om 200)
```

**Test 6 — Snabbmatris**

```bash
printf '%-28s %s\n' "session (inloggad)"  "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/c_teacher.txt $BASE/api/auth/session)"
printf '%-28s %s\n' "session (ingen)"    "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/auth/session)"
printf '%-28s %s\n' "logout"             "$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/c_anna.txt -X POST $BASE/api/auth/logout)"
# Förväntat: 200 / 401 / 200
```

### F.6 Expected pass criteria

**UI**
- Hard refresh på autentiserad vy → fortfarande inloggad.
- Klick **Logga ut** → redirect till `/login`, cookie borttagen, manuell omladdning stannar på `/login`.
- Byte från elev till lärare → ingen kvarvarande PII från förra sessionen i DOM eller API-svar.
- `/admin/inactivity` laddar rapporten när flaggan är ON; felbanner + 404 när den är OFF; återställning fungerar utan dataförlust.
- Fel lösenord → röd in-page banner (aldrig `alert()`), `POST /api/auth/login` → 401.

**API**
- `GET /api/auth/session` → 200 med korrekt roll; → 401 utan cookie.
- `POST /api/auth/logout` → 200 `{"message":"Logout successful"}`.
- Samma cookie efter logout → `401` på `/api/auth/session`.
- `POST /api/auth/login` med fel lösenord → `401` `{"error":"Fel email eller lösenord"}`.
- `GET /api/inactivity/report` → 200 med ON, `404 {"success":false,"error":{"message":"Feature not available"}}` med OFF.

### F.7 Fail signals

| Signal | Betydelse |
|---|---|
| `GET /api/auth/session` → 200 efter logout | **Blockerande** — sessionen rensas inte |
| Manuell omladdning efter logout visar autentiserad vy | **Blockerande** — frontend-caching fel |
| `POST /api/auth/logout` saknas i Network | **Blockerande** — frontend anropar inte logout (`store/store.js:171`) |
| Auth-cookie finns kvar efter logout | **Blockerande** — `clearAuthCookie` fungerar inte |
| `POST /api/auth/login` → 500 vid fel lösenord | Regression — kasta inte felet som 500 |
| Personnummer syns efter session-byte | **PII-läcka** — state läcks mellan sessioner |
| `alert()` vid inloggningsfel | Regression — ska vara in-page banner |
| `GET /api/inactivity/report` → 200 när flaggan är OFF | Regression — `requireFeature("INACTIVITY")` saknas |
| `/inaktiva-elever` → 404 när bara `INACTIVITY` stängs av | Acceptabelt — samma modul, samma flagga |
| `POST /api/auth/login` → 200 med fel lösenord | **Blockerande** — autentiseringen är trasig |

---

## 11. Sign-off checklist

Kör alla kontroller innan du skriver "Klart". Bocka av varje rad. Sign-off är **inte** klar om någon blockerande rad är obockad.

### A — P15 / dataskydd

| # | Kontroll | Förväntat | Block | Status |
|---|---|---|---|---|
| A-1 | Admin ser personnummer för alla elever | Ja | Nej | ☐ |
| A-2 | Lärare ser personnummer för egna elever | Ja | Nej | ☐ |
| A-3 | Lärare ser **inte** korten `Stödkontakter`/`Avvikelser` | Nej — *API ger nu 403, men `GeneralTab.vue` saknar `v-if` på korten* | **Ja** | ☐ |
| A-4 | Lärare ser `Specialbehov` + `Provlokal-anpassningar` | Ja | Nej | ☐ |
| A-5 | Lärare ser kortet `Kommentarer` | Ja | Nej | ☐ |
| A-6 | Lärare ser **inte** kortet `Ändringshistorik` | Ja | Nej | ☐ |
| A-7 | Coordinator ser **inget** PII i huvud-payloaden | Ja | Ja | ☐ |
| A-8 | Coordinator ser **inte** korten `Stödkontakter`/`Avvikelser` | Nej — *API ger nu 403, men `GeneralTab.vue` saknar `v-if` på korten* | **Ja** | ☐ |
| A-9 | Coordinator ser `Kommun` | Ja | Nej | ☐ |
| A-10 | Coordinator ser `Specialbehov` + `Provlokal-anpassningar` | Ja | Nej | ☐ |
| A-11 | SYV/Specped ser **inte** kortet `Kommentarer` | Nej | Nej | ☐ |
| A-12 | Specped ser **Redigera** vid `Provlokal-anpassningar` | Ja | Nej | ☐ |
| A-13 | Endast admin ser kortet `Ändringshistorik` | Ja | Nej | ☐ |
| A-14 | Personnummer är **borttaget**, inte maskat | Ja | Nej | ☐ |
| A-15 | `Ändringshistorik` borta i payloaden för lärare+coordinator | Ja | Nej | ☐ |
| A-16 | `/support` och `/deviations` ger 403 för lärare+coordinator | ✅ Ja (AV-2 åtgärdad) | Nej | ☑ |
| A-17 | Elev får 403 på `/support` och `/deviations` (inget brus i konsolen) | Ja | Nej | ☐ |
| A-18 | UI: `/students` blockeras för coordinator | Ja | Nej | ☐ |
| A-19 | UI: coordinator kan öppna `/student/:id` direkt | Ja | Nej | ☐ |

### B — Uploads IDOR

| # | Kontroll | Förväntat | Block | Status |
|---|---|---|---|---|
| B-1 | Uppladdning ger 201 + toast | Ja | Nej | ☐ |
| B-2 | Filnamn = timestamp + random + saniterat original | Ja | Nej | ☐ |
| B-3 | Admin laddar ner egen elevs fil | 200 | Nej | ☐ |
| B-4 | Lärare laddar ner egen elevs fil | 200 | Nej | ☐ |
| B-5 | Elev laddar ner egen fil | 200 | Nej | ☐ |
| B-6 | **Annan elev → 403** | 403 | **Ja** | ☐ |
| B-7 | Ingen cookie → 401 | 401 | Ja | ☐ |
| B-8 | Ogiltig cookie → 401 | 401 | Ja | ☐ |
| B-9 | Okänt filnamn → 404 | 404 | Nej | ☐ |
| B-10 | Path traversal (`%2F`) → 404 (AV-3) | 404 | Nej | ☐ |
| B-11 | 403-svar innehåller inget filinnehåll | Ja | **Ja** | ☐ |
| B-12 | GridFS: annan elevs fil → 403 | 403 | **Ja** | ☐ |
| B-13 | Nedladdningslänk pekar på rätt port | 5010 | Nej | ☐ |
| B-14 | Uppladdning > 10 MB → 400 | 400 | Nej | ☐ |
| B-15 | Otillåten filtyp (`.exe`) → 400 | 400 | Nej | ☐ |

### C — Dokument-metadata tenant scope

| # | Kontroll | Förväntat | Block | Status |
|---|---|---|---|---|
| C-1 | Admin → alla elevers dokumentmetadata | 200 | Nej | ☐ |
| C-2 | Scoped coordinator → Upplands Bro | **403** ✅ (AV-1 åtgärdad) | Nej | ☑ |
| C-3 | Scoped coordinator → Stockholm | 200 | Nej | ☐ |
| C-4 | `GET /api/students` (scoped) saknar Doris | Ja | **Ja** | ☐ |
| C-5 | Elev → egna dokument | 200 | Nej | ☐ |
| C-6 | **Elev → annan elevs dokument → 403** | 403 | **Ja** | ☐ |
| C-7 | Uppladdning till annan elev → 403 | 403 | **Ja** | ☐ |
| C-8 | Radering av annans dokument → 403 | 403 | **Ja** | ☐ |
| C-9 | Ingen autentisering → 401 | 401 | Ja | ☐ |
| C-10 | Felmeddelande är in-page-banner, inte `alert()` | Ja | Nej | ☐ |

### D — Meddelanden

| # | Kontroll | Förväntat | Block | Status |
|---|---|---|---|---|
| D-1 | `studentId` har exakt `["_id","name"]` | Ja | **Ja** | ☐ |
| D-2 | Hela svaret saknar `personalNumber`-nyckeln | Ja | **Ja** | ☐ |
| D-3 | Råsökning efter `19900101-1234` ger träff | Nej | **Ja** | ☐ |
| D-4 | `participants` saknar `municipalities` | Ja | Nej | ☐ |
| D-5 | Header visar namn, inte personnummer | Ja | **Ja** | ☐ |
| D-6 | `/unread-count` och `/recipients` är PII-fria | Ja | **Ja** | ☐ |
| D-7 | Annan roll (lärare/elev) ger samma rena payload | Ja | **Ja** | ☐ |
| D-8 | `POST /api/messages` → 201 | Ja | Nej | ☐ |
| D-9 | Tom body → 400 | 400 | Nej | ☐ |
| D-10 | Icke-deltagare läser tråd → 404 | 404 | **Ja** | ☐ |
| D-11 | `Ctrl+F` i DevTools hittar ingen PII | Ja | **Ja** | ☐ |

### E — Feature flags

| # | Kontroll | Förväntat | Block | Status |
|---|---|---|---|---|
| E-1 | `GET /api/features` kräver ingen autentisering | 200 | Ja | ☐ |
| E-2 | Exakt 11 nycklar | Ja | Nej | ☐ |
| E-3 | Alla defaults `true` | Ja | Nej | ☐ |
| E-4 | `MESSAGING=false` → `/conversations` → 404 | 404 | **Ja** | ☐ |
| E-5 | 404-meddelande = `Feature not available` | Ja | Ja | ☐ |
| E-6 | Okänd route → `Route not found` (ej samma meddelande) | Ja | Nej | ☐ |
| E-7 | `/messages` visar ingen lista när flaggan av | Ja | **Ja** | ☐ |
| E-8 | Menynyckeln försvinner (AV-4) | Ja | Nej | ☐ |
| E-9 | Ej flaggade moduler påverkas inte | Ja | Nej | ☐ |
| E-10 | Återställning → data kvar | Ja | Nej | ☐ |

### F — Inaktivitet / utloggning

| # | Kontroll | Förväntat | Block | Status |
|---|---|---|---|---|
| F-1 | Hard refresh → fortfarande inloggad | Ja | Nej | ☐ |
| F-2 | `GET /api/auth/session` → 200 med roll | Ja | Nej | ☐ |
| F-3 | Logout → 200 + cookie uttryckt som utgången | Ja | Nej | ☐ |
| F-4 | Upprepat JWT-anrop efter logout → 401 | 401 | Nej | ☐ |
| F-4b | *Korrigering:* upprepat JWT-anrop efter logout → **200** (stateless JWT, AV-11) | 200 | Nej | ☑ |
| F-5 | Manuell omladdning efter logout → `/login` | Ja | Nej | ☐ |
| F-6 | Ingen PII läcker mellan sessioner | Ja | **Ja** | ☐ |
| F-7 | `/admin/inactivity` rapport laddar (ON) | Ja | Nej | ☐ |
| F-8 | `INACTIVITY=false` → 404 + felbanner | Ja | Nej | ☐ |
| F-9 | Återställning → rapporten tillbaka | Ja | Nej | ☐ |
| F-10 | Fel lösenord → 401 + in-page banner | Ja | Nej | ☐ |
| F-11 | `alert()` förekommer ingenstans | Ja | Nej | ☐ |
| F-12 | Ingen idle-logout finns (AV-8) — dokumenterad | Ja | Nej | ☐ |

---

## 12. Kända avvikelser och blockeringar

Dessa avvikelser är **bekräftade i koden** vid skrivandet av denna guide. AV-1, AV-2, AV-9, AV-10 och AV-12 är dessutom **bekräftade mot den körande stacken** 2026-09-27 (se §14).

> **Status 2026-09-27:** AV-1, AV-2, AV-9, AV-10 och AV-12 är **åtgärdade** och verifierade gröna
> (77/77 Newman-assertions, 120/124 i Node-suiten där de 4 återstående är INFO, se §14.2).
> Varje avsnitt nedan märks med ✅ när det är fixat. AV-3–AV-8 och AV-11 är kvar som
> *accepterade brister* och är inte blockerande.

### AV-1 · Dokument-endpoints saknar kommun-scope — ✅ **ÅTGÄRDAD 2026-09-27**

**Problem (originalt):** JWT-token innehåller inte `municipalities` — `tokenPayload` i `authController.js:94-101` har bara `userId, roles, role, name, email, permissions`. `hasRole` laddar om användaren via `refreshUserAuthorization` (`middleware/authorization.js:82-126`) och fyller på `municipalities` på `req.user` — men dessa endpoints använde **bara** `authenticateUser`, som inte gjorde det.

- `GET /api/documents/:id` — `backend/src/router/documentRoutes.js`
- `POST /api/documents/upload` — samma fil
- `GET /uploads/:filename` — `backend/index.js`

**Konsekvens:** En kommunbegränsad coordinator, SYV eller Specped behandlades som **global** på dessa endpoints. `canAccessStudentDocuments` ser `user.municipalities === undefined` och faller igenom till "ingen kommun begränsar → tillåt".

**Åtgärd (genomförd):** Hydreringen flyttades **in i `authenticateUser`** i stället för att koppla `hasRole` på varje route. `authenticateUser` är nu `async` och `await`ar `refreshUserAuthorization(req)` efter att JWT:en verifierats, så `req.user.municipalities`, `roles`, `permissions` och `active` speglar DB-läget på **varje** request — även på routes som bara har `authenticateUser`.

För att inte köra samma User-query två gånger per request sätter `refreshUserAuthorization` en markör (`req.__authorizationRefreshed`) som ett efterföljande `hasRole`/`can`/`canFeature` respekterar.

Biverkningar som också rättas av samma fix: en **deaktiverad** konto (`active === false`) blir nu roll-löst direkt, och `municipalities` följer med i `req.user` överallt.

### AV-2 · Support- och avvikelsedata läcker via sekundära endpoints — ✅ **ÅTGÄRDAD 2026-09-27**

**Problem (originalt):** `projectStudentForViewer` (`backend/src/utils/studentSerializer.js:63-127`) tar bort `supportInfo` för lärare och både `supportInfo` + `deviations` för coordinator. Men `GeneralTab.vue` fyller korten från **separata** anrop:

- `GET /api/student-details/:id/support` — `GeneralTab.vue`
- `GET /api/student-details/:id/deviations` — `GeneralTab.vue`

Båda tillåt tidigare `systemadmin, admin, teacher, coordinator, syv, specped`, alltså gav projektorn inget skydd alls.

**Åtgärd (genomförd):** Rollistan är nu identisk med projektorns egen policy — `["systemadmin", "admin", "syv", "specped"]` på båda endpoints (`backend/src/router/studentDetailsRoutes.js`).

> **Viktig korrektion av guidens ursprungliga spec.** Guidens första utformning angav `403` för SYV/SpecPed.
> Det var **fel**, och testerna hade fångat felet åt fel håll. Projektorn är source of truth:
> `syv`/`specped` får behålla `supportInfo` och `deviations` (bara `changeHistory` tas bort),
> så de ska få **200**. Endast `teacher` och `coordinator` ska få **403**.

| Roll | `GET /support` | `GET /deviations` | Varför |
|---|---|---|---|
| systemadmin / admin | 200 | 200 | full åtkomst |
| syv / specped | 200 | 200 | projektorn tar bara bort `changeHistory` |
| teacher | **403** ✅ | **403** ✅ | projektorn tar bort `supportInfo` + `deviations` |
| coordinator | **403** ✅ | **403** ✅ | projektorn tar bort båda (+ `personalNumber` m.fl.) |
| student (anna) | 403 | 403 | `student` finns inte i rollistan |

Regressionsskydd: `backend/tests/unit/studentDetailsRoutes.roles.test.js` kör den riktiga `hasRole`-vakten via supertest för alla sex roller mot båda endpoints (18 assertions). Testet faller med 4 failures om rollistan återställs.

Kvarvarande **frontend**-arbete (utanför API-scopet, se AV-2 i §12): lägg `v-if` på **korten**, inte bara på knapparna, i `GeneralTab.vue`, och gate:a `loadSupportInfo()`/`loadDeviations()` på samma villkor så inga anrop görs i onödan. API-sidan är nu 403, så detta är nu bara redundans och brus, inte en läcka.

```bash
# Lärare och coordinator ska nu få 403 på båda
curl -s -o /dev/null -w 'teacher     -> support    : %{http_code}\n' -b /tmp/c_teacher.txt     "$BASE/api/student-details/$ANNA_ID/support"
curl -s -o /dev/null -w 'coordinator -> deviations : %{http_code}\n' -b /tmp/c_coordinator.txt "$BASE/api/student-details/$ANNA_ID/deviations"
# Förväntat: 403 / 403

# SYV/SpecPed behåller stöd- och avvikelsedata enligt projektorn
curl -s -o /dev/null -w 'syv         -> support    : %{http_code}\n' -b /tmp/c_syv.txt         "$BASE/api/student-details/$ANNA_ID/support"
# Förväntat: 200
```


### AV-3 · Path traversal ger 404, inte 400 — **accepteras**

**Problem:** Specen anger 400. `serveUpload` returnerar 404 för ogiltiga filnamn, saknad DB-rad och fil som inte finns på disk — alla med `{"error":"File not found"}`.

**Bedömning:** 404 är faktiskt **bättre** här. Det avslöjar inte om ett filnamn existerar, vilket 400 skulle göra för giltiga namn mot trasiga länkar. Sign-off: acceptera 404.

### AV-4 · Frontend läser inte feature flags — **brist**

**Problem:** Det finns **noll** referenser till `/api/features` i `frontend/`. Naven filtreras bara på `isAdmin`/`isTeacher`/rollhierarki (`NavBar.vue`). En avstängd `MESSAGING` gör alltså att:

- Menynyckeln `Meddelanden` **förblir synlig**
- Bubblan i topbaren **förblir klickbar**
- Klicket leder till en 404-ketcherande vy med fel-läge

**Verifiering:** §E-2 steg 7.

**Åtgärd:** Hämta `/api/features` vid appstart (t.ex. i `main.js` eller en Pinia-store), och filtrera `NavBar` och `MessagingView`-bubblan på `flags.MESSAGING`.

### AV-5 · `maskPersonalNumber()` är död kod

`backend/src/utils/studentSerializer.js` definierar `maskPersonalNumber()` men anropar den aldrig. P15-strategin är i praktiken **borttagning**, inte maskning. Funktionen bör tas bort eller börja användas om maskningssemantik önskas.

### AV-6 · `DocumentSection.vue` har felaktig fallback-URL

`frontend/src/views/Admin/SearchTabs/DocumentSection.vue:68` bygger en fallback mot `localhost:5001` om `VITE_API_URL` saknas. Lokalt funkar det bara för att `.env` sätter `VITE_API_URL=http://localhost:5010`. I en annan miljö utan den variabeln pekar nedladdningslänkar på fel port.

**Verifiering:** §B-4 steg 10.

### AV-8 · Ingen inaktivitets-baserad utloggning

`INACTIVITY`-flaggan styr **elev-inaktivitet** (rapport, scan, påminnelse-mejl), inte sessioner. Det finns ingen `sessionManager`/idle-timer i `frontend/src/`, och JWT sätts till `expiresIn: "7d"` (`authController.js:102`). En workstation som lämnas olåst håller alltså inloggad i en vecka.

**Åtgärd:** Lägg till en idle-timeout (t.ex. 30 min) som anropar `store.dispatch('logout')`, eller sätt `expiresIn` till något kortare och kräv re-login.

### AV-7 · `/api/students` tillåter `coordinator` men frontend-vägen gör det inte

`backend/src/router/studentRoutes.js` tillåter `coordinator` på `GET /students`, och `studentSerializer` skyddar individfälten. Men `NavBar.vue` döljer `Elever` för coordinator, och frontend-routern har `meta.roles` som blockerar `/students` → redirect till `/unauthorized`. API:et är alltså **öppnare än UI:t**. Detta är inte en sårbarhet, men en inkonsekvens som bör dokumenteras.

### AV-9 · `municipality` försvinner helt — ✅ **ÅTGÄRDAD 2026-09-27**

**Problem (originalt formulerat):** Seeden skickar `municipality` som en ren sträng och Student-schemat vill ha `{ type }`, så fältet kastades bort.

**Grundorsak (visad efteråt):** Inte seeden — **schemat**. `municipality` var definierad inline med nyckeln `type`:

```js
// FÖRE — trasigt
municipality: { type: { type: String, enum: ALL_MUNICIPALITIES } }
```

Eftersom `type` är ett reserverat nyckelnamn i mongoose tolkades detta som "ett fält som heter `type`", och mongoose registrerade därför bara den **inre** sökvägen `municipality.type`. Någon `municipality`-wrapper skapades aldrig. En sträng skrevs därför till en sökväg som inte existerade, och mongoose kastade tyst bort värdet. Seeden har alltid haft rätt intention.

**Åtgärd (genomförd):** Explicit `_id: false`-sub-schema i `backend/src/models/Student.js`:

```js
municipality: {
    type: new mongoose.Schema(
        { type: { type: String, enum: ALL_MUNICIPALITIES } },
        { _id: false }
    ),
    required: false,
},
```

Både `"Stockholm"` och `{ type: "Stockholm" }` normaliseras nu till `{ type: "Stockholm" }`, och en kommun utanför `ALL_MUNICIPALITIES` ger ett valideringsfel istället för att tyst försvinna.

Regressionsskydd: `backend/tests/unit/studentMunicipality.test.js` (6 tester) verifierar att `municipality` verkligen är en sub-sökväg, att sträng och objekt ger samma resultat, och att hela `ALL_MUNICIPALITIES` passerar validering.

**Verifiering efter fix (2026-09-27, direkt mot `mindfullearning` efter `node scripts/seedE2EData.js`):**

```
Anna Andersson => {"type":"Stockholm"}
Berta Berg     => {"type":"Stockholm"}
Calle Carlsson => {"type":"Stockholm"}
Doris Dahl     => {"type":"Upplands Bro"}
Erik Ek        => {"type":"Stockholm"}
```

Seed-data bär alltså nu `municipality.type` utan reparation, och AV-9:s varning i `postman/setup.mjs` slutar lysa.

**Konsekvens (före fix):** Hela kommun-scopet var overifierbart mot seed-data. `municipalityInScope(user, undefined)` returnerar `false`, så varje scoped användare fick **403 på varje elev** — även sina egna. §3.1 i denna guide och §C kunde inte köras mot en färsk seed utan reparation. Testsviten (`postman/setup.mjs`) reparerar detta fortfarande och loggar en varning om det skulle återkomma.

### AV-10 · GridFS `checkFileAccess` saknar hela kommun-scopet — ✅ **ÅTGÄRDAD 2026-09-27**

**Problem:** `backend/src/router/uploadRoutes.js:130` räknar `coordinator`, `syv` och `specped` som `isStaff`. `checkFileAccess` (`:115-192`) har sedan **ingen** `municipalityInScope`-kontroll alls — till skillnad från `documentRoutes.js:119-120` och `documentAuthorization.js:59-60`, som båda gör `Student.findById(...).select("municipality")` först. Filen kontrolleras bara mot `metadata.studentId` (och för lärare mot `student.teacherId`).

**Verifiering (2026-09-27):** fil uppladdad till Doris Dahl (Upplands Bro) av admin; coordinator med scope `['Stockholm']` läser den med **200**.

```
AV-10: GridFS scoped coord   -> Doris fil : 200   (spec 403)  ❌
AV-10: GridFS scoped syv     -> Doris fil : 200   (spec 403)  ❌
AV-10: GridFS scoped specped -> Doris fil : 200   (spec 403)  ❌
```

**Åtgärd (genomförd):** `municipalityInScope`-kontrollen ligger nu efter `studentId`-uttaget i `checkFileAccess` (`backend/src/router/uploadRoutes.js`), med `Student.findById(studentId).select("municipality").lean()`. Den appliceras på både `GET /download/:fileId` och `DELETE /:fileId`.

Kontrollen är **fail-closed för scoped användare** och genomsläpper o-scoped: `municipalityInScope` returnerar `true` direkt för globala användare, så studenter och lärare (som saknar `municipalities`) är helt oförändrade i beteende. En elev vars dokument har raderats ger `undefined` och nekas därmed till en scoped användare, medan en global fortfarande kommer igenom.

Regressionsskydd: `backend/tests/unit/uploadFileAccess.test.js` (8 tester) täcker scoped coordinator/syv/specped mot en fil i annan kommun, matchande kommun, global staffer, saknat elevdokument, `DELETE`, och att 404 för en saknad fil fortfarande går före tenant-kontrollen. `checkFileAccess` exporteras nu som named export för att kunna testas isolerat.

### AV-11 · Logout rensar cookien men JWT:en förblir giltig i 7 dagar

**Förväntat (felaktigt angivet i tidigare utgåvor av denna guide):** "samma cookie efter logout → 401".

**Faktiskt beteende (bekräftat 2026-09-27):** `clearAuthCookie` sätter korrekt `token=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict`, så webbläsaren glömmer token. Men JWT:en är **stateless** — ingen server-side denylist finns, och `expiresIn` är `7d` (`authController.js:102`). Ett JWT som kopieras ur DevTools → Application → Cookies före logout fungerar alltså oförändrat i en vecka efteråt.

Detta är **inte** en bugg i logout-flödet (F-3/F-5 passerar), men det är en dokumenterad egenskap med säkerhetskonsekvens. Sign-off: accepteras endast om hotmodellen uttryckligen godkänner långlivade bearer-tokens; annars krävs `tokenVersion` mot `User` eller en denylist.

### AV-12 · Två endpoints kastar bort `municipality` ur projektionen — ✅ **ÅTGÄRDAD 2026-09-27**

**Problem:** `municipalityInScope` kräver `student.municipality.type`, men två anropställen laddar dokumentet med en projektion som **utelämnar just det fältet**, så kontrollen får `undefined` och returnerar `false` — även för en scoped användare på en elev som ligger i användarens egen kommun.

| Endpoint | Laddar | Fält |
|---|---|---|
| `GET /api/student-details/:id/support` | `studentDetailsController.js:732` | `.select("supportInfo name email")` — saknar `municipality` |
| `GET /api/student/:id/basic` | `studentRoutes.js:811` | `.select("name personalNumber teacherId aplStatus …")` — saknar `municipality` |

Övriga sex `municipalityInScope`-ställen är korrekta (`inactivityController.js:409`/`:471`, `studentDetailsController.js:811`, `studentRoutes.js:792`, `documentRoutes.js:119`, `documentAuthorization.js:59`). Notera att `.select("+commentHistory.seenBy")` **inkluderar hela dokumentet** (mongoose `+`-prefix), så de två är inte defekta. En automatisk granskning av samtliga åtta anropställen hittar inga fler avvikelser.

**Verifiering (2026-09-27):** Anna Andersson har `municipality = { type: "Stockholm" }`, coordinator har scope `['Stockholm']`:

```
GET /api/student-details/:id/support  -> 403   (skulle vara 200 — Anna LIGGER i scope)  ❌
GET /api/student/:id/basic            -> 403   (skulle vara 200)                        ❌
GET /api/student-details/:id/support  -> 200   (o-scoped teacher, korrekt)               ✅
GET /api/student/:id/basic            -> 200   (o-scoped teacher, korrekt)               ✅
```

**Konsekvens:** Detta är fail-closed, alltså en **tillgänglighets**-bugg — ingen data läcker. Men varje kommunbegränsad användare är utelåst från stödkontakter och grunddata för *sina egna* elever, vilket är exakt den roll kedjan är designad för. Det förklarar också asymmetrin mot AV-2: `/support` svarar 403 (trasig kontroll), `/deviations` svarar 200 (ingen kontroll alls).

**Åtgärd (genomförd):** `municipality` ligger nu i båda projektionerna:

- `backend/src/controllers/studentDetailsController.js` — `getSupportInfo` läser `.select("supportInfo name email municipality")`
- `backend/src/router/studentRoutes.js` — `GET /student/:id/basic` läser `municipality`

Regressionsskydd: `backend/tests/unit/studentDetailsController.extra.test.js` har delats så att den täcker **båda** fallen — en scoped användare vars kommun *matchar* eleven ger nu **200** (detta är regressionstestet för AV-12), och en scoped användare i en annan kommun ger **403**. Den ursprungliga testet påstod 403 även för det in-scope-fallet, alltså kodade den AV-12-defekten in som förväntat beteende.

Verifierat end-to-end mot den körande stacken: scoped `syv` med scope `['Stockholm']` får nu **200** på både `/support` och `/basic` för Anna Andersson (Stockholm).

> **Testfixture-korrigering som följde med.** AV-12 använde tidigare `coordinator` som probe — men efter AV-2-fixen nekas coordinator korrekt 403 på `/support`, så den kunde inte längre bevisa att projektionen fungerar. Proben är nu `syv` (scoped **och** behåller `supportInfo`), och kontrollfallet är `admin` (global). Dessutom scopades `syv` och `specped` till `Stockholm` i fixtures, eftersom en o-scoped användare är global per definition och därför korrekt skulle få 200 — vilket gjorde "ska vara 403"-assertionerna vakuösa.

---

## 13. Snabbreferens — curl-pack

Klistra in hela blocket i en terminal. Det loggar in alla roller, verifierar de viktigaste resultaten och skriver ut en sammanfattande matris. Kräver att backend och seed-data är igång.

```bash
#!/usr/bin/env bash
set -uo pipefail
BASE=http://localhost:5010
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

login () {  # login <namn> <epost> <lösenord>
  curl -s -c "$TMP/$1.txt" -X POST $BASE/api/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$2\",\"password\":\"$3\"}" -o /dev/null
}
code () {  # code <namn> <metod> <path> [curl-extra...]
  local n="$1" m="$2" p="$3"; shift 3
  curl -s -o /dev/null -w '%{http_code}' -X "$m" -b "$TMP/$n.txt" "$BASE$p" "$@"
}

echo "== 1. Inloggning =="
login admin   admin@mindful.se    'Admin123!'
login teacher teacher@mindful.se  'Teacher123!'
login coord   coordinator@mindful.se 'Teacher123!'
login syv     syv@mindful.se      'Teacher123!'
login doris   student4@mindful.se  'Student123!'
login anna    student@mindful.se   'Student123!'
login berta   student2@mindful.se  'Student123!'
for r in admin teacher coord syv doris anna berta; do
  printf '  %-10s %s\n' "$r" "$(code "$r" GET /api/auth/session)"
done
echo "  (förväntat: alla 200)"

echo
echo "== 2. ID:n =="
DORIS=$(curl -s -b "$TMP/admin.txt" $BASE/api/students | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(x=>x.name==="Doris Dahl")._id')
ANNA=$(curl -s -b "$TMP/admin.txt"  $BASE/api/students | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(x=>x.name==="Anna Andersson")._id')
printf '  Doris (Uppl. Bro) = %s\n  Anna  (Stockholm)  = %s\n' "$DORIS" "$ANNA"

echo
echo "== 3. Feature flags =="
curl -s $BASE/api/features | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const f=JSON.parse(d);
  const off=Object.entries(f).filter(([,v])=>!v);
  console.log("  antal nycklar :", Object.keys(f).length, "(förväntat 11)");
  console.log("  avstängda     :", off.length ? off.map(([k])=>k).join(", ") : "inga ✅");})'

echo
echo "== 4. Dokument-metadata (C) =="
printf '  %-14s %-14s\n' "roll" "Doris/Anna"
for r in admin teacher coord doris anna; do
  printf '  %-14s %-14s %-14s\n' "$r" \
    "$(code "$r" GET /api/documents/$DORIS)" \
    "$(code "$r" GET /api/documents/$ANNA)"
done
echo "  (admin 200/200 · teacher 200/200 · coord 403*/200 · doris 200/403 · anna 403/200)"
echo "  (* 200 = AV-1)"

echo
echo "== 5. Elevlista tenant scope (C-4) =="
curl -s -b "$TMP/coord.txt" $BASE/api/students | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const a=JSON.parse(d);
  console.log("  antal elever :", a.length);
  const leak=a.find(s=>s.name==="Doris Dahl");
  console.log("  Doris syns   :", leak ? "LÄCKA ❌" : "saknas ✅");})'

echo
echo "== 6. Uppladdning + IDOR (B) =="
printf 'probe\n' > "$TMP/probe.txt"
UP=$(curl -s -b "$TMP/admin.txt" -X POST $BASE/api/documents/upload \
  -F "file=@$TMP/probe.txt" -F "studentId=$DORIS" -F "type=GENERAL" \
  | node -pe 'const o=JSON.parse(require("fs").readFileSync(0));print(o.filename||"")')
if [ -n "$UP" ]; then
  echo "  filnamn: $UP"
  printf '  admin   -> egen fil : %s (200)\n'   "$(code admin GET "/uploads/$UP")"
  printf '  lärare  -> egen elev : %s (200)\n'  "$(code teacher GET "/uploads/$UP")"
  printf '  elev    -> egen fil : %s (200)\n'   "$(code doris GET "/uploads/$UP")"
  printf '  annan elev          : %s (403)\n'   "$(code anna GET "/uploads/$UP")"
  curl -s -b "$TMP/anna.txt" "$BASE/uploads/$UP" | grep -q probe \
    && echo "  innehåll läckt ❌" || echo "  inget innehåll läckt ✅"
else
  echo "  ⚠️  uppladdningen misslyckades — kontrollera att Doris har Filarkiv och att INACTIVITY inte är aktiv"
fi
printf '  okänt filnamn       : %s (404)\n' "$(code admin GET /uploads/no-such-file.pdf)"
printf '  path traversal      : %s (404)\n' "$(code admin GET '/uploads/..%2F..%2Fetc%2Fpasswd')"
printf '  ingen cookie        : %s (401)\n' "$(curl -s -o /dev/null -w '%{http_code}' $BASE/uploads/x)"

echo
echo "== 7. Meddelanden (D) =="
CONV=$(curl -s -b "$TMP/admin.txt" -X POST $BASE/api/messages \
  -H 'Content-Type: application/json' \
  -d "{\"participantIds\":[],\"studentId\":\"$ANNA\",\"subject\":\"curl-pack\",\"body\":\"Hej!\"}" \
  -o /dev/null -w '%{http_code}')
echo "  skapa konversation: $CONV (201)"
RAW=$(curl -s -b "$TMP/admin.txt" $BASE/api/conversations)
echo "$RAW" | grep -q 'personalNumber' && echo "  personalNumber i svaret ❌" || echo "  personalNumber saknas ✅"
echo "$RAW" | grep -q '19900101-1234'  && echo "  personnummer i svaret ❌"    || echo "  personnummer saknas ✅"
echo "$RAW" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const c=JSON.parse(d).find(x=>x.subject==="curl-pack");
  console.log("  studentId-nycklar:", c?Object.keys(c.studentId).join(","):"(hittade ingen tråd)");})'

echo
echo "== 8. Utloggning (F) =="
printf '  logout             : %s (200)\n' "$(code admin POST /api/auth/logout)"
printf '  session efter ut   : %s (401)\n' "$(code admin GET /api/auth/session)"
printf '  fel lösenord       : %s (401)\n' "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"admin@mindful.se","password":"nope"}')"

echo
echo "Klart. Jämför resultaten mot checklistan i §11 och avvikelserna i §12."
```

### Referens: hela kontrollmatrisen i en tabell

Samma matris som i §C Test 8 och §B Test 7, men med alla kolumner i ett svep. Kräver att §3.1 är utförd (annars blir `coord`-kolumnen 200/200 — se AV-1).

```bash
BASE=http://localhost:5010
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

login () { curl -s -c "$T/$1.txt" -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$2\",\"password\":\"$3\"}" -o /dev/null; }
login admin   admin@mindful.se       'Admin123!'
login teacher teacher@mindful.se     'Teacher123!'
login coord   coordinator@mindful.se 'Teacher123!'
login syv     syv@mindful.se         'Teacher123!'
login doris   student4@mindful.se    'Student123!'
login anna    student@mindful.se     'Student123!'

DORIS=$(curl -s -b "$T/admin.txt" $BASE/api/students | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(x=>x.name==="Doris Dahl")._id')
ANNA=$(curl -s -b "$T/admin.txt"  $BASE/api/students | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(x=>x.name==="Anna Andersson")._id')

printf 'probe\n' > "$T/probe.txt"
UP=$(curl -s -b "$T/admin.txt" -X POST $BASE/api/documents/upload \
  -F "file=@$T/probe.txt" -F "studentId=$DORIS" -F "type=GENERAL" \
  | node -pe 'const o=JSON.parse(require("fs").readFileSync(0));print(o.filename||"")')

printf '%-10s %-9s %-9s %-9s %-12s %-8s %s\n' \
  roll 'docs/UB' 'docs/Sthlm' 'upl/UB' 'upl→Sthlm' 'session' 'roll'
for r in admin teacher coord syv doris anna; do
  printf '%-10s %-9s %-9s %-9s %-12s %-8s %s\n' \
    "$r" \
    "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/$r.txt" "$BASE/api/documents/$DORIS")" \
    "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/$r.txt" "$BASE/api/documents/$ANNA")" \
    "$([ -n "$UP" ] && curl -s -o /dev/null -w '%{http_code}' -b "$T/$r.txt" "$BASE/uploads/$UP" || echo '-')" \
    "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/$r.txt" -X POST $BASE/api/documents/upload \
        -F "file=@$T/probe.txt" -F "studentId=$ANNA" -F "type=GENERAL")" \
    "$(curl -s -o /dev/null -w '%{http_code}' -b "$T/$r.txt" $BASE/api/auth/session)" \
    "$(curl -s -b "$T/$r.txt" $BASE/api/auth/session | node -pe 'const u=JSON.parse(require("fs").readFileSync(0));u.role||"-"' 2>/dev/null)"
done

echo
echo " Kolumner:"
echo "   docs/UB     GET /api/documents/<Doris>   (Doris = Upplands Bro)"
echo "   docs/Sthlm  GET /api/documents/<Anna>    (Anna  = Stockholm)"
echo "   upl/UB      GET /uploads/<Doris fil>     (admins uppladdade fil)"
echo "   upl→Sthlm   POST /api/documents/upload med studentId=<Anna>"
echo
echo " Spec (korrekt beteende):"
echo "   roll        docs/UB  docs/Sthlm  upl/UB  upl→Sthlm  session"
echo "   admin       200      200         200     201        200"
echo "   teacher     200      200         200     201        200"
echo "   coord       403      200         403     403        200"
echo "   syv         403      200         403     403        200"
echo "   doris       200      403         200     403        200"
echo "   anna        403      200         403     403        200"
echo
echo " FAKTISKT 2026-09-27 efter AV-1-fix (authenticateUser hydrerar nu municipalities):"
echo "   coord       403      200         403     403        200"
echo "   syv         403      200         403     403        200"
echo
echo " = spec: AV-1 och AV-10 är åtgärdade, scoped staff nekas cross-tenant."
echo
echo " Före fixen (utgångsläge) gav detta i stället:"
echo "   coord       200*     200         201*    403        200"
echo "   syv         200*     200         201*    403        200"
echo "   * = AV-1: scoped staff behandlades som global på dokumentrutinerna."
```

---

## 14. Automatiserad körning — Postman / Newman

Sektionerna A–F går att köra maskinellt. Två sviter finns i `postman/`:

| Fil | Innehåll |
|---|---|
| `build-collection.mjs` | Genererar collection + environment från en spec-tabell |
| `setup.mjs` | Loggar in alla 9 roller, **reparerar kommun-scopet**, skapar testkonversationen, skriver ut miljövariablerna |
| `teardown.mjs` | Återställer scope, `municipality` och raderar testkonversationen |
| `run-tests.mjs` | Fristående Node-svit med samma assertioner plus DB-fixtures (124 kontroller) |
| `phase1.postman_collection.json` | Genererad Postman v2.1-collection (56 requests, 75 assertioner) |
| `validate-doc.mjs` | Strukturvalidering av den här guiden |
| `package.json` | `newman` + `mongodb` som devDependencies |

### 14.1 Körning

```bash
# 1. Stacken igång + seedad (se §0)
make dev && node backend/scripts/seedE2EData.js

# 2. Kör sviten (bygger collection, sätter upp fixtures, kör, städar)
make api-test
```

`make api-test` är idempotent: den genererar om collection + environment, kör `setup.mjs` → Newman → `teardown.mjs` och returnerar exit 1 om någon assertion underkänns. Första körningen installerar `newman` + `mongodb` i `postman/` (`npm install`, ~150 beroenden).Motsvarande mål:

| Mål | Gör |
|---|---|
| `make api-test` | Hela Postman/ Newman-kedjan |
| `make api-test-node` | Bara `run-tests.mjs` (skriver `postman/results.json`, exit 1 vid fel) |
| `make validate-doc` | Strukturvalidering av den här guiden (fences, anchors, citat, tabeller) |

`setup.mjs` kräver Mongo-åtkomst eftersom `municipality` måste sättas innan tenant-testerna är meningsfulla (se AV-9). Den loggar en `VARNING AV-9` om sådant behövdes. `run-tests.mjs` gör samma reparation internt.

> **Säkerhet:** `phase1.postman_environment.json` innehåller giltiga session-token för alla nio roller och är därför **gitignored** och nollställd av `teardown.mjs`. Committa den aldrig.

### 14.2 Resultat 2026-09-27

#### Före åtgärd (utgångsläge)

**Newman:** 75 assertioner — 62 godkända, **13 underkända**.
**`run-tests.mjs`:** 124 kontroller — 103 godkända, **17 underkända**, 4 info.

| Avvikelse | Kontroller | Bekräftat |
|---|---|---|
| AV-1 Dokument-endpoints saknar kommun-scope | 4 | `coordinator/syv/specped → Doris` ger 200; `coordinator` laddar upp till Doris (201) |
| AV-2 Support-/avvikelseendpoints kringgår projektorn | 7 | `teacher/syv/specped` får 200 från båda |
| AV-12 Projektionen tappar `municipality` | 2 | `scoped coordinator` får 403 på **in-scope** Anna |

#### Efter åtgärd — ✅ allt grönt

**Newman:** 77 assertioner — **77 godkända, 0 underkända.**
**`run-tests.mjs`:** 124 kontroller — **120 godkända, 0 underkända, 4 info.**

| Avvikelse | Status | Verifiering |
|---|---|---|
| AV-1 Dokument-endpoints saknar kommun-scope | ✅ åtgärdad | scoped `coord/syv/specped → Doris` ger nu **403**; uppladdning till Doris ger **403** |
| AV-2 Support-/avvikelseendpoints kringgår projektorn | ✅ åtgärdad | `teacher`/`coordinator` får **403** på båda; `syv`/`specped` får **200** (korrigerat enligt projektorn) |
| AV-12 Projektionen tappar `municipality` | ✅ åtgärdad | scoped `syv` får **200** på `/support` och `/basic` för in-scope Anna |
| AV-9 `municipality` försvinner i databasen | ✅ åtgärdad | seed-data bär nu `{"type":"Stockholm"}` utan reparation; ingen `VARNING AV-9` |
| AV-10 GridFS saknar kommun-scope | ✅ åtgärdad | scoped `coord/syv/specped` får **403** på Doris fil (både GET och DELETE) |
| AV-11 Stateless JWT | ℹ️ info | Logout uttrycker cookien korrekt; JWT gäller 7 dagar — accepterad egenskap |

De 4 kvarvarande `INFO`-raderna i `run-tests.mjs` är **inte** fel: AV-11 ovan, `Conversation.municipalities` som avsiktligt tenant-fält, och två setup-/cleanup-radier.

#### Övriga gröna körningar

| Kontroll | Resultat |
|---|---|
| `backend` unit-tester (`vitest`) | **1990/1990**, 117 filer, 0 fel |
| `make lint` | 0 errors (14 warnings i orörda filer) |
| `make validate-doc` | Inga problem (162 fences, 68 bash-block, 23 ankarlänkar, 39 citat, 34 tabeller) |

Två förhållanden som upptäcktes under den här körningen och som också rättades:

- **Tidszoner:** `POST /placement/preview` räknade med lokala datum-accessorer (`getDay`/`setDate`/`setHours`), så `endDate` i svaret skiftade med serverns TZ — `2026-11-29T18:15Z` på en UTC+05:45-värd mot `2026-11-30T00:00Z` på UTC. Kalenderdatum räknas nu i UTC (`getUTCDay`/`setUTCDate`/`setUTCHours`) och svaret är identiskt i alla tidszoner.
- **Fixture-destruktivitet:** `teardown.mjs` gjorde `updateMany({}, { $unset: { municipality: '' } })` på *hela* studentsamlingen. När seeden väl blev korrekt (AV-9) utplockade varje körning den datan igen. Teardown tar nu en ögonblicksbild före körningen och återställer exakt det som fanns, plus rensar orphan-konversationer med prefix-matchning.

**Verifierat korrekt (utdrag):**

- B-2 IDOR: annan elevs fil → 403, och 403-svaret innehåller **ingen** filinnehållstext
- B-3 Path traversal (`..%2F..%2F…`) → 404 utan läckage (AV-3, accepterat)
- B-4 Ingen cookie → 401, ogiltig cookie → 401
- C-6 Elev skriver till annan elevs mapp → 403 (korrekt — ingen AV-1 på den vägen)
- D-4 `GET /conversations`: `studentId` har bara `_id`+`name`, `participants` saknar `municipalities` och `userId`, inget personnummer i något svar
- D-5 Icke-deltagare på konversation → 404; tom body → 400; saknad `participantIds` → 400
- E-2 Alla 11 flaggor `true`; okänd route → `Route not found` (distinkt från `Feature not available`)
- F-3/F-4 Logout → 200, `Set-Cookie: token=; Expires=Thu, 01 Jan 1970 …`
- F-5 Fel lösenord → 401 `Fel email eller lösenord`

### 14.3 Korrigeringar motiverade av körningen

1. **`deviations` finns inte i elevdokumentet.** Det lever i en egen `Deviation`-collection. Seriös projektion kan därför inte förvänta sig att fältet är *borttaget* — det finns aldrig. §A.5.3:s diff-kommentarer och §A.5.4:s grep-mönster är justerade, och `studentSerializer.js` `delete projected.deviations` är defensiv död kod.
2. **Berta äger bara sina egna dokument.** C-matrisens `berta → Anna = 200` var fel; korrekt svar är 403.
3. **`POST /api/messages` svarar med det nya meddelandet**, inte konversationen (`messagingController.js:180`). Konversations-id måste hämtas via `GET /conversations` — annars får man 404 på uppföljningen.
4. **`Conversation.municipalities` är ett avsiktligt tenant-fält**, inte PII. PII-kontrollen begränsas till `participants[]`.
5. **GridFS svarar `{ file: { _id, … } }`**, inte `fileId` på toppnivå.
6. **Session efter logout ger 200, inte 401** (AV-11). Checklistans F-4-rad är korrigerad.
7. **`GET /uploads/:filename` kräver en `Document`-rad** (`index.js:132`). När metadata raderas blir filen otillgänglig med 404 trots att filen ligger kvar på disk — därav ordningen i sviten.
8. **SYV/SpecPed ska ha 200, inte 403, på `/support` och `/deviations`.** Guidens ursprungliga spec (och de första testerna) angav 403. Projektorn i `studentSerializer.js` är source of truth: `syv`/`specped` behåller `supportInfo` och `deviations` och tappar bara `changeHistory`. Testerna kodade alltså AV-2 **bakvänt**, och hade godkänt en fix som stängt ut legitim åtkomst. Rättat i både `build-collection.mjs` och `run-tests.mjs`.
9. **`getDeviations` hade redan en korrekt tenant-kontroll** (`.select("municipality name")` + `municipalityInScope`). AV-2 där var enbart för bred rollista — ingen saknad kontroll att lägga till.
10. **AV-12 kunde inte provas med `coordinator`.** Efter AV-2-fixen nekas coordinator korrekt 403 på `/support` (både `hasRole` och projektorn ger `{error:"Forbidden"}`), så den kunde inte längre skilja "rättvis 403" från "trasig projektion". Proben är nu `syv`.
11. **O-scoped personal gav vakuösa 403-assertioner.** `syv` och `specped` scopades aldrig i fixtures, så de var globala per definition och skulle korrekt få 200. Alla tre "scoped staff" scopas nu till `Stockholm` i både `setup.mjs` och `run-tests.mjs`.
12. **En `Student.findOne`-mock som inte gick att kedja.** `aplController`-testet mockade `findOne` med `mockResolvedValue({...})`, men controller-kedjan kräver `.select("_id")` och router-kedjan `.lean()`. `mockResolvedValue` ger ett löfte som inte kan kedjas. Mocket är nu en thenable query med `.select()`/`.lean()` via `mockReturnValue`.

---

*Guide skriven mot `feat/polishing` med befintlig, ocommittad hardening. §A–§F härleddes ur koden och dess unit-tester; §14 är resultatet av en faktisk körning 2026-09-27 mot `localhost:5010` med Mongo på port 27018. AV-1, AV-2, AV-9, AV-10 och AV-12 är åtgärdade i koden och gröna i både `make api-test` (77/77) och `make api-test-node` (120/120 med 4 info), plus 1990/1990 unit-tester. Frontend-delen (inloggning, navigering, kort-gating) är **fortfarande okör** — ingen dev-server startad — och måste köras manuellt enligt §11.*





