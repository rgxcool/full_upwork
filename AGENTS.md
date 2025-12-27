# AGENTS.md

## Environment
- Node.js 18+ for the backend (Dockerfile uses Node 20)
- MongoDB 5+ (docker-compose uses mongo:6.0)
- Backend loads `.env.development` unless `NODE_ENV=production` (see `backend/env.example`)
- Default ports: backend 5001, Vite frontend 5173, Mongo 27017

## Repo layout
- `backend/`: Node/Express API (ESM, Mongoose); entrypoint `backend/index.js`
- `backend/src/router/*.js` has web-facing endpoints.
- `frontend/`: Vue 3 + Vite app (Vuetify); alias `@` -> `frontend/src`, `/api` proxied to `http://localhost:5001`
- `docker-compose.yml`: backend + mongo for local dev
- `Dockerfile`: multi-stage; `cicd` target runs backend tests in Docker
- `generate-docs.js`: OpenAI-based JSDoc annotator (needs `OPENAI_API_KEY`)

## Useful commands
- Run tests: `make test`
- Backend dev server: `cd backend && npm run dev`
- Backend tests: `cd backend && npm test`
- Frontend dev server: `cd frontend && npm run dev`
- Frontend build: `cd frontend && npm run build`
- Compose dev stack: `make dev` (or `docker compose up --build`)
- Compose up/down: `make compose-up` / `make compose-down`
- Deploy (PM2 + frontend build): `make deploy`
- Generate JSDoc site: `npm run docs`
