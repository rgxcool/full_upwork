#!/usr/bin/env bash
set -euo pipefail

OWNER="Cyrus-Malekani"
REPO="Mindfullearning"
SLUG="$OWNER/$REPO"
PROJECT_NUMBER=1

# 1. Fetch Project ID, Status field + option IDs, and Uppskattad tid (tim) field ID
PROJECT_JSON="$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json)"
PROJECT_ID="$(echo "$PROJECT_JSON" | jq -r .id)"

FIELDS_JSON="$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json)"
STATUS_FIELD_ID="$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .id')"
EST_FIELD_ID="$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Uppskattad tid (tim)") | .id')"

opt_id() {
  local name="$1"
  echo "$FIELDS_JSON" | jq -r --arg n "$name" '.fields[] | select(.name=="Status") | .options[] | select(.name==$n) | .id'
}

OPT_PARKING="$(opt_id "Parkeringsplats (Idéer)")"
OPT_OFFERT="$(opt_id "Specificerad & Offertad")"
OPT_BUGS="$(opt_id "Buggar och Säkerhet")"
OPT_GODKAND="$(opt_id "Godkänd")"
OPT_DEMO="$(opt_id "Redo för Demo")"
OPT_KLAR="$(opt_id "Klar")"

# Helper: set Status + Estimate on an issue URL
sync_project_item() {
  local url="$1" status_opt="$2" hours="$3"
  local item_id
  item_id="$(gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$url" --format json --jq .id 2>/dev/null || true)"
  if [[ -z "$item_id" ]]; then
    item_id="$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --limit 500 --format json --jq ".items[] | select(.content.url==\"$url\") | .id")"
  fi
  if [[ -n "$item_id" && -n "$status_opt" ]]; then
    gh project item-edit --id "$item_id" --project-id "$PROJECT_ID" --field-id "$STATUS_FIELD_ID" --single-select-option-id "$status_opt" >/dev/null
  fi
  if [[ -n "$item_id" && -n "$EST_FIELD_ID" && -n "$hours" ]]; then
    gh project item-edit --id "$item_id" --project-id "$PROJECT_ID" --field-id "$EST_FIELD_ID" --number "$hours" >/dev/null || true
  fi
}

echo "== 1. Prefixing existing issues (#27-#52) with IDs & placing into columns"
# Format: ISSUE_NUM|NEW_TITLE|STATUS_OPT|HOURS|CLOSE_FLAG
EXISTING=(
  "27|[BUG-01] Hidden course-card modules are still shown to students|$OPT_BUGS|11|open"
  "28|[BUG-02] Responsible teacher gets 403 when posting on the kurskort anslagstavla|$OPT_BUGS|5|open"
  "29|[BUG-03] Any student can read any kurskort's content and activity feed (IDOR)|$OPT_BUGS|7|open"
  "30|[BUG-04] Saving a kurskort in CourseCardBuilder wipes the per-module date plan|$OPT_BUGS|7|open"
  "31|[BUG-05] Kursmallar saved from the builder never auto-apply, and every save creates a duplicate|$OPT_BUGS|14|open"
  "32|[BUG-06] /profile (Min profil) shows an error|$OPT_KLAR|7|close"
  "33|[BUG-08] Revenue is 0 for Stockholm (no price entry)|$OPT_GODKAND|4|open"
  "34|[BUG-09] deploy.yml is in github/ instead of .github/ and never runs|$OPT_GODKAND|3|open"
  "35|[BUG-11] APL kit scan always reports 0 created; idempotency depends on the kit title|$OPT_BUGS|3|open"
  "36|[BUG-12] Fix the 3 known failing backend tests|$OPT_GODKAND|7|open"
  "37|[P1-01] Per-role field projection on student endpoints (personnummer, support notes, accommodations)|$OPT_BUGS|27|open"
  "38|[P1-02] Messaging tenant isolation (Mejl/Chatt)|$OPT_BUGS|22|open"
  "39|[P1-03] Move /uploads off public disk storage (authenticated file IDOR)|$OPT_BUGS|31|open"
  "40|[P1-04] Tenant scope on GET /documents/:id metadata|$OPT_BUGS|7|open"
  "41|[P1-05] Search students by first / middle / last name|$OPT_OFFERT|18|open"
  "42|[P1-06] Fine-grained per-user permission grants|$OPT_OFFERT|36|open"
  "43|[P1-07] Raise backend coverage to the 78.5 % gate (currently 68.36 %)|$OPT_GODKAND|36|open"
  "44|[P1-08] Placement wizard parity: APL 'completed elsewhere' + certificate upload|$OPT_OFFERT|9|open"
  "45|[P1-09] Placement wizard: preview end date and allow a manual exam-date override|$OPT_OFFERT|7|open"
  "46|[P1-10] Product decisions: APL tab rule, exam room list (7 vs 9), contract upload by student|$OPT_PARKING|3|open"
  "47|[P1-11] Background jobs: protect the in-process scheduler for multi-instance deploys|$OPT_GODKAND|11|open"
  "48|[P1-12] Repo hygiene: remove ~50 root-level scratch scripts and stale reports|$OPT_GODKAND|5|open"
  "49|[E2-01] Kurskort: separate anslagstavla (staff-only noticeboard) from the activity feed|$OPT_OFFERT|18|open"
  "50|[E2-02] Push kursmall changes to existing kurskort (template → courseInstances sync)|$OPT_OFFERT|27|open"
  "51|[E2-03] Innehåll: hide individual sections (moment), not only whole modules|$OPT_OFFERT|14|open"
  "52|[E2-04] Inactivity automation: admin chooses avbrott or warning email (align with spec)|$OPT_OFFERT|9|open"
)

