#!/bin/bash
# Tests for the Teams reporting scripts (.github/scripts/teams). Run: bash tests/teams/teams.test.sh
# `gh` and `curl` are stubbed with fixtures; state lives in a temp dir. No network, no GitHub.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SCRIPTS="$ROOT/.github/scripts/teams"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
PASS=0; FAIL=0; CASE=""

# ── stubs ──────────────────────────────────────────────────────────────────────────────────
mkdir -p "$WORK/bin"
cat > "$WORK/bin/gh" <<'EOF'
#!/bin/bash
F=$FIX
echo "gh $*" >> "$F/calls.log"
a="$*"
case "$a" in
  "project field-list"*) cat "$F/fields.json" ;;
  "project item-list"*)  cat "$F/items.json" ;;
  "project item-archive"*) echo "$a" >> "$F/archived.log" ;;
  "issue list"*"--state all"*) cat "$F/issue_states.json" ;;
  "issue list"*) cat "$F/closed.json" ;;
  "pr list"*) cat "$F/merged.json" ;;
  "api --paginate repos/"*"/branches"*) printf 'main\nfeat/x\nreports-state\n' ;;
  "api --paginate repos/"*"/commits"*"committer.date"*) printf '2025-02-11T10:00:00Z\n2026-11-20T10:00:00Z\n2026-11-21T10:00:00Z\n' ;;
  "api --paginate repos/"*"/commits"*) cat "$F/commits.txt" ;;
  "api -X GET search/issues"*"is:pr"*) echo 91 ;;
  "api -X GET search/issues"*) echo 40 ;;
  "api repos/"*"/contents/"*)
    [ -f "$F/state.json" ] || exit 1
    jq -n --arg c "$(base64 -w0 < "$F/state.json")" '{ sha: "s1", content: $c }' ;;
  "api repos/"*"/git/ref/heads/"*) [ -f "$F/branch" ] || exit 1 ;;
  "api -X POST repos/"*"/git/trees"*|"api -X POST repos/"*"/git/commits"*) echo "sha123" ;;
  "api -X POST repos/"*"/git/refs"*) touch "$F/branch" ;;
  "api -X PUT repos/"*"/contents/"*)
    for x in "$@"; do case "$x" in content=*) printf '%s' "${x#content=}" | base64 -d > "$F/state.json" ;; esac; done ;;
  *) echo "unexpected gh call: $a" >&2; exit 9 ;;
esac
EOF
cat > "$WORK/bin/curl" <<'EOF'
#!/bin/bash
for x in "$@"; do case "$x" in @*) cp "${x#@}" "$FIX/posted-$(date +%s%N).json" ;; esac; done
EOF
chmod +x "$WORK/bin/"*

# ── fixtures ───────────────────────────────────────────────────────────────────────────────
item() {  # item <n> <status|null> <hours|null> <label>
  jq -n --argjson n "$1" --arg s "$2" --arg h "$3" --arg l "$4" '{
    id: "PVTI_\($n)", status: (if $s == "null" then null else $s end),
    "uppskattad tid (tim)": (if $h == "null" then null else ($h | tonumber) end),
    labels: [$l], content: { type: "Issue", number: $n, title: "Ärende \($n)", url: "https://x/issues/\($n)" } }'
}
board() { jq -s '{ items: . }' > "$FIX/items.json"; }
setup() {
  CASE=$1; FIX="$WORK/$CASE"; mkdir -p "$FIX"; export FIX
  echo '{"fields":[{"name":"Status"},{"name":"Uppskattad tid (tim)"}]}' > "$FIX/fields.json"
  { item 1 "Klar" 10 etapp-1; item 2 "Redo för Demo" 20 etapp-1; item 3 "Godkänd" 30 etapp-1
    item 4 "Specificerad & Offertad" 40 etapp-2; item 5 "Klar" 5 tech-debt; item 6 "Parkeringsplats (Idéer)" 99 parking-lot; } | board
  jq -n '[range(1;7) | { number: ., state: (if . == 1 or . == 5 then "CLOSED" else "OPEN" end) }]' > "$FIX/issue_states.json"
  echo '[{"number":1,"title":"Ärende 1","url":"https://x/issues/1"}]' > "$FIX/closed.json"
  echo '[{"number":90,"title":"fix(kurskort): behåll dolda moduler","url":"https://x/pull/90"}]' > "$FIX/merged.json"
  printf 'aaa\nbbb\n' > "$FIX/commits.txt"
  : > "$FIX/calls.log"
}
run() {  # run <script> [env...]  → OUT, CODE, CARD (last posted card, or stdout in dry-run)
  local s=$1; shift
  OUT=$(cd "$WORK" && env PATH="$WORK/bin:$PATH" REPO=o/r "$@" bash "$SCRIPTS/$s" 2>"$FIX/err"); CODE=$?
  ERR=$(cat "$FIX/err")
}
last_post() { ls -t "$FIX"/posted-*.json 2>/dev/null | head -1; }
posts() { ls "$FIX"/posted-*.json 2>/dev/null | wc -l; }
card_text() { jq -r '[.attachments[0].content | .. | .text? // empty, (.facts? // [] | .[] | "\(.title): \(.value)")] | join("\n")' "$1"; }

ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); echo "  ✗ [$CASE] $*"; }
eq()  { [ "$2" = "$3" ] && ok || bad "$1: expected '$3', got '$2'"; }
has() { grep -qF -- "$2" <<<"$1" && ok || bad "expected '$2'"; }
hasnt() { grep -qF -- "$2" <<<"$1" && bad "did not expect '$2'" || ok; }

