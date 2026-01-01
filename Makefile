.SHELLFLAGS := -eu -o pipefail -c

ifeq ($(GITHUB_ACTIONS),true)
BACKEND_BIND ?= 0
else
BACKEND_BIND ?= 1
endif
COMPOSE_MONGO_SERVICE := mongo
COMPOSE_PROJECT_NAME ?= mindful-new
DOCKER_COMPOSE ?= docker compose

.PHONY: deploy deploy-old estimate start-backend format dev test citest

deploy:
	@echo "📥 Pulling latest code..."
	git fetch origin main
	git merge --ff-only origin/main
	@echo "📦 Installing backend dependencies..."
	cd backend && npm ci
	@echo "🚀 Starting or reloading backend with PM2..."
	cd backend && pm2 startOrReload ecosystem.config.cjs --env production
	@echo "📦 Installing frontend dependencies..."
	cd frontend && npm ci
	@echo "🏗️ Building frontend for production (with larger Node heap)..."
	cd frontend && VITE_API_URL="" NODE_OPTIONS="--max-old-space-size=4096" npm run build
	@echo "✅ Deployment complete. App should be live."

deploy-old:
	@echo "📦 Pulling images..."
	$(DOCKER_COMPOSE) pull
	@echo "🚀 Rebuilding and starting containers..."
	$(DOCKER_COMPOSE) up -d --build
	@echo "🧹 Pruning unused Docker artifacts..."
	docker system prune -f

estimate:
	@echo "Analyzing Git commit history with weighted commit time..."
	@tmp=$$(mktemp) && \
	git log --pretty=format:'%ad' --date=short | sort | uniq -c > $$tmp && \
	echo "" && \
	echo "Date       | Commits | Est. Hours (0.5h/commit)" && \
	echo "-----------------------------------------------" && \
	total_hours=0 && \
	total_commits=0 && \
	while read -r count date; do \
		hours=$$(echo "$$count" | bc); \
		total_hours=$$(echo "$$total_hours + $$hours" | bc); \
		total_commits=$$((total_commits + count)); \
		printf "%s | %7s | %5s hrs\n" "$$date" "$$count" "$$hours"; \
	done < $$tmp && \
	echo "-----------------------------------------------" && \
	printf "Estimated total dev time: %.1f hours\n" $$total_hours && \
	echo "Total commits: $$total_commits" && \
	rm $$tmp

format:
	npx eslint --no-config-lookup --fix

start-backend:
	cd backend && pm2 start ecosystem.config.cjs --env production

dev:
	$(DOCKER_COMPOSE) -p $(COMPOSE_PROJECT_NAME) up --build

citest:
	@bash -c ' \
		set -euo pipefail; \
		project="$(COMPOSE_PROJECT_NAME)"; \
		service="$(COMPOSE_MONGO_SERVICE)"; \
		dc="$(DOCKER_COMPOSE) -p $$project"; \
		container_id=$$($$dc ps -q $$service 2>/dev/null || true); \
		start_dev=0; \
		if [ -z "$$container_id" ]; then \
			start_dev=1; \
		else \
			running=$$(docker inspect -f "{{.State.Running}}" "$$container_id"); \
			if [ "$$running" != "true" ]; then \
				start_dev=1; \
			fi; \
		fi; \
		if [ "$$start_dev" -eq 1 ]; then \
			echo "MongoDB is not running; launching dev environment..."; \
			$(MAKE) dev >/tmp/make-dev.log 2>&1 & \
			echo $$! >/tmp/dev_pid; \
			sleep 5; \
		fi; \
	'
	docker build --target cicd --progress=plain -t mindful-citest \
		--build-arg COPY_BACKEND=$(COPY_BACKEND_ARG) . && \
	docker run --rm --network $(COMPOSE_PROJECT_NAME)_default \
		-e MONGO_URI=mongodb://$(COMPOSE_MONGO_SERVICE):27017 \
	        -v $(CURDIR)/backend:/app/backend \
		mindful-citest
	@bash -c ' \
		set -euo pipefail; \
		if [ -f /tmp/dev_pid ]; then \
			$(DOCKER_COMPOSE) -p $(COMPOSE_PROJECT_NAME) down; \
			kill $$(cat /tmp/dev_pid) >/dev/null 2>&1 || true; \
			rm /tmp/dev_pid; \
		fi; \
	'

test:
	NODE_ENV=test NODE_OPTIONS="--require ./backend/tests/setup-crypto.cjs" npx vitest run \
	--coverage --coverage.provider=v8 --reporter=dot
