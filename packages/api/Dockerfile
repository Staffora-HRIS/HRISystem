# HRIS Platform API Dockerfile
# Multi-stage build for optimal image size

# =============================================================================
# Stage 1: Install dependencies
# =============================================================================
FROM oven/bun:1.1.38-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/

# Install dependencies
RUN bun install --frozen-lockfile --ignore-scripts

# =============================================================================
# Stage 2: Build
# =============================================================================
FROM oven/bun:1.1.38-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY tsconfig.base.json ./
COPY packages/api ./packages/api
COPY packages/shared ./packages/shared

# Build the application
WORKDIR /app/packages/api
RUN bun build src/app.ts --outdir dist --target bun

# =============================================================================
# Stage 3: Production
# =============================================================================
FROM oven/bun:1.1.38-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 hris && \
    adduser --system --uid 1001 --ingroup hris hris

# Copy built application
COPY --from=builder --chown=hris:hris /app/packages/api/dist ./dist
COPY --from=builder --chown=hris:hris /app/packages/api/src ./src
COPY --from=builder --chown=hris:hris /app/node_modules ./node_modules
COPY --from=builder --chown=hris:hris /app/packages/api/package.json ./package.json

# Install curl for health checks
RUN apk add --no-cache curl

# Switch to non-root user
USER hris

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["bun", "./dist/app.js"]
