#!/bin/bash
# Weekly Teams status card (Adaptive Card) for Mindful Learning.
#
# Progress per Etapp is recalculated from the GitHub Project board, weighted by the buffered
# "Uppskattad tid (tim)" field. The card also lists the last 7 days of activity: merged PRs,
# closed issues and commits on main.
#
#   DRY_RUN=1 .github/scripts/teams/weekly-report.sh   # print the card JSON, post nothing
#
# Env: TEAMS_WEBHOOK_URL (Teams Workflows webhook), REPO, PROJECT_OWNER, PROJECT_NUMBER,
#      PROJECT_TOKEN (classic PAT with read:project + repo, needed for a user-owned project;
#      falls back to the normal gh auth), HOURS_PER_WEEK (default 35), DRY_RUN.
#
# Counting rules (same as reports/status-etapp.md):
#   in scope  = every board issue except labels quote-separately, parking-lot, meeting-action
#   group     = etapp-1 / etapp-2 label, otherwise "Drift & kvalitet"
#   done      = status "Klar" or "Redo för Demo"
#   left      = "Godkänd", "Pågående…", "Buggar och Säkerhet"   (approved work)
#   pending   = everything else (Specificerad & Offertad, Parkeringsplats, no status)
set -euo pipefail

REPO=${REPO:-Cyrus-Malekani/mindful-new}
PROJECT_OWNER=${PROJECT_OWNER:-Cyrus-Malekani}
PROJECT_NUMBER=${PROJECT_NUMBER:-1}
HOURS_PER_WEEK=${HOURS_PER_WEEK:-35}
DRY_RUN=${DRY_RUN:-0}

SINCE=$(date -u -d '7 days ago' +%Y-%m-%d)
TODAY=$(TZ=Europe/Stockholm date +%Y-%m-%d)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if [ "$DRY_RUN" != "1" ] && [ -z "${TEAMS_WEBHOOK_URL:-}" ]; then
  echo "TEAMS_WEBHOOK_URL is not set; nothing to post." >&2
  exit 0
fi

gh_project() {
  if [ -n "${PROJECT_TOKEN:-}" ]; then GH_TOKEN="$PROJECT_TOKEN" gh "$@"; else gh "$@"; fi
}

gh_project project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --limit 500 --format json > "$TMP/items.json"
gh pr list --repo "$REPO" --state merged --search "merged:>=$SINCE" --limit 100 \
  --json number,title,url,baseRefName > "$TMP/prs.json"
gh issue list --repo "$REPO" --state closed --search "closed:>=$SINCE reason:completed" --limit 100 \
  --json number,title,url > "$TMP/closed.json"
COMMITS=$(gh api --paginate "repos/$REPO/commits?sha=main&since=${SINCE}T00:00:00Z&per_page=100" --jq '.[].sha' | wc -l)

