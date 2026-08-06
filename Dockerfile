# syntax=docker/dockerfile:1

FROM node:24.18.0-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
ENV DATABASE_URL=file:./dev.db
RUN npx prisma generate && npm run db:prepare && npx prisma migrate deploy && npm run build && npm prune --omit=dev

FROM node:24.18.0-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV DATABASE_URL=file:./dev.db
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/data ./data
USER node
EXPOSE 3000
VOLUME ["/app/prisma"]
CMD ["node", "dist/__entry.js"]
