# Сборка из корня репозитория: docker build -f apps/api/Dockerfile .
# whisper.cpp собирается отдельным этапом: в runtime-образе остаются только бинарник
# и ffmpeg, без компилятора. Версию можно сменить: --build-arg WHISPER_CPP_VERSION=...
FROM debian:bookworm-slim AS whisper
ARG WHISPER_CPP_VERSION=v1.7.5
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential cmake git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${WHISPER_CPP_VERSION} https://github.com/ggml-org/whisper.cpp /whisper.cpp
WORKDIR /whisper.cpp
# Статическая сборка: whisper-cli не требует отдельных .so рядом с собой.
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF \
 && cmake --build build -j"$(nproc)" --target whisper-cli

FROM node:24-bookworm-slim

# ffmpeg извлекает звук из mp4; libgomp1 нужен whisper-cli (OpenMP).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libgomp1 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=whisper /whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli

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
# Модель Whisper в образ не входит (около 140 МБ): compose монтирует каталог с ней в /models.
ENV WHISPER_MODEL_PATH=/models/ggml-base.bin
USER node

WORKDIR /app/apps/api
EXPOSE 4000
# Миграции применяются при старте (prisma migrate deploy идемпотентен).
# JWT_SECRET без значения по умолчанию: пустой секрет — отказ запуска, а не известный ключ.
CMD ["sh", "-c", "test -n \"$JWT_SECRET\" || { echo 'JWT_SECRET is required' >&2; exit 1; }; npx prisma migrate deploy && node dist/main.js"]
