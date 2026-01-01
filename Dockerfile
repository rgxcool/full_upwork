# ----------------------------
# cicd
# ----------------------------
FROM node:25-alpine AS cicd
ENV APP_HOME=/app NODE_ENV=test
WORKDIR $APP_HOME

RUN apk add --no-cache make

COPY package*.json ./
COPY backend/package*.json backend/
COPY Makefile vitest.config.js ./

RUN --mount=type=cache,id=root-npm,target=$APP_HOME/.npm \
    --mount=type=cache,id=backend-npm,target=$APP_HOME/backend/.npm \
    npm ci && npm --prefix backend ci

CMD ["make", "test"]
