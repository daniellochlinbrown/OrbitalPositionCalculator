# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Install deps first
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Generate Prisma Client inside the image
RUN npx prisma generate

# Copy the rest
COPY . .

# Environment
ENV NODE_ENV=production
ENV PORT=3000
# For SQLite; path is relative to /app
ENV DATABASE_URL="file:./prisma/dev.db"

EXPOSE 3000

# Run migrations if present (falls back to db push), then start the server
CMD sh -c "npx prisma migrate deploy || npx prisma db push; node src/index.js"
