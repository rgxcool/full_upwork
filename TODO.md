# Mindful Learning – Etapp 1

## Roller och behörigheter

Systemet ska stödja flera olika profiler med olika behörigheter:

- Elev
- Lärare
- Administratör
- Systemadministratör
- SYV (Studie- och yrkesvägledare)
- Specialpedagog
- Praktiksamordnare

Behörigheter ska vara personanpassningsbara och kunna justeras individuellt.
Exempel:
- Angelina får ändra i slutprovslistan
- Mirsada har tillgång till ett gemensamt dokument med Anes för att kunna stötta vid betygsättning

---

## Sökruta

En global sökruta där det räcker med tre tecken för att söka på:

### Elev
- Sökning på för-, mellan- och efternamn
- Leder till elevens profil

### Datum
- Visar elever med kursstart eller kursslut på valt datum

### Lärare
- Leder till lärarens profil
- Visar aktiva och avslutade kurser samt elever

### Kurs
- Visar ansvarig lärare
- Visar elever som läser kursen

---

## Användare

### Flik 1 – Allmänt
- Kontaktuppgifter
- All information om användaren
- Interna kommentarer från personal
  - Elever: behov av stöd, anpassningar vid prov
  - Personal: semester eller annan intern information
- Markering om elev är reviderad eller har avvikelse

### Flik 2 – Studieplan
#### Elev
- Kurser och kurspaket
- Ansvarig lärare
- Kursstatus:
  - Antagen
  - Betygsatt
  - Avbrott
  - Ej påbörjad
  - Reviderad

#### Lärare
- Aktiva kurser
- Elever kopplade till respektive kurs

### Flik 3 – APL
- Visas endast för elever som läser kurspaket

### Flik 4 – Behörigheter
- Visar användarens behörigheter
- Möjlighet att ändra vid behov

### Flik 5 – Dokument
- Alla dokument uppladdade av personal
  - Handlingsplan
  - CV
  - APL-kontrakt

### Flik 6 – Kursarkiv
- Alla kursrelaterade dokument
  - Slutprov
  - Delprov

---

## Navigering

Alla delar av systemet ska vara sammanlänkade.
Exempel: Klick på kurs i studieplanen leder till vy med alla elever och ansvarig lärare.

---

## Kurser

### Kursöversikt
- Samlad sida för alla kurser
- Möjlighet att lägga till nya kursplaceringar
- Automatisk datahämtning från Alvis

### Kurs (enskild)
1. Välj kurs
2. Välj kursstart
3. Välj studielängd (5 / 10 / 20 veckor)
4. Kursslut beräknas automatiskt
5. Registrera elevuppgifter
6. Välj datum för slutprov
7. Markera behov av stöd
8. Välj provform (på plats eller distans)

### Kurspaket
1. Välj kursstart
2. Välj studietakt (100 / 50 / 25 %)
3. Välj fullt paket eller revidera bort kurser
4. Start- och slutdatum beräknas automatiskt
5. Eleven registreras automatiskt i APL
6. Möjlighet att registrera redan genomförd praktik

---

## Förändringar i studier

### Avbrott
När kurs sätts till avbrott:
- Automatisk notis till lärare
- Eleven tas bort från slutprovs- och APL-listor
- Eleven markeras som inaktiv
- Möjlighet att återaktivera elev

### Revideringar
Vid ändringar i studieplan:
- Studieplan uppdateras
- Slutprovslista uppdateras automatiskt
- APL-lista uppdateras automatiskt
- Automatisk bekräftelse till elev och lärare

### Inaktiva elever
- Systemet identifierar återkommande elever
- Tidigare kurser visas
- Möjlighet att återaktivera eller lägga till nya kurser

---

## APL

### Flik 1 – Aktiv APL-lista
Elever hamnar här automatiskt.

Färgkoder:
- Vit – Ny elev
- Blå – Kontaktad
- Gul – APL på gång
- Lila – Behöver uppföljning
- Röd – Snart slut
- Grön – Klar praktik

### Flik 2 – Avslutad APL
- Endast grönmarkerade elever
- Kontaktuppgifter och praktikperiod
- Markering om kontrakt är uppladdat

### Flik 3 – APL-kontrakt
- Filarkiv

---

## Betyg

- Automatisk påminnelse till lärare vid kursslut
- Betygssättning via rullgardin (A–F)
- Motivering obligatorisk
- Möjlighet till kommentarer

### Nationella prov
- Engelska, svenska, matematik
- Poäng registreras
- Årsbundna betygsskalor som administreras av systemadmin

### Låsning och signering
- Lärare låser betyg
- Admin får notis
- Digital signering av betygskataloger

---

## Handlingsplan

- Vid betyg F får läraren automatisk påminnelse
- Obligatoriskt formulär
- PDF genereras när formuläret är ifyllt
- Systemadmin kan redigera formuläret

---

## Prövningar

- Samlad sida för prövningselever
- Bokning och betalning via hemsida
- Import och manuella ändringar möjliga

### Uppgifter vid registrering
- Namn
- Personnummer
- Kontaktuppgifter
- Adress
- Kurs
- Önskad månad
- Kommun
- Ansvarig lärare

- Markering för materialutlämning och betalning
- Godkända prövningselever hamnar i slutprovskalender

---

## Slutprov (Kalender)

- Månadsvy
- Lärare har egna färger och datum

Funktioner:
- Visa elever per provdatum
- Markera närvaro
- Visa anpassningar

Administration:
- Admin anger plats och rum

---

## SYV

- Se elever
- Boka möten
- Redigera elevkort
- Revidera studieplaner

---

## Specialpedagog

- Se elever
- Boka möten
- Redigera elevkort
- Registrera provanpassningar

---

## Ekonomi och rapporter

- Statistik per kommun, kurs och månad
- Prognoser för intäkter
- Statistik för:
  - Antal elever
  - Avbrott
  - F-betyg
- Betygskurvor per kurs
