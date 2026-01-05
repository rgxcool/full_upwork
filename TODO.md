# TODO

---

## Lärare
- Aktiva kurser
- Elever kopplade till respektive kurs

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

---


# OUT OF SCOPE

## Navigering

Alla delar av systemet ska vara sammanlänkade.
Exempel: Klick på kurs i studieplanen leder till vy med alla elever och ansvarig lärare.

## Kurser
- Automatisk datahämtning från Alvis

## Förändringar i studier

### Systemet identifierar Inaktiva elever
- Ska köras automatiskt
- Tidigare kurser visas
- Möjlighet att återaktivera eller lägga till nya kurser

## Betyg

### Låsning och signering
- Digital signering av betygskataloger

## Prövningar
- Bokning och betalning via hemsida
