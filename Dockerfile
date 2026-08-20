# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the AgoraX Node API + Vite frontend.
# Base image is Debian slim because `canvas@3` needs cairo/pango/jpeg/giflib
# native libs that are painful on alpine+musl.

# ─── Builder ────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Build deps for native modules (canvas in particular).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Production ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS production

WORKDIR /app

# Runtime libs for canvas. wget is used by the HEALTHCHECK below.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgif7 \
    librsvg2-2 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Application files. `dist/` contains the bundled server + built frontend.
# `migrations/`, `shared/`, `drizzle.config.ts`, and `server/seed-demo.ts`
# are needed at runtime by docker-entrypoint.sh (migrate + seed).
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server ./server
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Non-root user.
RUN groupadd -r appgroup --gid 1001 \
    && useradd -r -g appgroup --uid 1001 --create-home --shell /bin/sh appuser \
    && chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
