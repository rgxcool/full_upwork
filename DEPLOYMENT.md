# Deployment Notes

## Environment Variables (Production)

Generate a strong JWT_SECRET:

```sh
openssl rand -base64 48
```

Required variables for `backend/.env.production`:

| Variable | Description | How to set |
|----------|-------------|------------|
| `MONGODB_URI` | MongoDB connection string | Your production MongoDB URI |
| `JWT_SECRET` | JWT signing secret (≥ 32 chars) | `openssl rand -base64 48` |
| `CLIENT_URL` | Frontend origin for CORS | `https://your-domain.com` |
| `NODE_ENV` | Must be `production` | Set in your process manager |

Optional:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5010` | Backend listen port |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Requests per 15-min window |
| `MAX_FILE_SIZE` | `10mb` | Upload size limit |

## Startup Behavior

The server validates at boot:

1. **Required variables**: `MONGODB_URI` and `JWT_SECRET` must be set
2. **JWT_SECRET strength**: Must be ≥ 32 characters, cannot be a known weak value
3. If validation fails, the process exits immediately with a descriptive log

## Health Endpoints

| Endpoint | Use case |
|----------|----------|
| `GET /health/live` | Liveness probe (always 200 if process is up) |
| `GET /health/ready` | Readiness probe (200 when DB connected, 503 otherwise) |
| `GET /health` | Full diagnostic payload |
| `GET /metrics` | Error stats, DB state, memory usage |

> **Access control assumption**: `/health*` and `/metrics` are intentionally left
> unauthenticated. They expose internal diagnostics (memory, DB state, error
> stats) and MUST only be reachable from trusted networks. Restrict them to the
> internal network / VPN / firewalled subnet in production (e.g. via a reverse
> proxy allowlist or firewall rules). Do not expose these endpoints directly to
> the public internet.

## Docker Deployment

```sh
# Production with docker-compose
make dev          # builds + starts backend + mongo

# CI test suite
make citest       # builds cicd target, runs all tests
```

### Docker Targets

| Target | Purpose | Base |
|--------|---------|------|
| `dev` | Local development server | `node:25-alpine` |
| `cicd` | CI/CD test suite | `node:25-bookworm` |
| `test` | Generic test runner | `node:25-bookworm` |
| `build` | Frontend production build | `node:25-bookworm` (from deps) |
| `production` | Minimal runtime image | `node:25-alpine` |

All targets use pnpm 11.17.0. The `dev` and `production` targets run as non-root (`appuser`) and include a Docker HEALTHCHECK on `/health/live`.

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT`:

1. Stops accepting new connections
2. Waits for in-flight requests (10s timeout)
3. Closes MongoDB connection
4. Exits

## Monitoring

- **Logs**: Pino JSON logger (stdout). Use `pino-pretty` for dev formatting.
- **Metrics**: `GET /metrics` exposes error counts, DB state, memory, uptime
- **Error tracking**: `errorMonitor` records errors in memory; exposed via metrics

## Frontend Build

The project uses a pnpm workspace. For production builds:

```sh
VITE_API_URL="" NODE_OPTIONS="--max-old-space-size=4096" pnpm --filter frontend run build
```

In production `deploy.sh` builds into `frontend/dist.new` and swaps it in (see below), so a failed build never replaces the live site.

The frontend expects `/api` to be proxied to the backend. Configure this in your reverse proxy (nginx, Caddy, etc.). The default API port is `5010` (see `backend/index.js`), but must align with your Nginx upstream configuration.

## Troubleshooting

### Login fails with "Kunde inte ansluta till servern" and devtools shows a CORS error with status (null)

This usually means the frontend and backend are pointed at different ports,
not a real CORS problem. Check that `VITE_API_URL` matches the backend's
actual `PORT`. The backend logs the port it actually listens on at startup
(`API listening on http://localhost:PORT`), and the frontend logs the API URL
it is about to call on dev startup (`[API] Connecting to: ...`). When the two
disagree, update the wrong side (canonical local dev port: `5010`). In dev the
Vite proxy forwards `/api` to `http://localhost:5010`, so an empty
`VITE_API_URL` in `frontend/.env.development` is correct as long as the backend
runs on `5010`.

### Initial System Admin is forced to change the default password

