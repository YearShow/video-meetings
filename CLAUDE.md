# video-meetings

Монорепозиторий на npm workspaces (`apps/*`). В `api` реализована авторизация (регистрация и логин по email и паролю, JWT, Prisma + PostgreSQL) и встречи (CQRS).

## Структура

- `apps/web` — Next.js 16 (App Router, TypeScript, Tailwind 4). См. `apps/web/CLAUDE.md`.
- `apps/api` — Nest.js 12 (TypeScript strict, Vitest, oxlint). См. `apps/api/CLAUDE.md`.
- `docker-compose.yml` — локальная инфраструктура: PostgreSQL 17 (`docker compose up -d postgres`) и контейнер `api`. Параметры задаются через переменные `POSTGRES_*` (пример в `.env.example`, значения по умолчанию подходят для разработки). Там же сервис `api` (`docker compose up -d --build api`, образ из `apps/api/Dockerfile`, сборка из корня; при старте применяет миграции) с именованным volume `api_files` для файлов встреч (`/data/files`): файлы переживают пересоздание контейнера, каталог не отдаётся как статика. Порт на хосте — `API_PORT` (по умолчанию 4000; не запускайте одновременно с `npm run dev:api`). Для `apps/api` там же `DATABASE_URL`, `JWT_SECRET` и `PORT` (4000; `web` работает на 3000) (копируются в `apps/api/.env`).
- `.agents/skills` — установленные скиллы для агентов (источники и хэши в `skills-lock.json`). В Claude Code они подключены симлинками из `.claude/skills/`. Не редактируйте вручную: обновляйте через установщик скиллов. Исключены из Prettier (`.prettierignore`).

## Требования

- Node.js >= 24 (разработка на 26, см. `.nvmrc`), npm 11.
- Менеджер пакетов — только npm. Зависимости ставятся из корня: `npm install`. Единственный lock-файл — корневой `package-lock.json`.

## Команды (из корня)

- `npm run dev` — web и api параллельно; `dev:web` / `dev:api` — по отдельности.
- `npm run build` — сборка всех проектов; `build:web` / `build:api` — по отдельности.
- `npm run lint`, `npm run typecheck`, `npm run test` — во всех воркспейсах.
- `npm run format` / `npm run format:check` — Prettier на весь репозиторий.

Команду для одного проекта можно запустить так: `npm run <script> -w apps/<name>`.
Новую зависимость добавляйте с указанием проекта: `npm install <pkg> -w apps/<name>`. В корень попадают только общие dev-инструменты.

## Стиль кода

- Prettier настроен один, в корне (`.prettierrc`: одинарные кавычки, trailing comma `all`). Не создавайте отдельные конфиги Prettier в приложениях.
- `.editorconfig`: LF, отступ 2 пробела, финальный перевод строки.
- Линтеры у проектов разные: ESLint в `web`, oxlint в `api`.

## Git-хуки

Husky (`.husky/`, подключается скриптом `prepare` при `npm install`). Хук `pre-commit` запускает `npm run lint` и `npm run test`; если что-то падает, коммит отменяется. Не обходите хук через `--no-verify`. e2e-тесты `api` в хук не входят (нужна БД).

## Перед завершением задачи

Прогоните `npm run lint`, `npm run typecheck`, `npm run test` и `npm run format:check`.

## Актуализация документации

При изменении архитектуры проекта (структура папок и модулей, добавление или удаление приложений и пакетов, ключевые зависимости, скрипты, соглашения, схема взаимодействия web и api) обновляйте документацию в том же изменении:

- корневой `CLAUDE.md` — если изменение затрагивает репозиторий целиком;
- `CLAUDE.md` в соответствующем приложении — если изменение локальное;
- `README.md` и прочие описания, которые стали неточными.

Устаревшая документация хуже её отсутствия: если вы заметили расхождение между документацией и кодом, исправьте его.
