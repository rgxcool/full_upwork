# ----------------------------
# deps
# ----------------------------
FROM node:25-alpine AS deps
ENV APP_HOME=/app NODE_ENV=test
WORKDIR $APP_HOME

COPY package*.json ./
COPY backend/package*.json backend/

# Install deps with persistent caches
RUN --mount=type=cache,id=npm-root-cache,target=/root/.npm \
    --mount=type=cache,id=npm-backend-cache,target=/root/.npm-backend \
    NPM_CONFIG_CACHE=/root/.npm npm ci --prefer-offline --no-audit --no-fund; \
    NPM_CONFIG_CACHE=/root/.npm-backend npm --prefix backend ci --prefer-offline --no-audit --no-fund

# ----------------------------
# cicd
# ----------------------------
FROM node:25-alpine AS cicd
ENV APP_HOME=/app NODE_ENV=test
WORKDIR $APP_HOME

RUN apk add --no-cache make

COPY --from=deps $APP_HOME .
COPY Makefile vitest.config.js ./

CMD ["make", "test"]
