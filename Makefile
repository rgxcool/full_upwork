.SHELLFLAGS := -eu -o pipefail -c

CITEST_IMAGE ?= mindful-citest
COMPOSE_MONGO_SERVICE ?= mongo
COMPOSE_PROJECT_NAME ?= mindful-new
DOCKER_COMPOSE ?= docker compose
DC := $(DOCKER_COMPOSE) -p $(COMPOSE_PROJECT_NAME)

# SWAP citest target in Github Actions
ifeq ($(GITHUB_ACTIONS),true)
CITEST_DOCKER_TARGET := cicd
CITEST_BACKEND_MOUNT :=
CITEST_REPORTER:=verbose
else
CITEST_DOCKER_TARGET := test
CITEST_BACKEND_MOUNT := -v $(CURDIR)/backend:/app/backend
CITEST_REPORTER=dot
endif

# --- Targets -------------------------------------------------------

.PHONY: deploy deploy-old estimate format start-backend dev test citest stop

deploy:
	@echo "Pulling latest code..."
	git fetch origin main
	git merge --ff-only origin/main
	@echo "Installing backend dependencies..."
	cd backend && npm ci
	@echo "Starting or reloading backend with PM2..."
	cd backend && pm2 startOrReload ecosystem.config.cjs --env production
	@echo "Installing frontend dependencies..."
	cd frontend && npm ci
	@echo "Building frontend for production..."
	cd frontend && VITE_API_URL="" NODE_OPTIONS="--max-old-space-size=4096" npm run build
	@echo "Deployment complete."

deploy-old:
	@echo "Pulling images..."
	$(DC) pull
	@echo "Rebuilding and starting containers..."
	$(DC) up -d --build
	@echo "Pruning unused Docker artifacts..."
	docker system prune -f

estimate:
	@echo "Analyzing Git commit history (0.5h per commit)..."
	@tmp="$$(mktemp)"; \
	trap 'rm -f "$$tmp"' EXIT; \
	git log --pretty=format:'%ad' --date=short | sort | uniq -c > "$$tmp"; \
	echo ""; \
	echo "Date       | Commits | Est. Hours (0.5h/commit)"; \
	echo "-----------------------------------------------"; \
	awk ' \
		{ \
			commits=$$1; date=$$2; hours=commits*0.5; \
			total_hours+=hours; total_commits+=commits; \
			printf "%s | %7d | %5.1f hrs\n", date, commits, hours; \
		} \
		END { \
			print "-----------------------------------------------"; \
			printf "Estimated total dev time: %.1f hours\n", total_hours; \
			printf "Total commits: %d\n", total_commits; \
		} \
	' "$$tmp"

start-backend:
	cd backend && pm2 start ecosystem.config.cjs --env production

citest:
	@bash -c ' \
		set -euo pipefail; \
		project="$(COMPOSE_PROJECT_NAME)"; \
		service="$(COMPOSE_MONGO_SERVICE)"; \
		dc="$(DOCKER_COMPOSE) -p $$project"; \
		network="$${project}_default"; \
		started_mongo=0; \
		cleanup() { \
			if [ "$$started_mongo" -eq 1 ]; then \
				$$dc stop $$service >/dev/null 2>&1 || true; \
			fi; \
		}; \
		trap cleanup EXIT; \
		container_id="$$( $$dc ps -q $$service 2>/dev/null || true )"; \
		if [ -n "$$container_id" ]; then \
			running="$$( docker inspect -f "{{.State.Running}}" "$$container_id" 2>/dev/null || echo false )"; \
		else \
			running=false; \
		fi; \
		if [ "$$running" != "true" ]; then \
			echo "MongoDB is not running; starting $$service..."; \
			$$dc up -d $$service; \
			started_mongo=1; \
		fi; \
		echo "Building CI image ($(CITEST_DOCKER_TARGET)): $(CITEST_IMAGE)"; \
		docker build --target "$(CITEST_DOCKER_TARGET)" --progress=auto -t "$(CITEST_IMAGE)" .; \
		echo "Running tests (network: $$network)"; \
		docker run --rm --network "$$network" \
			-e MONGO_URI="mongodb://$$service:27017" \
			$(CITEST_BACKEND_MOUNT) \
			"$(CITEST_IMAGE)"; \
	'

dev:
	$(DC) up --build

format:
	npx eslint --no-config-lookup --fix

test:
	NODE_ENV=test NODE_OPTIONS="--require ./backend/tests/setup-crypto.cjs" npx vitest run \
		--coverage --coverage.provider=v8 --reporter=$(CITEST_REPORTER)

stop:
	$(DC) down
