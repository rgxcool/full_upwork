COMPOSE_PROJECT_NAME ?= mindful-new
DOCKER_COMPOSE ?= docker compose
DC := $(DOCKER_COMPOSE) -p $(COMPOSE_PROJECT_NAME)

# SWAP citest target in Github Actions
CITEST_IMAGE ?= mindful-citest
ifeq ($(GITHUB_ACTIONS),true)
CITEST_DOCKER_TARGET := cicd
CITEST_BACKEND_MOUNT :=
CITEST_REPORTER:=verbose
else
CITEST_DOCKER_TARGET := test
CITEST_BACKEND_MOUNT := -v $(CURDIR)/backend:/app/backend -v $(CURDIR)/frontend:/app/frontend
CITEST_REPORTER=dot
endif

# --- Targets -------------------------------------------------------

.PHONY: %

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
	docker build --target "$(CITEST_DOCKER_TARGET)" -t "$(CITEST_IMAGE)" --progress=auto .; \
	docker run --rm -e MONGO_URI="mongodb://mindful_mongo:27017" $(CITEST_BACKEND_MOUNT) "$(CITEST_IMAGE)"

init:
	volta run npm ci && npm ci && cd backend && npm ci && cd ../frontend && npm ci

dev:
	$(DC) up --build

format:
	npx eslint --no-config-lookup --fix

test-backend:
	cd backend && npx vitest run --mode test --reporter=$(CITEST_REPORTER)

test-frontend:
	cd frontend && npx vitest run --mode test --reporter=$(CITEST_REPORTER)

test: test-backend test-frontend

stop:
	$(DC) down

npmup:
	rm -rf node_modules package-lock.json && npm dedupe && npm install --include=dev