MON_0800=$(TZ=Europe/Stockholm date -d "2026-11-23 08:00" +%s)
MON_0700=$(TZ=Europe/Stockholm date -d "2026-11-23 07:00" +%s)
NEXT_MON=$(TZ=Europe/Stockholm date -d "2026-11-30 08:00" +%s)
TUE_0900=$(TZ=Europe/Stockholm date -d "2026-11-24 09:00" +%s)

# ── weekly ─────────────────────────────────────────────────────────────────────────────────
setup weekly-baseline
run weekly-report.sh MODE=full NOW=$MON_0800 TEAMS_WEBHOOK_URL=https://hook
eq "exit" "$CODE" 0; eq "posts" "$(posts)" 1
T=$(card_text "$(last_post)")
# scope: Etapp items 1–4 = 100 h; accepted 10 (10 %), demo 20 (20 %), left 30, pending 40; internal #5 and parking-lot #6 excluded
has "$T" "10 %"; has "$T" "20 %"; has "$T" "30 h"; has "$T" "40 h"
has "$T" "Lägesrapport: allt fram till nu"
has "$T" "Första rapporten: en sammanställning av allt som gjorts hittills"
has "$T" "Hittills i projektet (sedan tisdag 11 februari 2025)"
has "$T" "Sparade ändringar (commits): 3"; has "$T" "Avslutade ärenden: 40"; has "$T" "Sammanslagna ändringspaket (PR): 91"
has "$T" "Rättning: Behåll dolda moduler"
has "$T" "Drift & kvalitet"
[ -f "$FIX/archived.log" ] && bad "baseline archived items" || ok
has "$ERR" "the Klar column is kept"
eq "state week" "$(jq -r .lastWeekly "$FIX/state.json")" "2026-W48"
eq "ledger" "$(jq -c '[.accepted[].n]' "$FIX/state.json")" "[1,5]"
[ -f "$FIX/branch" ] && ok || bad "state branch not created"

# same week again → no second post
run weekly-report.sh MODE=full NOW=$MON_0800 TEAMS_WEBHOOK_URL=https://hook
eq "exit (dedup)" "$CODE" 0; eq "posts (dedup)" "$(posts)" 1; has "$ERR" "already been posted"

CASE=weekly-next-week
# next week: #1 and #5 archived (gone from board), #2 accepted, #3 reopened → archived items still count
{ item 2 "Klar" 20 etapp-1; item 3 "Godkänd" 30 etapp-1; item 4 "Specificerad & Offertad" 40 etapp-2; } | board
jq -n '[{number:2,state:"CLOSED"},{number:3,state:"OPEN"},{number:4,state:"OPEN"}]' > "$FIX/issue_states.json"
jq '.snapshot["3"].istate = "CLOSED"' "$FIX/state.json" > "$FIX/s" && mv "$FIX/s" "$FIX/state.json"
run weekly-report.sh MODE=full NOW=$NEXT_MON TEAMS_WEBHOOK_URL=https://hook
eq "exit (week 2)" "$CODE" 0; eq "posts (week 2)" "$(posts)" 2
T=$(card_text "$(last_post)")
has "$T" "30 %"            # accepted = #1 (ledger, 10 h) + #2 (20 h) of 100 h
hasnt "$T" "Lägesrapport"; hasnt "$T" "Hittills i projektet"; has "$T" "Veckorapport v.49"
eq "archived (week 2)" "$(wc -l < "$FIX/archived.log")" 1   # #2, now Klar
has "$T" "Godkänt sedan förra rapporten"; has "$T" "Ärende 2"
has "$T" "Återöppnat"; has "$T" "Ärende 3"