for row in "${EXISTING[@]}"; do
  IFS='|' read -r num title status_opt hours state <<< "$row"
  url="https://github.com/$SLUG/issues/$num"
  gh issue edit "$num" --repo "$SLUG" --title "$title" >/dev/null
  if [[ "$state" == "close" ]]; then
    gh issue close "$num" --repo "$SLUG" >/dev/null || true
  fi
  sync_project_item "$url" "$status_opt" "$hours"
  echo "updated #$num -> $title"
done

# Cache all issue titles so new ones are idempotent
EXISTING_TITLES="$(gh issue list --repo "$SLUG" --state all --limit 1000 --json title,url)"

create_and_place() {
  local title="$1" labels="$2" status_opt="$3" hours="$4" close_it="$5" body="$6"
  local url
  url="$(echo "$EXISTING_TITLES" | jq -r --arg t "$title" '.[] | select(.title==$t) | .url' | head -n1)"
  if [[ -z "$url" ]]; then
    local args=(--repo "$SLUG" --title "$title" --body "$body")
    IFS=',' read -ra L <<< "$labels"; for l in "${L[@]}"; do args+=(--label "$l"); done
    url="$(gh issue create "${args[@]}")"
    echo "+ created: $title ($url)"
  else
    echo "= exists:  $title ($url)"
  fi
  if [[ "$close_it" == "close" ]]; then
    gh issue close "$url" --repo "$SLUG" >/dev/null || true
  fi
  sync_project_item "$url" "$status_opt" "$hours"
}

echo "== 2. Adding Out-of-Scope / Separate Quote items -> Parkeringsplats (Idéer)"
create_and_place "[Q-01] [Quote] AI chatbot — production readiness & GDPR/DPA" "feature,etapp-2,quote-separately,parking-lot,security" "$OPT_PARKING" 88 "open" \
  "Utanför avtalad etapplista (offertieras separat). Kräver DPA/EU-modell, kostnadstak per användare, FAQ-kurering och utvärdering. Buffrat estimat: 88 h."
create_and_place "[Q-02] [Quote] One-way SMS notifications (46elks / Sinch / Twilio)" "feature,etapp-2,quote-separately,parking-lot,needs-decision" "$OPT_PARKING" 53 "open" \
  "Utanför avtalad etapplista (offertieras separat). Kräver leverantörsval, avsändar-ID, samtycke och kostnadstak. Buffrat estimat: 53 h."
create_and_place "[Q-03] [Quote] Read-only mobile push notifications (PWA web push)" "feature,etapp-2,quote-separately,parking-lot" "$OPT_PARKING" 44 "open" \
  "Utanför avtalad etapplista (offertieras separat). Service worker + VAPID web push. Buffrat estimat: 44 h."
create_and_place "[Q-04] [Quote] Personalised APL kits (loggbok) replacing shared kurskort" "feature,etapp-2,quote-separately,parking-lot" "$OPT_PARKING" 53 "open" \
  "Utanför avtalad etapplista (offertieras separat). Mallar per program/paket, loggbok och aktivitetsfärgkoder. Buffrat estimat: 53 h."
create_and_place "[Q-05] [Quote] Automatic diplomas & studieintyg — hardening, approval & e-signing" "feature,etapp-2,quote-separately,parking-lot" "$OPT_PARKING" 36 "open" \
  "Utanför avtalad omfattning (offertieras separat). Kräver beslut om godkännandeflöde, PDF-runtime och ev. Scrive/BankID-signering. Buffrat estimat: 36 h."
create_and_place "[Q-06] [Quote] Question bank → exam generation v2 (PDF exam + answer key)" "feature,etapp-2,quote-separately,parking-lot" "$OPT_PARKING" 44 "open" \
  "Utanför avtalad etapplista (offertieras separat). Regelstyrd provgenerering, utskrifts-PDF + facit och omprovsskydd. Buffrat estimat: 44 h."
create_and_place "[Q-07] [Quote] Public prövning booking + online payment (Swish / Stripe / Klarna)" "feature,etapp-1,quote-separately,parking-lot,needs-decision" "$OPT_PARKING" 88 "open" \
  "Utanför avtalad omfattning (offertieras separat). Publikt formulär + BankID/e-postverifiering och betallösning. Buffrat estimat: 88 h."
