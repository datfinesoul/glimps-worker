FROM node:22-bookworm AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/

RUN pnpm run build

FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -u 1001 -m -s /bin/bash glimps

WORKDIR /app

COPY --from=builder --chown=glimps:glimps /app/dist ./dist
COPY --from=builder --chown=glimps:glimps /app/node_modules ./node_modules
COPY --from=builder --chown=glimps:glimps /app/package.json ./package.json

USER glimps

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD redis-cli -h redis ping || exit 1

CMD ["node", "dist/worker.js"]