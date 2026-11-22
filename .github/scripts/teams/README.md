# Teams reporting

Two workflows post Adaptive Cards to a Microsoft Teams channel.

| Workflow | When | Card |
|---|---|---|
| `teams-weekly.yml` | Mondays 07:00 (Stockholm), or **Actions → Teams weekly status → Run workflow** | 📊 Progress per Etapp (from the project board), hours left, ≈ weeks to finish, plus the week's closed issues, merged PRs and commits on `main` |
| `teams-activity.yml` | Every push with new commits (any branch), every issue closed as completed | 🔨 New commits with links · ✅ "Klart: #N title" |

## Setup (once)

1. **Teams webhook.** In the Teams channel: **⋯ → Workflows → "Post to a channel when a webhook request is received"**, then copy the URL. (The old "Incoming Webhook" connector is retired.)
2. **Repo secret `TEAMS_WEBHOOK_URL`:** GitHub → Settings → Secrets and variables → Actions → New repository secret.
3. **Repo secret `PROJECT_READ_TOKEN`:** a *classic* personal access token with the scopes `read:project` and `repo`. The built-in `GITHUB_TOKEN` can't read a user-owned Project. `repo` is needed because the repository is private.
4. **Test:** Actions → **Teams weekly status** → Run workflow with **dry_run** ticked. The card JSON shows up in the log. Run it again without dry_run to post.

Without `TEAMS_WEBHOOK_URL`, both workflows skip quietly, so forks and branches don't fail.

## How the numbers are calculated

The same rules as `reports/status-etapp.md`:

- **Scope:** every issue on the board except labels `quote-separately`, `parking-lot` and `meeting-action`.
- **Group:** label `etapp-1` / `etapp-2`, otherwise "Drift & kvalitet".
- **Weighting:** the board field **Uppskattad tid (tim)** (buffered, base × 2.2).
- **Done:** status *Klar* or *Redo för Demo*. **Left:** *Godkänd*, *Pågående*, *Buggar och Säkerhet*. **Pending:** everything else.
- **Weeks:** hours left ÷ `HOURS_PER_WEEK` (35), rounded up to half a week.

Keep the board's status and hours up to date and the card follows.

## Run locally

```bash
DRY_RUN=1 .github/scripts/teams/weekly-report.sh | jq .
GITHUB_EVENT_NAME=push GITHUB_EVENT_PATH=event.json DRY_RUN=1 .github/scripts/teams/activity.sh
```

Commit messages and issue titles are posted to Teams, so as with everything else (CLAUDE.md §4), never put student data in them.