jq -n \
  --slurpfile items "$TMP/items.json" \
  --slurpfile prs "$TMP/prs.json" \
  --slurpfile closed "$TMP/closed.json" \
  --argjson commits "$COMMITS" \
  --argjson hpw "$HOURS_PER_WEEK" \
  --arg today "$TODAY" --arg since "$SINCE" --arg repo "$REPO" \
  --arg board "https://github.com/users/$PROJECT_OWNER/projects/$PROJECT_NUMBER" '
  def grp: (.labels // []) as $l
    | if ($l | index("etapp-1")) then "Etapp 1 (Avtal)"
      elif ($l | index("etapp-2")) then "Etapp 2 (Betald)"
      else "Drift & kvalitet" end;
  def bucket: (.status // "") as $s
    | if $s == "Klar" or $s == "Redo för Demo" then "done"
      elif $s == "Godkänd" or ($s | startswith("Pågående")) or $s == "Buggar och Säkerhet" then "left"
      else "pending" end;
  def hours: (."uppskattad tid (tim)" // 0) | tonumber? // 0;
  def sum(f): map(f) | add // 0;
  def pct(a; b): if b == 0 then 0 else (100 * a / b | round) end;
  def bar(p): ((p / 10) | round) as $n
    | (if $n > 0 then "█" * $n else "" end) + (if $n < 10 then "░" * (10 - $n) else "" end);
  def weeks(h): (h / $hpw * 2 | ceil) / 2;   # nearest half week, rounded up
  def big(v; lbl; col): {
    type: "Column", width: "stretch", items: [
      { type: "TextBlock", text: v, size: "ExtraLarge", weight: "Bolder", color: col, horizontalAlignment: "Center" },
      { type: "TextBlock", text: lbl, isSubtle: true, spacing: "None", horizontalAlignment: "Center", wrap: true } ] };
  def bullets(list; n): (list[:n] | map("- [#\(.number)](\(.url)) \(.title)") | join("\n"))
    + (if (list | length) > n then "\n- … och \((list | length) - n) till" else "" end);

  [ $items[0].items[]
    | select(.content.type == "Issue")
    | select(((.labels // []) as $l | ($l | index("quote-separately")) or ($l | index("parking-lot")) or ($l | index("meeting-action"))) | not)
    | { g: grp, b: bucket, h: hours } ] as $scope
  | ($scope | group_by(.g)
      | map({ name: .[0].g, total: sum(.h), done: (map(select(.b == "done")) | sum(.h)),
              left: (map(select(.b == "left")) | sum(.h)), pending: (map(select(.b == "pending")) | sum(.h)) })
      | sort_by(.name | if startswith("Etapp 1") then 0 elif startswith("Etapp 2") then 1 else 2 end)) as $groups
  | ($scope | sum(.h)) as $total
  | ($scope | map(select(.b == "done")) | sum(.h)) as $done
  | ($scope | map(select(.b == "left")) | sum(.h)) as $left
  | ($scope | map(select(.b == "pending")) | sum(.h)) as $pending
  | ($prs[0] | sort_by(.number) | reverse) as $merged
  | ($closed[0] | sort_by(.number) | reverse) as $done_issues
  | {
      type: "message",
      attachments: [ {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard", version: "1.5", msteams: { width: "Full" },
          body: ([
            { type: "Container", style: "emphasis", bleed: true, items: [
              { type: "TextBlock", text: "📊 Veckorapport: Mindful Learning", size: "Large", weight: "Bolder", wrap: true },
              { type: "TextBlock", text: "Vecka \($today | strptime("%Y-%m-%d") | strftime("%V")) · \($today)", isSubtle: true, spacing: "None" } ] },
            { type: "ColumnSet", spacing: "Medium", columns: [
              big("\(pct($done; $total)) %"; "klart av avtalad scope"; "Good"),
              big("\($left) h"; "godkänt arbete kvar (≈ \(weeks($left)) v)"; "Accent"),
              big("\($pending) h"; "väntar på beslut/offert"; "Warning") ] },
            { type: "Container", spacing: "Medium", items: (
              [ $groups[] |
                { type: "TextBlock", text: "\(.name | . + " " * ([18 - length, 1] | max))\(bar(pct(.done; .total)))  \(pct(.done; .total)) %", fontType: "Monospace", weight: "Bolder", spacing: "Small" },
                { type: "TextBlock", text: "\(.done) av \(.total) h klart · \(.left) h kvar · \(.pending) h väntar", isSubtle: true, spacing: "None", wrap: true } ] ) },
            { type: "TextBlock", text: "🗓️ Den här veckan", weight: "Bolder", spacing: "Large" },
            { type: "FactSet", spacing: "Small", facts: [
              { title: "✅ Klara ärenden", value: "\($done_issues | length)" },
              { title: "🔀 Sammanslagna PR", value: "\($merged | length)" },
              { title: "🔨 Commits på main", value: "\($commits)" } ] }
          ]
          + (if ($done_issues | length) > 0 then [
              { type: "TextBlock", text: "✅ Klart", weight: "Bolder", spacing: "Medium" },
              { type: "TextBlock", text: bullets($done_issues; 8), wrap: true, spacing: "Small" } ] else [] end)
          + (if ($merged | length) > 0 then [
              { type: "TextBlock", text: "🔀 Sammanslaget", weight: "Bolder", spacing: "Medium" },
              { type: "TextBlock", text: bullets($merged; 8), wrap: true, spacing: "Small" } ] else [] end)
          + [ { type: "TextBlock", wrap: true, isSubtle: true, size: "Small", spacing: "Large",
                text: "Timmar är buffrade estimat (bas × 2,2) från projekttavlan. \"Klart\" = levererat eller klart för demo. Veckor räknas på \($hpw) h/vecka. Idéer som offereras separat ingår inte." } ]),
          actions: [
            { type: "Action.OpenUrl", title: "Öppna projekttavlan", url: $board },
            { type: "Action.OpenUrl", title: "Veckans commits", url: "https://github.com/\($repo)/commits/main" }
          ]
        }
      } ]
    }' > "$TMP/card.json"

if [ "$DRY_RUN" = "1" ]; then
  cat "$TMP/card.json"
  exit 0
fi

curl -fsS -H "Content-Type: application/json" --data @"$TMP/card.json" "$TEAMS_WEBHOOK_URL" >/dev/null
echo "Weekly card posted."