`backend/scripts/createSystemAdmin.js` creates the initial `systemadmin`
account with the known default password (`mindful`) and sets
`mustChangePassword: true` on the account. The first login succeeds but the
frontend redirects to `/change-password` and blocks the rest of the app until
the password is changed. To avoid the forced change entirely, supply your own
password when running the script:

```sh
SYSTEM_ADMIN_PASSWORD="<strong-password>" node backend/scripts/createSystemAdmin.js
```

## Production Environment Variables (names only - never share values)

Required for production (backend/.env.production, loaded at boot when NODE_ENV=production):

| Variable | Required | Notes |
|----------|----------|-------|
| `MONGODB_URI` | Yes | MongoDB connection string (mongodb://...) |
| `JWT_SECRET` | Yes | Must be >= 32 characters, strong random value. Rotation invalidates existing sessions. |

Optional:

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `5010` | Backend listen port. Must match Nginx upstream. |
| `NODE_ENV` | - | Must be `production` |
| `CLIENT_URL` | `https://mindfullearning.se` | CORS origin |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Requests per 15-min window |
| `MAX_FILE_SIZE` | `10mb` | Upload size limit |

**Security notes:**
- Keep production `.env.production` outside the Git repository with restrictive permissions (600). Git is configured to ignore `.env*` files.
- PM2 reads environment variables at runtime. Do not embed secrets in `ecosystem.config.cjs` or tracked files.
- `/health*` and `/metrics` endpoints are unauthenticated by design - restrict access via Nginx allowlist/firewall (do not expose publicly).

## Deploying with `deploy.sh` (OPS-02)

Production runs on the host: SSH in, `cd` to the repo, and run `./deploy.sh` (or `make deploy`).
nginx serves `frontend/dist` directly; pm2 runs the backend in cluster mode.

Always look first:

```sh
DRY_RUN=1 ./deploy.sh      # or: make deploy-dry-run — prints every step, changes nothing
./deploy.sh
```

What it does, in order:

1. Takes `logs/deploy.lock` (a second concurrent deploy is refused), runs the preflight checks
   (clean working tree, node/pnpm/pm2/curl/flock, disk space, env file present).
2. Records the live commit (`PREV_SHA`) and resolves the target `main` commit. Same commit → nothing to do.
3. **CI gate:** the newest `CI` workflow run for the target commit must be `completed / success`.
   Red, pending, missing or unreadable CI → refused. `FORCE=1 ./deploy.sh` overrides it with a loud
   banner, and the log line says `forced-success`.
4. `git merge --ff-only <target>`, `pnpm install --frozen-lockfile`.
5. **Atomic frontend:** `vite build --outDir dist.new`. Only if the build produced `index.html` does it
   swap: `dist` → `dist.prev`, `dist.new` → `dist`. nginx serves the old `dist` the whole time
   (the two renames are milliseconds apart).
6. `pm2 startOrReload ecosystem.config.cjs --env production --update-env`, then
   `pm2 scale ML-Backend $PM2_INSTANCES`.
7. `/health/live` and `/health/ready` (5 attempts each).

### Settings

| Variable | Default | Meaning |
|---|---|---|
| `DRY_RUN` | `0` | `1` = print every changing command instead of running it; no log line is written |
| `FORCE` | `0` | `1` = deploy even if CI is not green (logged) |
| `PM2_INSTANCES` | `2` | Cluster worker count. Also read by `backend/ecosystem.config.cjs`; set it in the shell profile on the host if you want a different value. Nightly jobs run on worker 0 only, whatever the count. |
| `DEPLOY_GH_TOKEN_FILE` | `~/.config/mindful-deploy/gh_token` | Read-only GitHub token for the CI gate (see below) |
| `DEPLOY_REPO` | `Cyrus-Malekani/mindful-new` | Repo whose CI runs are checked |
| `PORT` | `5010` | Backend port for the health checks |

**CI gate credentials.** The repository is private, so the host needs read access to Actions:

- Preferred: a fine-grained personal access token limited to this repository with **Actions: Read-only**
  (nothing else). Store it in `~/.config/mindful-deploy/gh_token` with `chmod 600`. It is passed to
  curl on stdin, so it never appears in the process list or logs.
- Fallback: if no token file exists and `gh auth status` succeeds on the host, `gh api` is used.
- Neither → the CI status is `unknown` and the deploy is refused (use `FORCE=1` only if you have
  checked CI yourself).

### Deploy log

Every run appends one line to `logs/deploy.log` (not tracked by git):

```
2026-11-22T10:15:03Z <target-sha> <user> <result>
```

Results: `success`, `forced-success`, `noop`, `refused-ci-<status>`, `build-failed`, `rolled-back`,
`rollback-failed`, `rollback-failed-unexpected-error`.

### Exit codes

| Code | Meaning | Production state |
|---|---|---|
| 0 | Deployed, nothing to do, or dry run | New (or unchanged) version live |
| 1 | Refused (CI, lock, dirty tree, preflight) or install/build failed | Old version still live; code and deps reset to `PREV_SHA` |
| 2 | Health checks failed → **automatic rollback succeeded** | Old version live and healthy |
| 3 | Rollback itself failed or stayed unhealthy | **Needs a human now** — see the manual procedure |

## Rollback Procedure

### Automatic

If `/health/live` or `/health/ready` fails after the reload, `deploy.sh` rolls back on its own:
`git reset --hard $PREV_SHA`, `pnpm install --frozen-lockfile`, the bad frontend goes to
`frontend/dist.failed` and `frontend/dist.prev` becomes `frontend/dist` again, pm2 reloads, and the
health checks run once more. If install or build fails before going live, only the code and
dependencies are reset (the live `dist` and pm2 were never touched).

### Manual (exit code 3, or rolling back a deploy that passed health checks but is broken)

1. Do not modify production `.env.production` or backup files.
2. Find the previous good commit: `tail logs/deploy.log` or `git reflog -5`.
3. `git reset --hard <previous-sha> && pnpm install --frozen-lockfile`
4. Frontend: if `frontend/dist.prev` is from that commit, `mv frontend/dist frontend/dist.failed && mv frontend/dist.prev frontend/dist`;
   otherwise rebuild: `pnpm --filter frontend exec vite build --outDir dist.new --emptyOutDir` and swap it in.
5. `cd backend && pm2 startOrReload ecosystem.config.cjs --env production --update-env`
6. Verify the health checks below and `pm2 logs ML-Backend` (do not share log contents containing secrets).

### Testing `deploy.sh`

`make test-deploy` (also run in CI) runs `tests/deploy/deploy.test.sh`: real git against a temporary
bare repo, with `pnpm`, `pm2`, `curl`, `gh` and `sleep` stubbed. It covers the CI gate, `FORCE`,
`DRY_RUN`, the lock, build/install failure and both rollback outcomes.

### Pre-deployment backups (must be preserved)
- `deploy.sh.20261016.bak` (preserve as-is)
- `/home/mindful.se/mindful-predeploy-20261016/` (preserve as-is)

### Health check commands
```bash
curl -f http://localhost:<PORT>/health/live  # liveness
curl -f http://localhost:<PORT>/health/ready # readiness (DB connectivity)
```

**Note:** `/health*` and `/metrics` must be restricted via Nginx allowlist/firewall - do not expose publicly.

## Unresolved Production Decisions (BLOCKERS - do not deploy until resolved)

1. **Nginx upstream / Backend port alignment**
- Backend listens on PORT (default 5010). Production Nginx currently proxies `/api/` to `localhost:5001` (from Phase 2).
- Must verify and align: either change backend to 5001 or update Nginx to proxy to 5010.
- Do not modify Nginx config as part of this repo deployment.

2. **Node.js compatibility strategy**
- Repo targets Node 25.2.1 (Volta/CI/Docker). Production has Node 22.17.0.
- Need approval: upgrade production Node to 25.x, or verify compatibility on 22.x first.

3. **JWT secret rotation**
- Production `.env` must have strong JWT_SECRET (>= 32 chars, not weak). Rotation invalidates existing sessions.
- Requires administrator approval and user notification plan.

4. **Health & metrics endpoint restrictions**
- `/health*` and `/metrics` are unauthenticated. Must be restricted via Nginx allowlist/firewall (trusted networks only).
- Do not expose publicly.

5. **Production environment-file preservation**
- `.env.production` must remain outside Git repo with restrictive permissions (600).
- Preserve existing backups: `deploy.sh.20261016.bak` and `/home/mindful.se/mindful-predeploy-20261016/`.
