# video-meetings

Монорепозиторий (npm workspaces): `apps/web` — Next.js 16, `apps/api` — Nest.js 12 + Prisma + PostgreSQL. Возможности: регистрация и вход, встречи, файлы встреч (загрузка до 500 МБ с прогрессом и отменой, список, скачивание).

## Быстрый старт

Нужны Node.js >= 24, npm 11 и Docker.

```bash
npm install
cp .env.example .env                      # значения по умолчанию подходят для разработки
cp .env.example apps/api/.env             # DATABASE_URL, JWT_SECRET, FILES_DIR и др.
docker compose up -d postgres
npm run db:deploy -w apps/api             # миграции
npm run dev                               # web :3000, api :4000
```

## Переменные окружения

Пример всех переменных — `.env.example`.

| Переменная                   | Где     | Назначение                                                                          |
| ---------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `POSTGRES_*`                 | compose | параметры PostgreSQL                                                                |
| `DATABASE_URL`, `JWT_SECRET` | api     | подключение к БД и секрет JWT (обязательны)                                         |
| `FILES_DIR`                  | api     | каталог файлов встреч (обязательна; локально `./storage`, в Docker — `/data/files`) |
| `MAX_UPLOAD_BYTES`           | api     | лимит размера файла, по умолчанию 524288000 (500 МиБ), не больше 2³¹−1              |
| `WEB_ORIGIN`                 | api     | origin `web` для CORS, по умолчанию `http://localhost:3000`                         |
| `PORT`, `API_PORT`           | api     | порт api (4000) и порт на хосте в compose                                           |
| `API_URL`                    | web     | адрес api, по умолчанию `http://localhost:4000`                                     |

## Файлы встреч и Docker

`docker compose up -d --build api` запускает api в контейнере (миграции применяются при старте, `JWT_SECRET` обязателен). Файлы лежат в именованном volume `api_files` (`/data/files`) и переживают пересоздание контейнера; удалить их можно только вместе с volume (`docker compose down -v`). Не запускайте контейнер одновременно с `npm run dev:api`: порт 4000 общий.

## Проверки

```bash
npm run lint && npm run typecheck && npm run test && npm run format:check
npm run test:e2e -w apps/api              # нужна БД: docker compose up -d postgres и db:deploy
```

Подробности для разработки — в `CLAUDE.md` (корень и `apps/*`).
