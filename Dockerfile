# One image for every process (see infra/host/compose.yaml, copied to /app/deploy):
#   web: next start · worker: tsx worker/index.ts · migrate: prisma migrate deploy · ops: scripts/ops
FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g npm@11.19.0
# Placeholders so `prisma generate` and `next build` can run; neither connects. Real values
# are injected at runtime from the secrets manager (SR-10) and never baked into the image.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build APP_URL=http://localhost:3000
# The browser's Sentry DSN is compiled into client code, so it is a build argument (optional).
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The build cache (~180 MB) is only useful for the next build, never at runtime.
RUN npm run build && rm -rf .next/cache && npm prune --omit=dev --ignore-scripts

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# npm and corepack come with the base image but nothing runs them in production; removing
# them drops their bundled dependencies (and known vulnerabilities) from the image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack       /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack     && addgroup -S app && adduser -S app -G app
# Only what the app, worker and operations commands need: no tests, docs or dev dependencies.
COPY --from=build --chown=app:app /app/package.json /app/next.config.ts /app/tsconfig.json /app/prisma.config.ts ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/src ./src
COPY --from=build --chown=app:app /app/worker ./worker
COPY --from=build --chown=app:app /app/scripts/ops ./scripts/ops
# The server's compose file and Caddyfile travel with the code they run (deploy.sh).
COPY --chown=app:app infra/host ./deploy
USER app
EXPOSE 3000
# Node runs directly (not through npm) so it receives SIGTERM and shuts down cleanly.
CMD ["node_modules/.bin/next", "start"]
