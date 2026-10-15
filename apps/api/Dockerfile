# Сборка из корня репозитория: docker build -f apps/api/Dockerfile .
FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# Зависимости ставятся по корневому lock-файлу, только для api. Скрипты отключены
# (husky не нужен), Prisma Client генерируется явно ниже.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/api --include=dev --ignore-scripts

COPY apps/api apps/api
RUN npm run db:generate -w apps/api && npm run build -w apps/api

# Каталог файлов встреч: именованный volume монтируется сюда и наследует владельца.
# Это не статика: приложение не отдаёт каталог по HTTP, только через эндпоинт скачивания.
ENV FILES_DIR=/data/files
RUN mkdir -p /data/files && chown -R node:node /data/files
USER node

WORKDIR /app/apps/api
EXPOSE 4000
# Миграции применяются при старте (prisma migrate deploy идемпотентен).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
