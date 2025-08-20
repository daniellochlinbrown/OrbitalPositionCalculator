# Dockerfile
FROM node:20-bookworm-slim

# 1) System deps required by node-canvas (+ toolchain)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2) Install production deps
COPY package*.json ./
# use modern flag; same intent as --only=production
RUN npm ci --omit=dev

# 3) Copy source and set env
COPY . .
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["npm","start"]
