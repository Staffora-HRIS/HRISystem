# Staffora Platform Web Dockerfile
# Multi-stage build for React Router v7 SSR application
#
# This app uses server-side rendering (react-router-serve) and requires
# a Bun runtime. It cannot be served by a static file server like nginx.

# =============================================================================
# Stage 1: Install dependencies
# =============================================================================
FROM oven/bun:1.3.10-alpine AS deps

WORKDIR /app

# Copy workspace root package files for monorepo resolution
COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/
COPY Website/package.json ./Website/

# Install all dependencies (dev deps needed for build step)
RUN bun install --frozen-lockfile --ignore-scripts

# =============================================================================
# Stage 2: Build the application
# =============================================================================
FROM oven/bun:1.3.10-alpine AS builder

WORKDIR /app

# Accept build arguments that Vite inlines into the client bundle
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy root package.json (needed for bun --filter workspace resolution)
COPY package.json ./

# Copy source code needed for building
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/web ./packages/web

# Build the React Router v7 SSR application
# This produces build/server/index.js and build/client/ assets
RUN bun run --filter @staffora/web build

# =============================================================================
# Stage 3: Production runtime
# =============================================================================
FROM oven/bun:1.3.10-alpine AS runner

WORKDIR /app

# Create non-root user for security (matching API Dockerfile convention)
RUN addgroup --system --gid 1001 staffora && \
    adduser --system --uid 1001 --ingroup staffora staffora

# Install production-only dependencies
# Copy workspace package files for monorepo resolution
COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/
COPY Website/package.json ./Website/

RUN bun install --frozen-lockfile --ignore-scripts --production && \
    rm -rf /tmp/* ~/.bun/install/cache

# Copy the shared package (needed at runtime for imports)
COPY --from=builder --chown=staffora:staffora /app/packages/shared ./packages/shared

# Copy built application output (server bundle + client assets)
COPY --from=builder --chown=staffora:staffora /app/packages/web/build ./packages/web/build

# Copy the web package.json (needed for react-router-serve start script)
COPY --from=builder --chown=staffora:staffora /app/packages/web/package.json ./packages/web/package.json

# Switch to non-root user
USER staffora

WORKDIR /app/packages/web

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5173

# Expose port
EXPOSE 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:5173/ || exit 1

# Start the SSR server via react-router-serve
CMD ["bun", "run", "start"]
