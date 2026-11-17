# Один образ: сервер + собранный клиент. Сборка: docker build -t atlantis .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
# Для работы нужны только зависимости сервера: общий пакет вшит в сборку сервера, клиент уже собран.
RUN npm ci --omit=dev -w @atlantis/server --include-workspace-root || npm install --omit=dev -w @atlantis/server --include-workspace-root
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/server/migrations packages/server/migrations
COPY --from=build /app/packages/client/dist packages/client/dist
WORKDIR /app/packages/server
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
