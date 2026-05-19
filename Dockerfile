# Multi-stage Dockerfile supporting both Bun and Node.js
# Build with: docker build -t zeroauth:latest .
# Build with Node: docker build -t zeroauth:node --build-arg RUNTIME=node .

ARG RUNTIME=bun
ARG BUN_VERSION=1.1.0
ARG NODE_VERSION=20-alpine

# ─── Stage 1: Builder ────────────────────────────────────────────────────────

FROM ${RUNTIME} AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* package-lock.json* ./

# Install dependencies
RUN if [ "${RUNTIME}" = "bun" ]; then \
      bun install --frozen-lockfile; \
    else \
      npm ci; \
    fi

# Copy source code
COPY . .

# Build TypeScript
RUN if [ "${RUNTIME}" = "bun" ]; then \
      bun run build; \
    else \
      npm run build; \
    fi

# ─── Stage 2: Runtime ───────────────────────────────────────────────────────

FROM ${RUNTIME}

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Create non-root user for security
RUN useradd -m -u 1000 zeroauth && chown -R zeroauth:zeroauth /app
USER zeroauth

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD if [ "${RUNTIME}" = "bun" ]; then \
        bun fetch http://localhost:3000/health || exit 1; \
      else \
        node -e "require('http').get('http://localhost:3000/health', r => { process.exit(r.statusCode !== 200 ? 1 : 0); })"; \
      fi

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV LOG_FORMAT=json

# Start application
CMD if [ "${RUNTIME}" = "bun" ]; then \
      bun run --hot src/index.ts; \
    else \
      node dist/index.js; \
    fi
