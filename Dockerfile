# syntax=docker/dockerfile:1

########################
# Build stage
########################
FROM node:20-bookworm-slim AS build
WORKDIR /app

# OS deps for node-gyp and node-canvas (glibc), plus OpenSSL detection during build
RUN apt-get update && apt-get install -y \
    build-essential python3 pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Install deps and generate Prisma client
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

# Bring in the rest of the app
COPY . .

# Keep only production deps in the final bundle we copy to runtime
RUN npm prune --omit=dev


########################
# Runtime stage
########################
FROM node:20-bookworm-slim
WORKDIR /app

# Runtime libs for node-canvas + OpenSSL for Prisma engine detection
RUN apt-get update && apt-get install -y \
    libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy pruned app from build stage
COPY --from=build /app /app

# Keep Prisma CLI available at runtime for migrate/db push (matches Prisma v6 major)
RUN npm i -g prisma@6

# Data dir for SQLite (mount a volume to /data via docker-compose)
RUN mkdir -p /data && chown -R node:node /data

# App env
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_URL="file:/data/dev.db"

EXPOSE 3000

# Drop privileges
USER node

# Run DB migrations (or create schema) then start the server
CMD sh -c "prisma migrate deploy || prisma db push; node src/index.js"
