#!/bin/bash
# Shared helpers for the Teams reporting scripts (sourced, not run).
#
# MODE controls side effects (default dry-run):
#   dry-run    print the card and the planned changes; post nothing, write nothing
#   test-post  post the card (with a TEST banner); write no state, archive nothing
#   full       post once per day/week (deduplicated), then save state and archive
#
# State lives in $STATE_PATH on the branch $STATE_BRANCH (created on first full run). It is
# read and written through the contents API, so no checkout is needed. Commits made with the
# workflow's GITHUB_TOKEN do not trigger other workflows.

REPO=${REPO:-Cyrus-Malekani/Mindfullearning}
PROJECT_OWNER=${PROJECT_OWNER:-Cyrus-Malekani}
PROJECT_NUMBER=${PROJECT_NUMBER:-1}
# Owner as passed to `gh project`. "@me" (the token's owner) skips gh's user/organization lookup,
# which fails with "unknown owner type" for tokens without org read access. PROJECT_OWNER is
# still used for links.
PROJECT_GH_OWNER=${PROJECT_GH_OWNER:-$PROJECT_OWNER}
STATE_BRANCH=${STATE_BRANCH:-reports-state}
STATE_PATH=${STATE_PATH:-teams-state.json}
MODE=${MODE:-dry-run}
TZ_SE=Europe/Stockholm

case "$MODE" in dry-run|test-post|full) ;; *) echo "Unknown MODE=$MODE (dry-run|test-post|full)" >&2; exit 2 ;; esac

die() { echo "❌ $*" >&2; exit 1; }
log() { echo "$*" >&2; }

# "Now" can be pinned for tests (epoch seconds).
now() { echo "${NOW:-$(date +%s)}"; }
se_date() { TZ=$TZ_SE date -d "@${2:-$(now)}" "$1"; }          # se_date +%F [epoch]
se_midnight() { TZ=$TZ_SE date -d "$(se_date +%F "${1:-$(now)}") 00:00" +%s; }
iso_utc() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%S+00:00; }

# Scheduled runs fire at two UTC hours (CET and CEST); only the one that lands on the
# Stockholm target hour proceeds. Manual runs always proceed.
gate_stockholm_hour() {
  local want=$1
  if [ "${GITHUB_EVENT_NAME:-}" = "schedule" ] && [ "$(se_date +%H)" != "$want" ]; then
    log "Not $want:00 in Stockholm (it is $(se_date +%H:%M)); this is the other DST slot, skipping."
    exit 0
  fi
}

# gh for the user-owned Project (needs a classic PAT: read:project to read, project to archive).
gh_project() { if [ -n "${PROJECT_TOKEN:-}" ]; then GH_TOKEN="$PROJECT_TOKEN" gh "$@"; else gh "$@"; fi; }

gh_project_write() {
  if [ "$MODE" != "full" ]; then log "   [$MODE] would run: gh $*"; return 0; fi
  gh_project "$@"
}

# Any write goes through here so dry-run/test-post can never change GitHub.
gh_write() {
  if [ "$MODE" != "full" ]; then log "   [$MODE] would run: gh $*"; return 0; fi
  gh "$@"
}

# ── State ──────────────────────────────────────────────────────────────────────────────────
STATE_SHA=""
state_load() {  # prints the state JSON ({} if none); sets STATE_SHA
  local resp
  if resp=$(gh api "repos/$REPO/contents/$STATE_PATH?ref=$STATE_BRANCH" 2>/dev/null); then
    STATE_SHA=$(jq -r '.sha' <<<"$resp")
    jq -r '.content' <<<"$resp" | base64 -d
  else
    STATE_SHA=""
    echo '{}'
  fi
}

state_ensure_branch() {
  gh api "repos/$REPO/git/ref/heads/$STATE_BRANCH" >/dev/null 2>&1 && return 0
  log "Creating state branch $STATE_BRANCH"
  local tree commit
  tree=$(gh api -X POST "repos/$REPO/git/trees" \
    -f 'tree[][path]=README.md' -f 'tree[][mode]=100644' -f 'tree[][type]=blob' \
    -f "tree[][content]=State for the Teams reporting workflows (.github/scripts/teams). Do not merge." --jq .sha)
  commit=$(gh api -X POST "repos/$REPO/git/commits" -f message="Teams reporting state" -f tree="$tree" --jq .sha)
  gh api -X POST "repos/$REPO/git/refs" -f ref="refs/heads/$STATE_BRANCH" -f sha="$commit" >/dev/null
}

state_save() {  # state_save <file> <message>
  if [ "$MODE" != "full" ]; then log "   [$MODE] state not saved"; return 0; fi
  state_ensure_branch
  local args=(-X PUT "repos/$REPO/contents/$STATE_PATH" -f message="$2" -f branch="$STATE_BRANCH"
              -f content="$(base64 -w0 < "$1")")
  [ -n "$STATE_SHA" ] && args+=(-f sha="$STATE_SHA")
  gh api "${args[@]}" >/dev/null
}

# ── Teams ──────────────────────────────────────────────────────────────────────────────────
# Wrap {body, actions} (stdin) in the Teams Workflows message envelope.
card_envelope() {
  jq --arg test "$([ "$MODE" = "test-post" ] && echo 1)" '{
    type: "message",
    attachments: [ {
      contentType: "application/vnd.microsoft.card.adaptive",
      contentUrl: null,
      content: ({ "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                  type: "AdaptiveCard", version: "1.5", msteams: { width: "Full" } }
                + . + { body: ((if $test == "1" then [ { type: "TextBlock", text: "🧪 TEST: provutskick, kan ignoreras", color: "Attention", weight: "Bolder" } ] else [] end) + .body) })
    } ]
  }'
}

post_card() {  # post_card <card-file> <webhook-url>
  local size; size=$(wc -c < "$1")
  [ "$size" -lt 28000 ] || die "Card is $size bytes; Teams accepts about 28 KB."
  if [ "$MODE" = "dry-run" ]; then cat "$1"; return 0; fi
  [ -n "${2:-}" ] || die "No webhook URL set (secret missing)."
  curl -fsS -H "Content-Type: application/json" --data @"$1" "$2" >/dev/null
  log "Posted to Teams."
}

# Swedish labels for conventional PR titles ("fix(kurskort): x" → "Rättning: x").
JQ_SWE_TITLE='def swe_title:
  (capture("^(?<t>[a-zA-Z]+)(\\([^)]*\\))?!?:\\s*(?<r>.+)$") // null) as $m
  | if $m == null then . else
      ({ feat: "Ny funktion", fix: "Rättning", test: "Tester", docs: "Dokumentation", perf: "Prestanda",
         refactor: "Förbättring", chore: "Underhåll", ci: "Underhåll", build: "Underhåll", style: "Underhåll" }[$m.t | ascii_downcase] // null) as $l
      | if $l == null then . else "\($l): \($m.r[:1] | ascii_upcase)\($m.r[1:])" end
    end;'

# Swedish weekday/month names, independent of the runner's locale.
JQ_SWE_DATE='def swe_date: strptime("%Y-%m-%d") as $t
  | (["söndag","måndag","tisdag","onsdag","torsdag","fredag","lördag"][$t | mktime | strftime("%w") | tonumber]) as $wd
  | (["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"][$t[1]]) as $mo
  | "\($wd) \($t[2]) \($mo) \($t[0])";'
