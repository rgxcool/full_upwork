SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

DOCKER_COMPOSE ?= docker compose

.PHONY: deploy deploy-old estimate start-backend compose-up compose-down format dev test citest

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

compose-up:
	$(DOCKER_COMPOSE) up -d

compose-down:
	$(DOCKER_COMPOSE) down

dev:
	@echo "🔧 Starting development stack (build + run)..."
	$(DOCKER_COMPOSE) up --build

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

citest:
	@echo "🧪 Running backend tests inside Docker (target: cicd)..."
	docker build --target cicd --progress=plain .

test:
	npx vitest run --coverage --coverage.provider=v8
