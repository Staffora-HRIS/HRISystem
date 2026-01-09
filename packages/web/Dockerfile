# Build stage
FROM oven/bun:1.1.38 AS builder

WORKDIR /app

ENV NODE_ENV=development

RUN mkdir -p packages/api packages/web packages/shared

# Copy package files
COPY package.json bun.lock ./
COPY packages/api/package.json ./packages/api/package.json
COPY packages/web/package.json ./packages/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source files
COPY packages/shared ./packages/shared
COPY packages/web ./packages/web
COPY tsconfig.base.json ./

# Build the application
RUN bun run --filter @hris/web build

# Production stage
FROM oven/bun:1.1.38-slim AS production

WORKDIR /app

# Copy built assets and dependencies
COPY --from=builder /app/packages/web/build ./build
COPY --from=builder /app/packages/web/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5173

# Expose port
EXPOSE 5173

# Start the application
CMD ["bun", "run", "start"]
