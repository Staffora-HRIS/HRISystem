# Staffora Platform API Dockerfile
# Multi-stage build for optimal image size
#
# This image serves both the API server (default CMD) and the background worker
# (overridden via docker-compose command: bun run src/worker.ts).

# =============================================================================
# Stage 1: Install ALL dependencies (needed for build)
# =============================================================================
FROM oven/bun:1.3-alpine AS deps

WORKDIR /app

# Copy the root package.json (full workspace definition) and lockfile so Bun's
# frozen-lockfile check passes. All workspace package.json files must be present
# for the lockfile to be consistent, even though only api + shared are installed.
COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/

# Install all dependencies (including devDependencies needed for the build step).
# Only api + shared packages are actually used in subsequent stages.
RUN bun install --ignore-scripts

# =============================================================================
# Stage 2: Build the API bundle
# =============================================================================
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage (Bun hoists most to root, some to package-level)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source code (only api + shared, no web/website)
COPY tsconfig.base.json ./
COPY packages/api ./packages/api
COPY packages/shared ./packages/shared

# Build the application
WORKDIR /app/packages/api
ENV NODE_ENV=production
RUN bun build src/app.ts --outdir dist --target bun --define "process.env.NODE_ENV='production'"

# =============================================================================
# Stage 3: Production dependencies only
# =============================================================================
FROM oven/bun:1.3-alpine AS prod-deps

WORKDIR /app

# Copy the full workspace config so the lockfile is consistent
COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/

# Install production dependencies only — excludes devDependencies
# (@faker-js/faker, @types/*, typescript, etc.)
RUN bun install --production --ignore-scripts

# =============================================================================
# Stage 4: Production runtime
# =============================================================================
FROM oven/bun:1.3-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 staffora && \
    adduser --system --uid 1001 --ingroup staffora staffora

# Copy production-only node_modules (Bun hoists most to root, some to package-level)
COPY --from=prod-deps --chown=staffora:staffora /app/node_modules ./node_modules
COPY --from=prod-deps --chown=staffora:staffora /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=prod-deps --chown=staffora:staffora /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy built bundle (used by the API server)
COPY --from=builder --chown=staffora:staffora /app/packages/api/dist ./packages/api/dist

# Copy source files for the worker (which runs from packages/api/src/worker.ts,
# not from dist). Files must stay inside packages/api/ so Bun resolves
# dependencies from packages/api/node_modules/.
# Test files are excluded via .dockerignore so they never enter the build context.
COPY --from=builder --chown=staffora:staffora /app/packages/api/src ./packages/api/src

# Copy shared package source (needed for workspace imports if any module uses @staffora/shared)
COPY --from=builder --chown=staffora:staffora /app/packages/shared/src ./packages/shared/src

# Copy package manifests (needed for Bun's module resolution)
COPY --from=prod-deps --chown=staffora:staffora /app/package.json ./package.json
COPY --from=prod-deps --chown=staffora:staffora /app/packages/api/package.json ./packages/api/package.json
COPY --from=prod-deps --chown=staffora:staffora /app/packages/shared/package.json ./packages/shared/package.json

# Switch to non-root user
USER staffora

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check using Bun's native fetch (no need for curl/wget)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Build metadata
ARG BUILD_DATE=unknown
ARG VCS_REF=unknown
ARG VERSION=unknown
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/Staffora-HRIS/HRISystem" \
      org.opencontainers.image.vendor="Staffora" \
      org.opencontainers.image.title="staffora-api" \
      org.opencontainers.image.description="Staffora HRIS Platform API"

# Start the API server (worker overrides this via docker-compose command)
CMD ["bun", "./packages/api/dist/app.js"]