setup weekly-incomplete
{ item 1 "Klar" null etapp-1; item 2 "Okänd kolumn" 5 etapp-2; } | board
run weekly-report.sh MODE=full NOW=$MON_0800 TEAMS_WEBHOOK_URL=https://hook
eq "exit (incomplete)" "$CODE" 1; eq "posts (incomplete)" "$(posts)" 0
has "$ERR" "#1 Ärende 1: saknar timmar"; has "$ERR" "#2 Ärende 2: okänd status"

setup weekly-dryrun
run weekly-report.sh MODE=dry-run NOW=$MON_0800
eq "exit (dry-run)" "$CODE" 0; eq "posts (dry-run)" "$(posts)" 0
has "$OUT" '"AdaptiveCard"'
hasnt "$(cat "$FIX/calls.log")" "-X PUT"; hasnt "$(cat "$FIX/calls.log")" "item-archive"; hasnt "$(cat "$FIX/calls.log")" "-X POST"

setup weekly-testpost
run weekly-report.sh MODE=test-post NOW=$MON_0800 TEAMS_WEBHOOK_URL=https://hook
eq "posts (test-post)" "$(posts)" 1; has "$(card_text "$(last_post)")" "🧪 TEST"
[ -f "$FIX/state.json" ] && bad "test-post wrote state" || ok
[ -f "$FIX/archived.log" ] && bad "test-post archived" || ok

setup weekly-dst-slot
run weekly-report.sh MODE=full NOW=$MON_0700 GITHUB_EVENT_NAME=schedule TEAMS_WEBHOOK_URL=https://hook
eq "posts (07:00 slot)" "$(posts)" 0; has "$ERR" "other DST slot"
run weekly-report.sh MODE=full NOW=$MON_0800 GITHUB_EVENT_NAME=schedule TEAMS_WEBHOOK_URL=https://hook
eq "posts (08:00 slot)" "$(posts)" 1

setup weekly-no-secret
run weekly-report.sh MODE=full NOW=$MON_0800
eq "exit (no webhook)" "$CODE" 1; has "$ERR" "No webhook URL"

# ── daily ──────────────────────────────────────────────────────────────────────────────────
setup daily
run daily-digest.sh MODE=full NOW=$TUE_0900 TEAMS_WEBHOOK_URL=https://hook
eq "exit (daily)" "$CODE" 0; eq "posts (daily)" "$(posts)" 1
T=$(card_text "$(last_post)")
has "$T" "Gårdagens arbete: måndag 23 november 2026"
has "$T" "🔨 Sparade ändringar: 2"     # same 2 SHAs on main and feat/x, counted once; reports-state skipped
has "$T" "Rättning: Behåll dolda moduler"
eq "lastDigest" "$(jq -r .lastDigest "$FIX/state.json")" "2026-11-23"
hasnt "$(cat "$FIX/calls.log")" "sha=reports-state"
run daily-digest.sh MODE=full NOW=$TUE_0900 TEAMS_WEBHOOK_URL=https://hook
eq "posts (daily dedup)" "$(posts)" 1

setup daily-empty
echo '[]' > "$FIX/closed.json"; echo '[]' > "$FIX/merged.json"; : > "$FIX/commits.txt"
run daily-digest.sh MODE=full NOW=$TUE_0900 TEAMS_WEBHOOK_URL=https://hook
eq "posts (empty day)" "$(posts)" 0; has "$ERR" "No activity"

setup daily-dst
# 2027-03-28 is the spring-forward day (23 h); the digest on the 29th must cover exactly that day.
run daily-digest.sh MODE=dry-run NOW=$(TZ=Europe/Stockholm date -d "2027-03-29 09:00" +%s)
has "$ERR" "Digest for 2027-03-28"
has "$(cat "$FIX/calls.log")" "closed:2027-03-27T23:00:00+00:00..2027-03-28T22:00:00+00:00"

echo
echo "Teams reporting tests: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
