# One image for both processes: `npm run start` (web) and `npm run worker` (jobs).
FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g npm@11.19.0
# Placeholders so `prisma generate` and `next build` can run; neither connects. Real values
# are injected at runtime from the secrets manager (SR-10) and never baked into the image.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build APP_URL=http://localhost:3000
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app ./
USER app
EXPOSE 3000
CMD ["npm", "run", "start"]
