# ========================================================
# Inthara Smart Water ERP v2 - Production Multi-stage Build
# ========================================================

# --------------------------------------------------------
# Stage 1: Build Frontend Single Page Application (web/dist)
# --------------------------------------------------------
FROM node:20-alpine AS web-builder

WORKDIR /app

# Copy package manifests for workspace caching
COPY package*.json ./
COPY web/package*.json ./web/
COPY server/package*.json ./server/

# Install dependencies needed for Vite & TypeScript build
RUN npm ci

# Copy web source and build production bundle
COPY web ./web
RUN npm --workspace web run build

# --------------------------------------------------------
# Stage 2: Production Server Runner (Express + SQLite)
# --------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data
ENV BACKUPS_DIR=/app/backups

# Install build dependencies for better-sqlite3 native compilation on Alpine
RUN apk add --no-cache python3 make g++

# Copy package manifests and install production dependencies only
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci --omit=dev --workspace @inthara/server

# Copy server application source code
COPY server ./server

# Copy built frontend assets from Stage 1
COPY --from=web-builder /app/web/dist ./web/dist

# Create persistent storage directories with full permissions
RUN mkdir -p /app/data /app/backups && chmod -R 777 /app/data /app/backups

EXPOSE 3001

CMD ["node", "server/src/index.js"]
