# AGENTS.md

## Useful commands
- Run tests: `make test` (backend + frontend Vitest); full CI in Docker: `make citest`
- Run linter: `make lint` (backend max 50 warnings, frontend max 780)
- `make format` auto-fixes with `--no-config-lookup` (ignores the project eslint config) — not a lint check

## Environment
- Node.js 25.2.1 and pnpm 11.17.0 (pinned with Volta)
- MongoDB, port 27017, `make dev`

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
