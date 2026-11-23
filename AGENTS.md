# AGENTS.md

## Useful commands
- Run tests: `make test` (backend + frontend Vitest); full CI in Docker: `make citest`
- Run linter: `make lint` (backend max 50 warnings, frontend max 780)
- `make format` auto-fixes with `--no-config-lookup` (ignores the project eslint config) — not a lint check

## Environment
- Node.js 25.2.1 and pnpm 11.17.0 (pinned with Volta)
- MongoDB, port 27017, `make dev`

## Running several agents at once
Coverage is on for every `vitest run`, and runs in the same checkout delete each
other's `coverage/.tmp` ("Something removed the coverage directory…"). Each
backend run also starts its own in-memory MongoDB, so parallel runs compete for
CPU and slow tests can time out. To keep runs reliable:
- Give each agent its own git worktree (`git worktree add ../mindful-new-<x> <branch>`),
  so each has its own `coverage/`. If a second stack runs, use other ports
  (`PORT=5011`, `API_PROXY_TARGET`, `VITE_API_URL`, `E2E_BASE_URL`) and its own DB.
- Fast loops: only the touched test files, without coverage:
  `cd backend && pnpm vitest run --coverage.enabled=false tests/unit/foo.test.js`
- Run the full suite (with coverage) once before committing, never two at a
  time in one checkout; check first with `ps aux | grep -c "[v]itest"`.
- With several agents busy, cap workers: `--maxWorkers=2`.
- Playwright (e2e) runs per PR, not per commit.

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
