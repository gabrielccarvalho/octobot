# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
# Manifests first for install-layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/bot/package.json ./apps/bot/package.json
COPY apps/landing-page/package.json ./apps/landing-page/package.json
RUN pnpm install --filter bot... --frozen-lockfile
# Bot source, then build
COPY apps/bot ./apps/bot
RUN pnpm --filter bot build
# Emit a self-contained production bundle
RUN pnpm deploy --filter=bot --prod --legacy /out

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
CMD ["node", "dist/index.js"]
