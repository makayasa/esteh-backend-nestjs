# Esteh backend — image runtime.
# Prisma 7 gebruikt TS query-compiler + driver adapter; geen Rust-engine
# binaries nodig op runtime. Wel de prisma CLI (voor migrate deploy).

# ---- build: compileert TypeScript en genereert de Prisma client ----
FROM node:26-slim@sha256:3a771f83944bb763050c23c0225c260638c4b7899e7a72485ef75e5e570499e5 AS build
WORKDIR /app
# Lifecycle scripts diizinkan melalui allowScripts dalam package.json.
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate
COPY . .
RUN npm run build

# ---- runtime: alleen productiedeps + compiled dist + migrations ----
FROM node:26-slim@sha256:3a771f83944bb763050c23c0225c260638c4b7899e7a72485ef75e5e570499e5 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./

USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]