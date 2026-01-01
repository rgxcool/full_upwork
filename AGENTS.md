# AGENTS.md

## Environment
- Node.js 18+ for the backend (Dockerfile uses Node 20)
- MongoDB 5+ (docker-compose uses mongo:6.0)
- Backend loads `.env.development` unless `NODE_ENV=production` (see `backend/env.example`)
- Backend tests use `backend/.env.test`, `NODE_ENV=test`
- Default ports: backend 5001, Vite frontend 5173, Mongo 27017

## JS Style Guide
- Do not introduce polyfills for tests
- ONLY mock external dependencies NEVER module-internal code

## Repo layout
- `backend/`: Node/Express API (ESM, Mongoose); entrypoint `backend/index.js`
- `backend/src/router/*.js` has web-facing endpoints.
- `frontend/`: Vue 3 + Vite app (Vuetify); alias `@` -> `frontend/src`, `/api` proxied to `http://localhost:5001`
- `docker-compose.yml`: backend + mongo for local dev & tests
- `Dockerfile`: multi-stage; `cicd` target runs backend tests in Docker
- `generate-docs.js`: OpenAI-based JSDoc annotator (needs `OPENAI_API_KEY`)

## Useful commands
- Run tests: `make test`
- Run linter: `make format`
