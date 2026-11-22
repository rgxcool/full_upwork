# 📊 Mindful Learning: status for Etapp 1 & 2

**Uppdaterad:** 2026-11-22 · **I produktion:** `256fe2c` (driftsatt idag) · **Källa:** GitHub-projektet *@Mindfullearning* + `MILESTONE-3-MASTER-TASK-STATUS.md`

> Alla timmar är **buffrade estimat** (bas × 2,2, inklusive dolt arbete: behörigheter, kommunavgränsning, felhantering på svenska, tester, staging och demo). Procenten är viktade efter estimerade timmar, inte efter antal ärenden.

---

## 🚀 Sammanfattning

| | Omfattning | ✅ Klart | 🔧 Kvar (godkänt) | ⏳ Väntar på beslut/offert |
|---|---:|---:|---:|---:|
| **Etapp 1 (Avtal)** | 518 h | **405 h · 78 %** | 67 h | 46 h |
| **Etapp 2 (Betald)** | 272 h | **173 h · 64 %** | 31 h | 68 h |
| **Drift & kvalitet** | 25 h | 16 h · 64 % | – | 9 h |
| **Totalt i avtalad scope** | **815 h** | **594 h · 73 %** | **98 h** | **123 h** |

```
Etapp 1   ████████░░  78 %
Etapp 2   ██████░░░░  64 %
Totalt    ███████░░░  73 %
```

**⏱️ Tid till färdigställande** (räknat på 1 utvecklare, ca 35 h/vecka):

- **Godkänt arbete som återstår: 98 h, ≈ 3 veckor.** Det är det som krävs för att stänga Etapp 1 och 2 enligt nuvarande avtal.
- **Om alla väntande förslag godkänns: +123 h, ≈ 3,5 veckor till.** Totalt 221 h, ≈ 6–7 veckor.

---

## ✅ Etapp 1 (Avtal): 78 % klart

**Levererat och accepterat (350 h):** roll- och behörighetsmatris med kommunavgränsning · elev- och personalregister med 6-flikars profil och global sökning · kurs- och kurspaketplacering med automatisk datumplanering · APL-hantering med färgkodade listor · betygsättning, NP-skalor, betygslåsning och F-handlingsplan · slutprovskalender, salshantering och prövningslista · intäktsprognos och ekonomirapport · namnsökning (förnamn/mellannamn/efternamn) · testsvit och kodrevision.

**Klart, visas i demo (55 h):**
- Dokumenthantering och delade dokument (/profile)
- Kommunavgränsning för dokument (GET /documents/:id)
- Placeringsguiden: "APL genomförd på annat håll" och intygsuppladdning
- Nattliga jobb körs bara en gång (pm2-ledare)

**Kvar, godkänt (67 h):**
- 🔒 **P1-01** Rollstyrd visning av personnummer, stödbehov och provanpassningar · 27 h · *delvis klar*
- 🔒 **P1-03** Flytta /uploads från disk till skyddad lagring · 31 h · *delvis klar: åtkomstskyddet är på plats, migreringen återstår*
- 🐞 **BUG-08** Intäkt 0 kr för Stockholm · 4 h · *väntar på Stockholms priser (A–E / F / Streck)*
- 🧹 **P1-12** Städning av gamla skript i repot · 5 h

**Väntar på godkännande/beslut (46 h):**
- Finmaskiga behörigheter per användare · 36 h
- Förhandsvisning av slutdatum och manuellt provdatum i placeringsguiden · 7 h
- Produktbeslut: APL-flikregel, salslista (7 eller 9), avtalsuppladdning · 3 h

---

## 🎓 Etapp 2 (Betald): 64 % klart

**Klart, visas i demo (162 h):**
- **Kurskortsbyggaren och kursmallar.** Mallar uppdateras på plats, datumplanen behålls vid sparning, och dolda moduler förblir dolda.
- **Elevens lärplattform:** Mina kurser, inlämningar och framstegsspårning
- **Intern meddelandefunktion (Mejl/Chatt) och anslagstavla.** Ansvarig lärare kan nu publicera.
- **Säkerhet:** en elev ser bara kurskort hen är antagen till
- **APL-kit:** räknas korrekt och skapas inte dubbelt

**Levererat och accepterat (11 h):** dolda moduler visas inte för elever.

**Kvar, godkänt (31 h):**
- 🔒 **P1-02** Kommunavgränsning i Mejl/Chatt · 22 h · *delvis klar*
- 📄 **BUG-10** Verifiera PDF-generering (diplom och intyg) på produktionsservern · 9 h

**Väntar på godkännande (68 h):**
- Separat anslagstavla för personal och aktivitetsflöde för elever · 18 h
- Skicka ändringar i kursmallar till befintliga kurskort · 27 h
- Dölja enskilda avsnitt (moment), inte bara hela moduler · 14 h
- Inaktivitetsautomatik: admin väljer avbrott eller varningsmejl · 9 h

---

## 🛠️ Drift & kvalitet

- ✅ **Säkrare driftsättning:** CI-kontroll före deploy, atomisk frontend, automatisk återställning och deploy-logg *(i drift idag)*
- ✅ **Felövervakning:** endast i utvecklingsmiljön, ingen elevdata lämnar produktionen
- ✅ **Testtäckning:** backend 2 240 tester (82,6 % rader), frontend 601 tester (60 % funktioner). Kraven höjda till 67/59/57/70.
- ⏳ **Deploy-knapp** i GitHub med godkännandesteg · 9 h · *väntar på godkännande*

---

## 💡 Utanför avtalad scope (offereras separat)

9 idéer, **530 h buffrat**, ingår **inte** i procenten ovan: AI-chattbot, SMS, push-notiser, personliga APL-kit, automatiska diplom med e-signering, frågebank v2, prövning med webbetalning, Scrive och Alvis-integration.

---

<sub>Genererad från GitHub-projektet. Ärenden: Etapp 1 = 24, Etapp 2 = 15, Drift = 3. "Klart" = levererat eller klart för demo i produktion. Delvis klara ärenden räknas med full återstående tid (konservativt).</sub>
