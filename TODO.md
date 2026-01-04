# TODO

---

## Navigering

Alla delar av systemet ska vara sammanlänkade.
Exempel: Klick på kurs i studieplanen leder till vy med alla elever och ansvarig lärare.

-   **Klart - Man kan klicka på Elevnamn så kommer man till en detaljerad vy där man kan klicka vidare på kurser i studieplan som visar ansvarig(a) lärare samt vilka elever som är kopplade till kursen.**

---

## Lärare

-   Aktiva kurser
    -   **Klart - man kan se i kursinstanser vilka kurser som är aktiva.**
-   Elever kopplade till respektive kurs
    -   **Klart - Vet dock inte exakt hur ni menade med vart detta ska visas men samma svar som i "Navigering"**

---

## Förändringar i studier

### Avbrott

När kurs sätts till avbrott:
(Menas när ELEV sätts till avbrott?)

-   Automatisk notis till lärare
    -   **Klart - Både admin som sätter avbrottet samt ansvig lärare får notis**
-   Eleven tas bort från slutprovs- och APL-listor
    -   **Klart.**
-   Eleven markeras som inaktiv
    -   **Både i detalj vy och i elev vyn så är elevn rödmarkerad med notis.**
-   Möjlighet att återaktivera elev
    -   **Klart.**

### Revideringar

Vid ändringar i studieplan:

-   Studieplan uppdateras
    -   **Vet inte riktigt vad som menas med detta,**
        -   **När elevens studier blir uppdaterade så uppdateras elev vyn, detalj vyn med studentens nya studieplan. Är det detta som menas?**
-   APL-lista uppdateras automatiskt
    -   **Förstår inte denna punkt heller.**
        -   **Man kan drag 'n' droppa elever i olika fält under APL vyn och då uppdateras deras APL status, elevens information består.**
-   Automatisk bekräftelse till elev och lärare
    -   **Måste implementeras.**

## APL

### Flik 1 – Aktiv APL-lista

Elever hamnar här automatiskt.

Färgkoder:

-   Vit – Ny elev
-   Blå – Kontaktad
-   Gul – APL på gång
-   Lila – Behöver uppföljning
-   Röd – Snart slut
-   Grön – Klar praktik

### Flik 2 – Avslutad APL

-   Endast grönmarkerade elever
    -   Betyder detta att endast grönmarkerade elever har möjlighet att "AVSLUTA" sin APL?
        -   I så fall hur vill ni att det ska se ut?
-   Kontaktuppgifter och praktikperiod
    -   Var vill ni att denna information ska visas?
        -   När man klickar på eleven in APL vyn eller i själva etiketten
-   Markering om kontrakt är uppladdat
    -   Samma som ovan, var vill ni att det ska visas?

### Flik 3 – APL-kontrakt

-   Filarkiv

---

## Betyg

-   Automatisk påminnelse till lärare vid kursslut
-   Betygssättning via rullgardin (A–F)
-   Motivering obligatorisk
-   Möjlighet till kommentarer

### Nationella prov

-   Engelska, svenska, matematik
-   Poäng registreras
-   Årsbundna betygsskalor som administreras av systemadmin

### Låsning och signering

-   Lärare låser betyg
-   Admin får notis
-   Digital signering av betygskataloger

---

## Handlingsplan

-   Vid betyg F får läraren automatisk påminnelse
-   Obligatoriskt formulär
-   PDF genereras när formuläret är ifyllt
-   Systemadmin kan redigera formuläret

---

## Prövningar

-   Samlad sida för prövningselever
-   Import och manuella ändringar möjliga

### Uppgifter vid registrering

-   Namn
-   Personnummer
-   Kontaktuppgifter
-   Adress
-   Kurs
-   Önskad månad
-   Kommun
-   Ansvarig lärare
-   Markering för materialutlämning och betalning
-   Godkända prövningselever hamnar i slutprovskalender

---

## Slutprov (Kalender)

-   Månadsvy
-   Lärare har egna färger och datum

Funktioner:

-   Visa elever per provdatum
-   Markera närvaro
-   Visa anpassningar

Administration:

-   Admin anger plats och rum

---

## Ekonomi och rapporter

-   Statistik per kommun, kurs och månad
-   Prognoser för intäkter
-   Statistik för:
    -   Antal elever
    -   Avbrott
    -   F-betyg
-   Betygskurvor per kurs

---

# OUT OF SCOPE

## Kurser

-   Automatisk datahämtning från Alvis

## Förändringar i studier

### Systemet identifierar Inaktiva elever

-   Ska köras automatiskt
-   Tidigare kurser visas
-   Möjlighet att återaktivera eller lägga till nya kurser

## Betyg

### Låsning och signering

-   Digital signering av betygskataloger

## Prövningar

-   Bokning och betalning via hemsida
