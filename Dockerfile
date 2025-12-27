FROM node:20-alpine AS deps
WORKDIR /usr/src/app

# Install production dependencies
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM ubuntu:22.04 AS cicd
WORKDIR /usr/src/app

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs build-essential python3 && \
    npm install -g npm@10 && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=test
ENV CI=true
ENV MONGOMS_VERSION=7.0.12
ENV MONGOMS_OS=ubuntu2204

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/. .
RUN npm test -- --run


## RUNNER
FROM node:20-alpine AS runner
WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copy installed dependencies from the deps stage
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy backend source code
COPY backend/. .

# Ensure runtime directories exist
RUN mkdir -p logs public/uploads

EXPOSE 5001

CMD ["node", "index.js"]
