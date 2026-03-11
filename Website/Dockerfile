# =============================================================================
# Staffora Marketing Website - Multi-stage Dockerfile
# =============================================================================
# Uses Bun for fast installs and builds, serves with react-router-serve
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies
# ---------------------------------------------------------------------------
FROM oven/bun:1 AS deps

WORKDIR /app

# Copy only the website package.json (standalone install, no workspace root)
COPY Website/package.json ./

# Install all dependencies (including devDependencies for build)
RUN bun install

# ---------------------------------------------------------------------------
# Stage 2: Build the application
# ---------------------------------------------------------------------------
FROM oven/bun:1 AS builder

# Use /build as workspace root so tsconfig.base.json resolves correctly
WORKDIR /build

# Copy tsconfig.base.json at workspace root level
COPY tsconfig.base.json ./tsconfig.base.json

# Copy website source into Website/ subdirectory
COPY Website/ ./Website/

# Copy installed node_modules into the Website directory
COPY --from=deps /app/node_modules ./Website/node_modules

# Build the app
WORKDIR /build/Website
RUN bun run build

# ---------------------------------------------------------------------------
# Stage 3: Production runtime
# ---------------------------------------------------------------------------
FROM oven/bun:1-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5174

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copy package.json and install production deps only
COPY Website/package.json ./
RUN bun install --production

# Copy built output
COPY --from=builder /build/Website/build ./build

EXPOSE 5174

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
  CMD curl -f http://localhost:5174/ || exit 1

CMD ["bun", "run", "start"]