create_and_place "[Q-08] [Quote] Scrive: automatic grade catalog generation & e-signing" "feature,etapp-1,quote-separately,parking-lot,needs-decision" "$OPT_PARKING" 53 "open" \
  "Utanför avtalad omfattning (offertieras separat). Generering av betygskataloger från låsta betyg + Scrive API. Buffrat estimat: 53 h."
create_and_place "[Q-09] [Quote] Alvis API integration for automatic student placement" "feature,etapp-1,quote-separately,parking-lot,needs-decision" "$OPT_PARKING" 71 "open" \
  "Utanför avtalad omfattning (offertieras separat). Schemalagd Alvis-import + granskningskö. Buffrat estimat: 71 h."

echo "== 3. Adding Completed Deliverables -> Klar & Redo för Demo"
create_and_place "[DONE-01] Roll- och behörighetsmatris (7 roller + kommunavgränsning)" "feature,etapp-1" "$OPT_KLAR" 40 "close" \
  "Levererat i Etapp 1: Elev, Lärare, Administratör, Systemadministratör, SYV, Specialpedagog och Praktiksamordnare med rollbaserad meny, routes och behörighetsflaggor."
create_and_place "[DONE-02] Elev- och personalregister med 6-flikars profil & global sökning" "feature,etapp-1" "$OPT_KLAR" 45 "close" \
  "Levererat i Etapp 1: Kompletta elev- och lärarprofiler (Översikt, Kurser, Betyg, Dokument, APL, Historik), snabbmeny och global sökning."
create_and_place "[DONE-03] Kurs- och kurspaketplacering med automatisk datumplanering" "feature,etapp-1" "$OPT_KLAR" 48 "close" \
  "Levererat i Etapp 1: Placering på enstaka kurser och kurspaket, studieperioder, automatisk beräkning av slutdatum/provdatum samt Excel-import."
create_and_place "[DONE-04] APL-hantering, arbetsplatser & färgkodade översiktslistor" "feature,etapp-1" "$OPT_KLAR" 36 "close" \
  "Levererat i Etapp 1: APL-vy med statusfärgkodning (saknar plats, pågående, klar), handledaruppgifter och praktikperioder."
create_and_place "[DONE-05] Betygsättning, NP-skalor, betygslåsning & F-handlingsplan (PDF)" "feature,etapp-1" "$OPT_KLAR" 42 "close" \
  "Levererat i Etapp 1: Betygsregistrering A–F/Streck, NP-bedömning, låsning av betygskatalog samt automatisk PDF-generering av åtgärdsplan vid F."
create_and_place "[DONE-06] Slutprovskalender, salshantering (7/9 salar) & prövningslista" "feature,etapp-1" "$OPT_KLAR" 32 "close" \
  "Levererat i Etapp 1: Bokningskalender för slutprov, salsöversikt och separat hantering av prövningar."
create_and_place "[DONE-07] Intäktsprognos & kommunvis ekonomirapport" "feature,etapp-1" "$OPT_KLAR" 24 "close" \
  "Levererat i Etapp 1: Ekonomisk sammanställning och intäktsberäkning per kommun och betyg."
create_and_place "[DONE-08] Kurskortsbyggare (CourseCardBuilder) & kursmallar (Etapp 2)" "feature,etapp-2" "$OPT_DEMO" 50 "open" \
  "Redo för demo i Etapp 2: Skapa och redigera kurskort med moduler, lektionsblock, uppgifter, mallar och elevvy."
create_and_place "[DONE-09] Elevens lärplattform: Mina kurser, inlämningar & framstegsspårning" "feature,etapp-2" "$OPT_DEMO" 46 "open" \
  "Redo för demo i Etapp 2: Elevportal med kurskort, modulvy, uppgiftsinlämningar, läraråterkoppling och framstegsindikator."
create_and_place "[DONE-10] Intern meddelandefunktion (Mejl / Chatt) & anslagstavla" "feature,etapp-2" "$OPT_DEMO" 30 "open" \
  "Redo för demo i Etapp 2: Meddelandetrådar mellan elev och personal samt kurskortets anslagstavla."
create_and_place "[DONE-11] Dokumenthantering, delade dokument & uppgiftslista (/profile)" "feature,etapp-1" "$OPT_DEMO" 28 "open" \
  "Redo för demo: Uppladdning, kategorisering, delning av dokument mellan personal samt personlig uppgiftslista på Min profil."
create_and_place "[DONE-12] Kvalitetssäkring & testsvit (471 frontend-tester + kodrevision)" "tech-debt,etapp-1" "$OPT_KLAR" 34 "close" \
  "Levererat: Komplett statisk kodrevision (GAP_AND_STATUS_REPORT), 471 gröna frontend-enhetstester och strukturerad ärendehantering i GitHub Projects."

echo "Done! Refresh @Mindfullearning in your browser."
