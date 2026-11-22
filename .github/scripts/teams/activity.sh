#!/bin/bash
# Live Teams activity cards for the INTERNAL channel, run by .github/workflows/teams-activity.yml.
#
#   push          → "🔨 N nya commits på <branch>". Lists only commits pushed for the first time
#                   (GitHub's `distinct` flag), so merging a branch doesn't re-announce its commits.
#   issues closed → "✅ Klart: #N title" (closed as completed only, not "not planned").
#
# All text comes from the event JSON via jq. Nothing from the event is put into shell code.
#
#   GITHUB_EVENT_NAME=push GITHUB_EVENT_PATH=event.json DRY_RUN=1 .github/scripts/teams/activity.sh
#
# Env: TEAMS_DEV_WEBHOOK_URL (internal channel; the client channel gets the daily digest instead),
#      GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, DRY_RUN (1 = print, don't post).
set -euo pipefail

DRY_RUN=${DRY_RUN:-0}
EVENT=${GITHUB_EVENT_NAME:?GITHUB_EVENT_NAME is required}
PAYLOAD=${GITHUB_EVENT_PATH:?GITHUB_EVENT_PATH is required}
MAX_COMMITS=10

if [ "$DRY_RUN" != "1" ] && [ -z "${TEAMS_DEV_WEBHOOK_URL:-}" ]; then
  echo "TEAMS_DEV_WEBHOOK_URL is not set; nothing to post." >&2
  exit 0
fi

card() {  # wraps an Adaptive Card body + actions (JSON on stdin) in the Teams message envelope
  jq '{
    type: "message",
    attachments: [ {
      contentType: "application/vnd.microsoft.card.adaptive",
      contentUrl: null,
      content: ({ "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                  type: "AdaptiveCard", version: "1.5", msteams: { width: "Full" } } + .)
    } ]
  }'
}

case "$EVENT" in
  push)
    BODY=$(jq --argjson max "$MAX_COMMITS" '
      if (.deleted // false) or (.ref | startswith("refs/heads/") | not) then empty else
      (.ref | sub("^refs/heads/"; "")) as $branch
      | [ .commits[]? | select(.distinct) ] as $new
      | if ($new | length) == 0 then empty else
        { body: [
            { type: "TextBlock", size: "Medium", weight: "Bolder", wrap: true,
              text: "🔨 \($new | length) \(if ($new | length) == 1 then "ny commit" else "nya commits" end) på \($branch)" },
            { type: "TextBlock", isSubtle: true, spacing: "None", wrap: true,
              text: "\(.repository.name) · av \(.pusher.name // .sender.login)" },
            { type: "TextBlock", wrap: true, spacing: "Small",
              text: ([ $new[:$max][]
                       | "- [`\(.id[:7])`](\(.url)) \(.message | split("\n")[0] | .[:120])" ] | join("\n"))
                    + (if ($new | length) > $max then "\n- … och \(($new | length) - $max) till" else "" end) }
          ],
          actions: [ { type: "Action.OpenUrl", title: "Visa ändringar", url: .compare } ] }
        end
      end' "$PAYLOAD")
    ;;
  issues)
    BODY=$(jq '
      if .action != "closed" or (.issue.state_reason // "completed") != "completed" then empty else
      { body: [
          { type: "TextBlock", size: "Medium", weight: "Bolder", wrap: true,
            text: "✅ Klart: #\(.issue.number) \(.issue.title)" },
          { type: "TextBlock", isSubtle: true, spacing: "None", wrap: true,
            text: ([ .repository.name ]
                   + ([ .issue.labels[]?.name | select(test("^(etapp-|bug$|feature$|security$|priority:)")) ] | if length > 0 then [ join(", ") ] else [] end)
                   + [ "stängt av \(.sender.login)" ] | join(" · ")) }
        ],
        actions: [ { type: "Action.OpenUrl", title: "Öppna ärendet", url: .issue.html_url } ] }
      end' "$PAYLOAD")
    ;;
  *)
    echo "Ignoring event $EVENT" >&2
    exit 0
    ;;
esac

if [ -z "$BODY" ]; then
  echo "Nothing to announce for this $EVENT event." >&2
  exit 0
fi

printf '%s' "$BODY" | card > "${RUNNER_TEMP:-/tmp}/teams-card.json"
if [ "$DRY_RUN" = "1" ]; then
  cat "${RUNNER_TEMP:-/tmp}/teams-card.json"
  exit 0
fi
curl -fsS -H "Content-Type: application/json" --data @"${RUNNER_TEMP:-/tmp}/teams-card.json" "$TEAMS_DEV_WEBHOOK_URL" >/dev/null
echo "Teams card posted for $EVENT."
