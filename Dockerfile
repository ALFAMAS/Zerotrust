# Multi-stage Dockerfile supporting both Bun and Node.js
# Build with: docker build -t zerotrust:latest .
# Build with Node runtime: docker build -t zerotrust:node --build-arg RUNTIME=node .

ARG BUN_VERSION=1.3.14
ARG NODE_VERSION=20-alpine
ARG RUNTIME=bun

# ─── Stage 1: Builder ────────────────────────────────────────────────────────

FROM oven/bun:${BUN_VERSION} AS builder

WORKDIR /app

COPY package.json bun.lockb* package-lock.json* ./

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

# ─── Stage 2: Runtime (Bun) ───────────────────────────────────────────────────

FROM oven/bun:${BUN_VERSION} AS runtime-bun

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

RUN useradd -m -u 1000 zerotrust && chown -R zerotrust:zerotrust /app
USER zerotrust

ENV NODE_ENV=production
ENV LOG_FORMAT=json
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "dist/api/server.js"]

# ─── Stage 3: Runtime (Node) ──────────────────────────────────────────────────

FROM node:${NODE_VERSION} AS runtime-node

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

RUN adduser -D -u 1000 zerotrust && chown -R zerotrust:zerotrust /app
USER zerotrust

ENV NODE_ENV=production
ENV LOG_FORMAT=json
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || '3000') + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/api/server.js"]

# ─── Final stage (select via --build-arg RUNTIME=bun|node) ─────────────────────

FROM runtime-${RUNTIME} AS runtime
