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
# Use cicd locally too — volume mounts fail on Docker Desktop (macOS/WSL)
# and the image build is fast with layer caching.
CITEST_DOCKER_TARGET := cicd
CITEST_BACKEND_MOUNT :=
CITEST_REPORTER=dot
endif

# --- Targets -------------------------------------------------------

.PHONY: %

deploy:
	./deploy.sh

deploy-dry-run:
	DRY_RUN=1 ./deploy.sh

test-deploy:
	bash tests/deploy/deploy.test.sh

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
	pnpm install

dev:
	$(DC) up --build

format:
	npx eslint --no-config-lookup --fix

lint:
	cd backend && npx eslint src/ --max-warnings 50
	cd frontend && npx eslint src/ --max-warnings 780

# Only the tests affected by your uncommitted changes, without coverage: the
# default while developing (see AGENTS.md "Testing while developing").
test-changed:
	cd backend && NODE_ENV=test npx vitest run --mode test --changed --coverage.enabled=false
	cd frontend && npx vitest run --changed --coverage.enabled=false

test-backend:
	cd backend && NODE_ENV=test npx vitest run --mode test --reporter=$(CITEST_REPORTER)

test-frontend:
	cd frontend && NODE_ENV=test npx vitest run --mode test --reporter=$(CITEST_REPORTER)

test: test-backend test-frontend

# Phase 1 API-svit (kräver igång backend på 5010 + Mongo). Se PHASE1-HARDENING-TEST-PLAN.md §14.
api-test:
	@test -x postman/node_modules/.bin/newman || (cd postman && npm install --silent)
	cd postman && node build-collection.mjs && node setup.mjs && \
	  (npm run --silent run; status=$$?; node teardown.mjs; exit $$status)

api-test-node:
	cd postman && node run-tests.mjs

validate-doc:
	node postman/validate-doc.mjs PHASE1-HARDENING-TEST-PLAN.md

stop:
	$(DC) down

pnpmup:
	rm -rf node_modules backend/node_modules frontend/node_modules pnpm-lock.yaml && pnpm install
