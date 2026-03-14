# Staffora Platform API Dockerfile
# Multi-stage build for optimal image size
#
# This image serves both the API server (default CMD) and the background worker
# (overridden via docker-compose command: bun run src/worker.ts).

# =============================================================================
# Stage 1: Install ALL dependencies (needed for build)
# =============================================================================
FROM oven/bun:1.1.38-alpine AS deps

WORKDIR /app

# Copy only the package files needed for API and its workspace dependency (shared).
# We create a trimmed workspace config so bun install resolves only what the API needs,
# avoiding installation of packages/web and Website dependencies entirely.
COPY bun.lock ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/

# Create a workspace-scoped package.json that only includes api + shared.
# This avoids pulling in web/website dependencies and allows lockfile resolution
# for the subset of packages the API actually depends on.
RUN echo '{"name":"staffora-platform","private":true,"workspaces":["packages/api","packages/shared"]}' > package.json

# Install all dependencies (including devDependencies needed for the build step)
RUN bun install --ignore-scripts

# =============================================================================
# Stage 2: Build the API bundle
# =============================================================================
FROM oven/bun:1.1.38-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage (Bun hoists to root node_modules)
COPY --from=deps /app/node_modules ./node_modules

# Copy source code (only api + shared, no web/website)
COPY tsconfig.base.json ./
COPY packages/api ./packages/api
COPY packages/shared ./packages/shared

# Build the application
WORKDIR /app/packages/api
RUN bun build src/app.ts --outdir dist --target bun

# =============================================================================
# Stage 3: Production dependencies only
# =============================================================================
FROM oven/bun:1.1.38-alpine AS prod-deps

WORKDIR /app

# Copy the same trimmed workspace config
COPY bun.lock ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
RUN echo '{"name":"staffora-platform","private":true,"workspaces":["packages/api","packages/shared"]}' > package.json

# Install production dependencies only — excludes devDependencies
# (@faker-js/faker, @types/*, typescript, etc.)
RUN bun install --production --ignore-scripts

# =============================================================================
# Stage 4: Production runtime
# =============================================================================
FROM oven/bun:1.1.38-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 staffora && \
    adduser --system --uid 1001 --ingroup staffora staffora

# Copy production-only node_modules (no devDependencies, Bun hoists to root)
COPY --from=prod-deps --chown=staffora:staffora /app/node_modules ./node_modules

# Copy built bundle (used by the API server)
COPY --from=builder --chown=staffora:staffora /app/packages/api/dist ./dist

# Copy source files for the worker (which runs from src/worker.ts, not from dist).
# Test files are excluded via .dockerignore so they never enter the build context.
COPY --from=builder --chown=staffora:staffora /app/packages/api/src ./src

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

# Start the API server (worker overrides this via docker-compose command)
CMD ["bun", "./dist/app.js"]
