# Teams reporting

| Workflow | Channel | When | Content |
|---|---|---|---|
| `teams-weekly.yml` | **Client** (`TEAMS_WEBHOOK_URL`) | Mondays 08:00 Stockholm | 📊 Status of Etapp 1 & 2 in four states, changes since the last report, and last week's work (Monday's digest, including the weekend). Afterwards the Klar column is archived. |
| `teams-daily.yml` | **Client** (`TEAMS_WEBHOOK_URL`) | Tuesday–Saturday 09:00 Stockholm | 🗓️ The previous day's work: closed issues, PRs merged into `main`, commits on all branches. Not posted on days without activity. |
| `teams-activity.yml` | **Internal** (`TEAMS_DEV_WEBHOOK_URL`) | Every push / closed issue | 🔨 New commits per push · ✅ "Klart: #N". Off when the secret is missing. |

## Setup (once, in GitHub; never paste secrets into chats or files)

1. **Webhook per Teams channel.** In the channel: **⋯ → Workflows → "Post to a channel when a webhook request is received"**, then copy the URL. Do this for the client channel (*utveckling* in Mindfullearning) and, if you want live cards, for an internal channel.
2. **Repo → Settings → Secrets and variables → Actions → New repository secret:**
   - `TEAMS_WEBHOOK_URL`: the client channel.
   - `TEAMS_DEV_WEBHOOK_URL` (optional): the internal channel.
   - `PROJECT_TOKEN`: a **classic** personal access token (Settings → Developer settings → Tokens (classic)) with the scopes **`project`** (read the board and archive the Klar column) and **`repo`** (the repository is private, so the board's issue data needs it). The workflow's built-in `GITHUB_TOKEN` cannot read a user-owned Project. Fine-grained tokens did not support user-owned Projects when this was written; check again before switching. Set an expiry date and a calendar reminder to renew it.
3. **Test:** Actions → **Teams weekly report** → Run workflow:
   - **dry-run**: the card and the planned changes are only printed in the log
   - **test-post**: posts a card marked 🧪 TEST; saves no state, archives nothing
   - **full**: the real thing, exactly as on Monday mornings

   Do the same for **Teams daily digest**.

## Rules

- **Scope and the four states.** Only issues with the label `etapp-1` / `etapp-2` count towards the percentages. Issues labelled `quote-separately`, `parking-lot` or `meeting-action` are left out entirely. Everything else is shown as "Drift & kvalitet", outside the percentages.

  | Board status | Shown as |
  |---|---|
  | **Klar** | Godkänt av kund. Only move an item here when the client has accepted it. |
  | Redo för Demo | Klart, inväntar demo/godkännande |
  | Godkänd, Pågående, Buggar och Säkerhet | Återstående beställt arbete |
  | Specificerad & Offertad, Parkeringsplats | Inväntar beslut/godkännande |
- **Archiving.** After a successful full weekly post, every item in **Klar** is archived from the board. It is first saved in the log on the branch `reports-state`, so it keeps counting as accepted. Archiving can be undone in the project.
- **Hours** come from the field "Uppskattad tid (tim)", as planned buffered estimates (base × 2.2), not time spent. Weeks = hours left ÷ 35, as an estimate, not a delivery promise.
- **Stops loudly.** If an in-scope issue has no status, has an unknown status or is missing hours, the run stops with a list and nothing is posted.
- **Never twice.** One weekly report per ISO week and one digest per day, even if the workflow is re-run.
- **Summer and winter time.** GitHub schedules in UTC, so each workflow runs at two UTC hours and only the one that lands on the Stockholm hour posts. GitHub can start scheduled runs late (often minutes, sometimes more).
- **First weekly report** is marked as the baseline. "Changes since last report" starts the week after.
- **PR titles** like `fix(kurskort): …` are shown in Swedish ("Rättning: …"). Write PR titles so the client understands them, and never put student data in commit messages, issue titles or PR titles: they go to Teams.

## State

The branch `reports-state` (never merge it) holds `teams-state.json`:
- the last week and day posted
- the board as it was at the last weekly report
- the log of accepted items

Delete the file to start over from a new baseline.

## Tests and local runs

```bash
bash tests/teams/teams.test.sh                                # stubbed gh/curl, also run in CI
MODE=dry-run .github/scripts/teams/weekly-report.sh | jq .    # real board, posts nothing
MODE=dry-run .github/scripts/teams/daily-digest.sh | jq .
```
