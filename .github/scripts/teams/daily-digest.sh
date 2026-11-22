#!/bin/bash
# Daily Teams digest for the client channel: Tuesday–Saturday 09:00 Stockholm, covering the
# previous day (00:00–24:00). Monday has no digest: the weekly report covers the whole week.
#
#   MODE=dry-run .github/scripts/teams/daily-digest.sh
#
# Lists issues closed as completed and PRs merged into main (with Swedish labels for
# conventional titles), and counts commits across all branches, so work on branches that are
# not merged yet still shows. No post on a day without activity; never twice for the same day.
#
# Env: TEAMS_WEBHOOK_URL (client channel), GH_TOKEN, MODE.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

gate_stockholm_hour 09

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

TO=$(se_midnight)
FROM=$(se_midnight $((TO - 3600)))        # yesterday 00:00, correct on 23/25-hour DST days
DAY=$(se_date +%F "$FROM")
FROM_ISO=$(iso_utc "$FROM"); TO_ISO=$(iso_utc "$TO")

state_load > "$TMP/state.json"
if [ "$MODE" = "full" ] && [ "$(jq -r '.lastDigest // ""' "$TMP/state.json")" = "$DAY" ]; then
  log "The digest for $DAY has already been posted; not posting again."
  exit 0
fi

gh issue list --repo "$REPO" --state closed --search "closed:$FROM_ISO..$TO_ISO reason:completed" --limit 200 \
  --json number,title,url > "$TMP/closed.json"
gh pr list --repo "$REPO" --base main --state merged --search "merged:$FROM_ISO..$TO_ISO" --limit 200 \
  --json number,title,url > "$TMP/merged.json"
gh api --paginate "repos/$REPO/branches?per_page=100" --jq '.[].name' | grep -vx "$STATE_BRANCH" > "$TMP/branches" || true
: > "$TMP/shas"
while read -r b; do
  gh api --paginate "repos/$REPO/commits?sha=$(jq -rn --arg b "$b" '$b | @uri')&since=$FROM_ISO&until=$TO_ISO&per_page=100" \
    --jq '.[].sha' >> "$TMP/shas" 2>/dev/null || true
done < "$TMP/branches"
COMMITS=$(sort -u "$TMP/shas" | grep -c . || true)

CLOSED=$(jq length "$TMP/closed.json"); MERGED=$(jq length "$TMP/merged.json")
log "Digest for $DAY (Stockholm): $CLOSED closed, $MERGED merged into main, $COMMITS commits on $(wc -l < "$TMP/branches") branches"
if [ "$CLOSED" -eq 0 ] && [ "$MERGED" -eq 0 ] && [ "$COMMITS" -eq 0 ]; then
  log "No activity; nothing is posted."
  exit 0
fi

jq -n --slurpfile closed "$TMP/closed.json" --slurpfile merged "$TMP/merged.json" \
  --argjson commits "$COMMITS" --arg day "$DAY" \
  --arg board "https://github.com/users/$PROJECT_OWNER/projects/$PROJECT_NUMBER" "$JQ_SWE_TITLE$JQ_SWE_DATE"'
  def list(xs; n; f): (xs[:n] | map(f) | join("\n")) + (if (xs | length) > n then "\n- … och \((xs | length) - n) till" else "" end);
  def section(title; xs; f): if (xs | length) == 0 then [] else
    [ { type: "TextBlock", text: title, weight: "Bolder", spacing: "Medium" },
      { type: "TextBlock", text: list(xs; 8; f), wrap: true, spacing: "Small" } ] end;
  { body: ([
      { type: "TextBlock", text: "🗓️ Gårdagens arbete: \($day | swe_date)", size: "Medium", weight: "Bolder", wrap: true },
      { type: "FactSet", spacing: "Small", facts: [
        { title: "✅ Avslutade ärenden", value: "\($closed[0] | length)" },
        { title: "🔀 Nytt i huvudversionen", value: "\($merged[0] | length)" },
        { title: "🔨 Sparade ändringar", value: "\($commits)" } ] } ]
    + section("Avslutat"; ($closed[0] | sort_by(.number) | reverse); "- [#\(.number)](\(.url)) \(.title)")
    + section("Nytt i huvudversionen"; ($merged[0] | sort_by(.number) | reverse); "- [#\(.number)](\(.url)) \(.title | swe_title)")
    + [ { type: "TextBlock", wrap: true, isSubtle: true, size: "Small", spacing: "Medium",
          text: "\"Sparade ändringar\" räknar arbete på alla grenar, även sådant som ännu inte är klart. \"Nytt i huvudversionen\" betyder inte driftsatt eller godkänt." } ]),
    actions: [ { type: "Action.OpenUrl", title: "Öppna projekttavlan", url: $board } ] }' \
  | card_envelope > "$TMP/card.json"

post_card "$TMP/card.json" "${TEAMS_WEBHOOK_URL:-}"

if [ "$MODE" = "full" ]; then
  jq --arg day "$DAY" '. + { lastDigest: $day }' "$TMP/state.json" > "$TMP/newstate.json"
  state_save "$TMP/newstate.json" "Daily digest $DAY"
fi
