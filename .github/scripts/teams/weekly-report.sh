#!/bin/bash
# Weekly Teams report (Mondays 08:00 Stockholm) for the client channel.
#
#   MODE=dry-run .github/scripts/teams/weekly-report.sh     # print card + planned changes
#
# What it does:
#   1. Reads the project board, every page, and checks it: required fields exist, every
#      in-scope item has a known status and hours. Otherwise it stops and posts nothing.
#   2. Splits agreed scope (Etapp 1 + 2) into: Godkänt av kund (Klar) · Implementerat, inväntar
#      demo (Redo för Demo) · Återstående beställt arbete · Inväntar beslut/godkännande.
#      Items accepted and archived in earlier weeks are kept in the state log, so they still count.
#      "Drift & kvalitet" (no etapp label) is shown separately and kept out of the headline.
#   3. Compares with the previous report: newly accepted, newly awaiting demo, reopened.
#      The first run is labelled as the baseline.
#   4. Lists last week's activity (closed issues, PRs merged into main, commits on main). This is
#      Monday's digest, covering the whole week including Saturday and Sunday.
#   5. MODE=full: posts once per ISO week, saves the state, then archives the Klar column.
#
# Env: TEAMS_WEBHOOK_URL (client channel), PROJECT_TOKEN, GH_TOKEN, MODE, HOURS_PER_WEEK.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

HOURS_PER_WEEK=${HOURS_PER_WEEK:-35}
ITEM_LIMIT=1000
gate_stockholm_hour 08

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

WEEK=$(se_date +%G-W%V)
WEEK_NO=$(se_date +%V)
TODAY=$(se_date +%F)
TO=$(se_midnight)
FROM=$((TO - 7 * 86400))
FROM_ISO=$(iso_utc "$FROM"); TO_ISO=$(iso_utc "$TO")

state_load > "$TMP/state.json"
if [ "$MODE" = "full" ] && [ "$(jq -r '.lastWeekly // ""' "$TMP/state.json")" = "$WEEK" ]; then
  log "The report for $WEEK has already been posted; not posting again."
  exit 0
fi

# ── Data ────────────────────────────────────────────────────────────────────────────────────
gh_project project field-list "$PROJECT_NUMBER" --owner "$PROJECT_GH_OWNER" --format json > "$TMP/fields.json" \
  || die "Cannot read the project fields. Check PROJECT_TOKEN (classic PAT: project, repo, read:org, read:discussion)."
gh_project project item-list "$PROJECT_NUMBER" --owner "$PROJECT_GH_OWNER" --limit "$ITEM_LIMIT" --format json > "$TMP/items.json" \
  || die "Cannot read the project items. Check PROJECT_TOKEN."
gh issue list --repo "$REPO" --state all --limit 1000 --json number,state > "$TMP/issue_states.json"
gh issue list --repo "$REPO" --state closed --search "closed:$FROM_ISO..$TO_ISO reason:completed" --limit 200 \
  --json number,title,url > "$TMP/closed.json"
gh pr list --repo "$REPO" --base main --state merged --search "merged:$FROM_ISO..$TO_ISO" --limit 200 \
  --json number,title,url > "$TMP/merged.json"
COMMITS=$(gh api --paginate "repos/$REPO/commits?sha=main&since=$FROM_ISO&until=$TO_ISO&per_page=100" --jq '.[].sha' | sort -u | grep -c . || true)

jq -e '[.fields[].name] as $n | ($n | index("Status")) and ($n | index("Uppskattad tid (tim)"))' "$TMP/fields.json" >/dev/null \
  || die "The board is missing the field 'Status' or 'Uppskattad tid (tim)'."
[ "$(jq '.items | length' "$TMP/items.json")" -lt "$ITEM_LIMIT" ] || die "The board has $ITEM_LIMIT+ items; raise ITEM_LIMIT."

