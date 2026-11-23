# AGENTS.md

## Useful commands
- Run tests: `make test` (backend + frontend Vitest); full CI in Docker: `make citest`
- Run linter: `make lint` (backend max 50 warnings, frontend max 780)
- `make format` auto-fixes with `--no-config-lookup` (ignores the project eslint config) — not a lint check

## Environment
- Node.js 25.2.1 and pnpm 11.17.0 (pinned with Volta)
- MongoDB, port 27017, `make dev`

## Testing while developing — MANDATORY
Never run the full test suite while developing. Run only the tests affected by
what you changed:
- `make test-changed` (backend + frontend), or per package
  `cd backend && pnpm test:changed` / `cd frontend && pnpm test:changed` —
  Vitest picks the tests whose imports reach your uncommitted changes.
- Or name files: `cd backend && pnpm test:related src/utils/foo.js`, or run a
  single test file with `--coverage.enabled=false`.
- These skip coverage on purpose: coverage writes to a shared `coverage/`
  folder that parallel runs delete under each other.

The full suite (`make test`, or `pnpm test:coverage` for the gate) runs exactly
**once, right before you commit or open a PR** — never in a loop, never while
another Vitest run is active in the same checkout (check with
`ps aux | grep -c "[v]itest"`). Playwright (e2e) runs once per PR, not per commit.

## Running several agents at once
Each backend Vitest run starts its own in-memory MongoDB, so parallel runs
compete for CPU and slow tests time out.
- Give each agent its own git worktree (`git worktree add ../mindful-new-<x> <branch>`).
  If a second app stack runs, use other ports (`PORT=5011`, `API_PROXY_TARGET`,
  `VITE_API_URL`, `E2E_BASE_URL`) and its own database.
- With several agents busy, add `--maxWorkers=2` to test runs.

## Referring to issues and PRs
Never write a bare number. Always put the title (or a short context) next to it,
in chat, issues, PR text and commit messages:
- ✅ `#103 "[Tech debt] Retire Student.education"`, `PR #106 (Merge Teacher into User)`
- ❌ `#103`, `merge #101 → #106`

## JS Style Guide
- NEVER introduce polyfills for tests
- NEVER mock module-internal code ONLY mock external dependencies

## Repo layout
- `backend/`: Node/Express API (ESM, Mongoose); entrypoint `backend/index.js`
- `backend/src/config/cookies.js`: Centralized auth cookie config (`AUTH_COOKIE_NAME`, `setAuthCookie`, `clearAuthCookie`)
- `backend/src/router/*.js` has web-facing endpoints.
- `frontend/`: Vue 3 + Vite app (Vuetify); alias `@` -> `frontend/src`, `/api` proxied to `http://localhost:5010`
- `data/`: client spec documents (Etapp 1/2, Etapperna_lista.odt) and course/package lists
- `docker-compose.yml`: backend + mongo for local dev & tests
- `Dockerfile`: multi-stage for cicd and local container testing
- `generate-docs.js`: OpenAI-based JSDoc annotator (needs `OPENAI_API_KEY`)
