# ----------------------------
# deps
# ----------------------------
FROM node:25-alpine AS deps
ENV APP_HOME=/app NODE_ENV=test
WORKDIR $APP_HOME

COPY package*.json ./
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/
RUN --mount=type=cache,id=npm-root-cache,target=/root/.npm \
    --mount=type=cache,id=npm-backend-cache,target=/root/.npm-backend \
    --mount=type=cache,id=npm-frontend-cache,target=/root/.npm-frontend \
    NPM_CONFIG_CACHE=/root/.npm npm ci --prefer-offline --no-audit --no-fund; \
    NPM_CONFIG_CACHE=/root/.npm-backend npm ci --prefix backend --prefer-offline --no-audit --no-fund \
    NPM_CONFIG_CACHE=/root/.npm-frontend npm ci --prefix frontend --prefer-offline --no-audit --no-fund


# ----------------------------
# test-base
# ----------------------------
FROM node:25-alpine AS test-base
RUN apk add --no-cache make
ENV APP_HOME=/app NODE_ENV=test
WORKDIR $APP_HOME

COPY --from=deps $APP_HOME ./
COPY Makefile ./


# ----------------------------
# cicd
# ----------------------------
FROM test-base AS cicd
COPY backend ./backend
COPY frontend ./frontend
CMD ["make", "test"]


# ----------------------------
# test runner
# ----------------------------
FROM test-base AS test
CMD ["make", "test"]


# ----------------------------
# devleopment backend server
# ----------------------------
FROM node:25-alpine AS dev
ENV APP_HOME=/app NODE_ENV=test
WORKDIR $APP_HOME

RUN mkdir -p logs public/uploads
COPY --from=deps $APP_HOME ./

EXPOSE 5001
CMD ["node", "backend/index.js"]