# ── Calculation (deterministic, jq) ─────────────────────────────────────────────────────────
jq -n \
  --slurpfile items "$TMP/items.json" --slurpfile st "$TMP/issue_states.json" --slurpfile state "$TMP/state.json" \
  --arg week "$WEEK" --arg today "$TODAY" '
  def grp: (.labels // []) as $l
    | if ($l | index("etapp-1")) then "Etapp 1 (Avtal)" elif ($l | index("etapp-2")) then "Etapp 2 (Betald)" else "Drift & kvalitet" end;
  def bucket: . as $s
    | if $s == "Klar" then "accepted"
      elif $s == "Redo för Demo" then "demo"
      elif $s == "Godkänd" or ($s | startswith("Pågående")) or $s == "Buggar och Säkerhet" then "left"
      elif $s == "Specificerad & Offertad" or ($s | startswith("Parkeringsplats")) then "pending"
      else "unknown" end;
  def sumh(f): [ .[] | select(f) | .h ] | add // 0;
  ($st[0] | map({ key: (.number | tostring), value: .state }) | from_entries) as $istate
  | ($state[0] // {}) as $prev
  | [ $items[0].items[]
      | select(.content.type == "Issue")
      | select(((.labels // []) as $l | ($l | index("quote-separately")) or ($l | index("parking-lot")) or ($l | index("meeting-action"))) | not)
      | grp as $g
      | { n: .content.number, title: .content.title, url: .content.url, g: $g, internal: ($g == "Drift & kvalitet"),
          status: .status, h: (."uppskattad tid (tim)" | if . == null then null else (tonumber? // null) end),
          item: .id, istate: ($istate[(.content.number | tostring)] // "UNKNOWN") } ] as $live
  | [ $live[]
      | select(.status == null or .h == null or (.status | bucket) == "unknown")
      | "#\(.n) \(.title): " + ([ (if .status == null then "saknar status" elif (.status | bucket) == "unknown" then "okänd status \"\(.status)\"" else empty end),
                                (if .h == null then "saknar timmar" else empty end) ] | join(", ")) ] as $problems
  | if ($problems | length) > 0 then { problems: $problems } else
      ($live | map(.n)) as $liveNums
      | [ ($prev.accepted // [])[] | select(.n as $x | $liveNums | index($x) | not) | . + { status: "Klar", archived: true } ] as $ledger
      | ($live + $ledger | map(. + { b: (.status | bucket) })) as $rows
      | ($rows | group_by(.g) | map({
          name: .[0].g, internal: .[0].internal, total: sumh(true),
          accepted: sumh(.b == "accepted"), demo: sumh(.b == "demo"), left: sumh(.b == "left"), pending: sumh(.b == "pending") })
        | sort_by(.name | if startswith("Etapp 1") then 0 elif startswith("Etapp 2") then 1 else 2 end)) as $groups
      | ($rows | map(select(.internal | not))) as $scope
      | {
          problems: [],
          baseline: (($prev.snapshot // null) == null),
          groups: $groups,
          total: ($scope | sumh(true)), accepted: ($scope | sumh(.b == "accepted")), demo: ($scope | sumh(.b == "demo")),
          left: ($scope | sumh(.b == "left")), pending: ($scope | sumh(.b == "pending")),
          today: $today,
          changes: (if ($prev.snapshot // null) == null then null else
            ($prev.snapshot) as $s | {
              accepted: [ $live[] | select(.status == "Klar" and ($s[(.n | tostring)].status // "") != "Klar") | { n, title, url } ],
              demo:     [ $live[] | select(.status == "Redo för Demo" and ($s[(.n | tostring)].status // "") != "Redo för Demo") | { n, title, url } ],
              reopened: [ $live[] | select(.istate == "OPEN" and ($s[(.n | tostring)].istate // "") == "CLOSED") | { n, title, url } ]
            } end),
          archive: [ $live[] | select(.status == "Klar") | { n, title, item } ],
          newState: {
            version: 1,
            lastWeekly: $week,
            lastDigest: ($prev.lastDigest // null),
            snapshot: ($live | map({ key: (.n | tostring), value: { status, istate } }) | from_entries),
            accepted: (($prev.accepted // []) + [ $live[] | select(.status == "Klar") | { n, title, url, g, internal, h, week: $week } ]
                       | group_by(.n) | map(.[0]))
          }
        }
    end' > "$TMP/report.json"

if [ "$(jq '.problems | length' "$TMP/report.json")" -gt 0 ]; then
  log "The board is incomplete. No report is posted until it is fixed:"
  jq -r '.problems[] | "  - " + .' "$TMP/report.json" >&2
  exit 1
fi

# ── Card ────────────────────────────────────────────────────────────────────────────────────
jq -n --slurpfile r "$TMP/report.json" --slurpfile closed "$TMP/closed.json" --slurpfile merged "$TMP/merged.json" \
  --argjson commits "$COMMITS" --argjson hpw "$HOURS_PER_WEEK" --arg weekNo "$WEEK_NO" \
  --arg board "https://github.com/users/$PROJECT_OWNER/projects/$PROJECT_NUMBER" "$JQ_SWE_TITLE"'
  $r[0] as $r
  | def pct(a; b): if b == 0 then 0 else (100 * a / b | round) end;
    def weeks(h): (h / $hpw * 2 | ceil) / 2;
    def rep(s; k): if k > 0 then s * k else "" end;
    def bar(a; d; t): (if t == 0 then 0 else (10 * a / t | round) end) as $x
      | (if t == 0 then 0 else ([10 * (a + d) / t | round, 10] | min) end) as $y
      | rep("█"; $x) + rep("▓"; $y - $x) + rep("░"; 10 - $y);
    def tile(v; l; c): { type: "Column", width: "stretch", items: [
      { type: "TextBlock", text: v, size: "ExtraLarge", weight: "Bolder", color: c, horizontalAlignment: "Center" },
      { type: "TextBlock", text: l, isSubtle: true, spacing: "None", horizontalAlignment: "Center", wrap: true } ] };
    def list(xs; n; f): (xs[:n] | map(f) | join("\n")) + (if (xs | length) > n then "\n- … och \((xs | length) - n) till" else "" end);
    def section(title; xs; f): if (xs | length) == 0 then [] else
      [ { type: "TextBlock", text: title, weight: "Bolder", spacing: "Medium" },
        { type: "TextBlock", text: list(xs; 8; f), wrap: true, spacing: "Small" } ] end;
  { body: ([
      { type: "Container", style: "emphasis", bleed: true, items: [
        { type: "TextBlock", text: "📊 Veckorapport v.\($weekNo): Mindful Learning", size: "Large", weight: "Bolder", wrap: true },
        { type: "TextBlock", text: "\($r.today) · Etapp 1 & 2 enligt avtal", isSubtle: true, spacing: "None" } ] } ]
    + (if $r.baseline then [ { type: "TextBlock", wrap: true, color: "Accent", spacing: "Small",
        text: "ℹ️ Första rapporten: detta är baslinjen. Från nästa vecka visas vad som har ändrats sedan föregående rapport." } ] else [] end)
    + [ { type: "ColumnSet", spacing: "Medium", columns: [
          tile("\(pct($r.accepted; $r.total)) %"; "godkänt av er"; "Good"),
          tile("\(pct($r.demo; $r.total)) %"; "klart, inväntar demo"; "Accent"),
          tile("\($r.left) h"; "beställt arbete kvar (≈ \(weeks($r.left)) v)"; "Default"),
          tile("\($r.pending) h"; "inväntar ert beslut"; "Warning") ] },
        { type: "Container", spacing: "Medium", items: [ $r.groups[] |
          { type: "TextBlock", fontType: "Monospace", weight: "Bolder", spacing: "Small",
            text: "\(.name | . + rep(" "; [18 - length, 1] | max))\(bar(.accepted; .demo; .total))  \(pct(.accepted + .demo; .total)) %" },
          { type: "TextBlock", isSubtle: true, spacing: "None", wrap: true,
            text: (if .internal then "\(.accepted + .demo) av \(.total) h klart · \(.pending) h inväntar beslut (ingår inte i procenten ovan)"
                   else "godkänt \(.accepted) h · inväntar demo \(.demo) h · kvar \(.left) h · inväntar beslut \(.pending) h (av \(.total) h)" end) } ] },
        { type: "TextBlock", text: "█ godkänt av er   ▓ klart, inväntar demo   ░ kvar", fontType: "Monospace", isSubtle: true, size: "Small", spacing: "None" } ]
    + (if $r.changes == null then [] else
        section("✅ Godkänt sedan förra rapporten"; $r.changes.accepted; "- [#\(.n)](\(.url)) \(.title)")
      + section("🎬 Klart, inväntar demo"; $r.changes.demo; "- [#\(.n)](\(.url)) \(.title)")
      + section("↩️ Återöppnat"; $r.changes.reopened; "- [#\(.n)](\(.url)) \(.title)") end)
    + [ { type: "TextBlock", text: "🗓️ Förra veckans arbete", weight: "Bolder", spacing: "Large" },
        { type: "FactSet", spacing: "Small", facts: [
          { title: "Avslutade ärenden", value: "\($closed[0] | length)" },
          { title: "Nytt i huvudversionen (PR)", value: "\($merged[0] | length)" },
          { title: "Sparade ändringar på main", value: "\($commits)" } ] } ]
    + section(if $r.baseline then "Avslutat (inklusive ärenden som stängdes när tavlan städades inför första rapporten)" else "Avslutat" end;
              ($closed[0] | sort_by(.number) | reverse); "- [#\(.number)](\(.url)) \(.title)")
    + section("Nytt i huvudversionen"; ($merged[0] | sort_by(.number) | reverse); "- [#\(.number)](\(.url)) \(.title | swe_title)")
    + [ { type: "TextBlock", wrap: true, isSubtle: true, size: "Small", spacing: "Large",
          text: "Procent och timmar avser avtalad omfattning i Etapp 1 och 2. Timmarna är planerade, buffrade estimat (bas × 2,2), inte nedlagd tid. Veckor är en uppskattning vid \($hpw) h/vecka, inte ett leveranslöfte. \"Nytt i huvudversionen\" betyder inte driftsatt eller godkänt. Idéer som offereras separat ingår inte." } ]),
    actions: [ { type: "Action.OpenUrl", title: "Öppna projekttavlan", url: $board } ] }' | card_envelope > "$TMP/card.json"

# ── Deliver ─────────────────────────────────────────────────────────────────────────────────
log "Week $WEEK · activity window $(se_date '+%F %H:%M' "$FROM") → $(se_date '+%F %H:%M' "$TO") (Stockholm)"
log "Klar items to archive after posting: $(jq -r '[.archive[] | "#\(.n)"] | join(" ") | if . == "" then "none" else . end' "$TMP/report.json")"
post_card "$TMP/card.json" "${TEAMS_WEBHOOK_URL:-}"

if [ "$MODE" = "full" ]; then
  jq '.newState' "$TMP/report.json" > "$TMP/newstate.json"
  state_save "$TMP/newstate.json" "Weekly report $WEEK"
  jq -r '.archive[].item' "$TMP/report.json" | while read -r item; do
    gh_project_write project item-archive "$PROJECT_NUMBER" --owner "$PROJECT_GH_OWNER" --id "$item" >/dev/null \
      || log "⚠️ Could not archive $item (it stays on the board and is counted once)."
  done
fi
