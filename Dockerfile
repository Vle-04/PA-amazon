# ---- build: install both workspaces, build the frontend ----
FROM node:24-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY backend backend
COPY frontend frontend
RUN npm run build && npm prune --omit=dev

# ---- run: one Node process serves the API and frontend/dist ----
FROM node:24-slim
# Fonts so the seed script can draw text on demo product images.
RUN apt-get update && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend ./backend
COPY --from=build /app/frontend/dist ./frontend/dist
RUN mkdir -p /data && chown -R node:node /data
USER node
WORKDIR /app/backend
EXPOSE 3000
# Every start: migrations (idempotent), demo data if the database is empty, then the server.
CMD ["sh", "-c", "node scripts/setup.js && node src/index.js"]
