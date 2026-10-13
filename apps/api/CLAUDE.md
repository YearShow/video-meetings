# apps/api

Бэкенд на Nest.js 12 (платформа Express), TypeScript в strict-режиме, пакет в формате ESM (`"type": "module"`). Исходники в `src/`, e2e-тесты в `test/`.

## Команды

Из корня репозитория: `npm run <script> -w apps/api`. Из этой папки — просто `npm run <script>`.

- `start:dev` — запуск с watch; `start:debug` — с отладчиком; `start:prod` — запуск из `dist/`.
- `build` — `nest build`.
- `lint` — oxlint с типизированными правилами (`.oxlintrc.json`, нужен `oxlint-tsgolint`).
- `typecheck` — `tsc --noEmit`.
- `test` — Vitest (юнит-тесты `*.spec.ts` рядом с кодом); `test:watch`, `test:cov`.
- `test:e2e` — Vitest с `vitest.config.e2e.ts`, тесты в `test/`.
- `format` — Prettier для `src` и `test`.
- `db:generate` — генерация Prisma Client (выполняется и в `postinstall`); `db:migrate` — `prisma migrate dev` (создать и применить миграцию); `db:deploy` — применить существующие миграции.

## Модули и БД

- `src/prisma` — глобальный `PrismaModule` / `PrismaService` (Prisma 7 + драйвер-адаптер `@prisma/adapter-pg`). Схема — `prisma/schema.prisma`, миграции — `prisma/migrations`, конфиг — `prisma.config.ts`. Клиент генерируется в `src/generated/prisma` (в git не коммитится).
- `src/users` — `UsersService` (поиск и создание пользователей).
- `src/auth` — `POST /auth/register` (201) и `POST /auth/login` (200), оба возвращают `{ accessToken }`, и `GET /auth/me` (под `JwtAuthGuard`, возвращает `{ id, email }` текущего пользователя) (JWT, `sub` = id пользователя, срок 1 час). Пароли хэшируются через argon2, email нормализуется в нижний регистр. Неверный логин или пароль — одинаковый 401. Валидация — глобальный `ValidationPipe` через `APP_PIPE` в `AppModule` (чтобы работала и в e2e).
- `src/meetings` — встречи: `POST /meetings` (201), `GET /meetings`, `GET /meetings/:id` (404, если встречи нет или она чужая). Все эндпоинты закрыты `JwtAuthGuard` (из `src/auth`, текущий пользователь — декоратор `@CurrentUser()`). Встреча принадлежит создателю (`ownerId`); `participants` — массив email. Реализовано по CQRS, см. ниже.
- Конфигурация через `@nestjs/config`: `apps/api/.env` (не коммитится, пример — в корневом `.env.example`), переменные `DATABASE_URL` и `JWT_SECRET` обязательны; `PORT` необязателен (по умолчанию 4000, порт 3000 занимает `web`).
- e2e-тесты ходят в реальную БД из Docker Compose: перед запуском `docker compose up -d postgres` и `npm run db:deploy`.

## CQRS

Для фич с бизнес-логикой используется `@nestjs/cqrs` (образец — `src/meetings`). Идея: операции, которые **меняют** состояние (команды), отделены от операций, которые только **читают** (запросы). У каждой операции свой класс-сообщение и свой обработчик с одной ответственностью.

- **Контроллер** тонкий: валидирует DTO, берёт `CurrentUser`, создаёт `Command`/`Query` и отправляет через `CommandBus.execute()` / `QueryBus.execute()`. Бизнес-логики и обращений к БД в нём нет.
- **Команда** (`commands/<action>.command.ts`) — намерение изменить состояние, например `CreateMeetingCommand`. Именуется глаголом в повелительном наклонении. Наследует `Command<TResult>` (тип результата выводится в `execute()`), поля — `readonly`, только данные, без логики.
- **Запрос** (`queries/<name>.query.ts`) — вопрос без побочных эффектов, например `GetMeetingsQuery`. Наследует `Query<TResult>`. Запрос никогда ничего не пишет.
- **Обработчик** (`*.handler.ts`) — класс с `@CommandHandler(X)` / `@QueryHandler(X)`, один обработчик на одно сообщение, метод `execute()`. Здесь живут правила, проверки и работа с `PrismaService`. Обработчики регистрируются в `providers` модуля фичи, а в `imports` добавляется `CqrsModule`.
- **Модель чтения** (`<feature>.view.ts`) — то, что возвращаем клиенту; обработчики маппят в неё записи Prisma, чтобы не отдавать внутренние поля (`ownerId`, хэши и т. п.).
- **Ошибки** обработчики бросают как обычные HTTP-исключения Nest (`NotFoundException` и др.), они доходят до клиента без дополнительной обработки.
- **Права доступа** проверяются в обработчике (например, запрос ограничен `ownerId`), а не в контроллере, чтобы правило не обходилось другим входом.
- Команды и запросы не вызывают друг друга напрямую; общая логика выносится в сервис. События (`EventBus`) пока не используются, подключайте их, когда появятся побочные реакции на изменения.

Структура фичи:

```
src/<feature>/
  commands/  <action>.command.ts, <action>.handler.ts
  queries/   <name>.query.ts, <name>.handler.ts
  <feature>.controller.ts, <feature>.dto.ts, <feature>.view.ts, <feature>.module.ts
```

Модуль `auth` пока устроен проще (сервис без шины): при росте его можно перевести на тот же подход.

## Соглашения

- Структура Nest: модуль / контроллер / сервис на каждую фичу, новые модули создавайте через `nest g` или по образцу `src/app.module.ts`.
- Промисы всегда await-ятся или обрабатываются: правило `typescript/no-floating-promises` включено как error.
- Для декораторов и DI используется `reflect-metadata`; не убирайте его импорт из `src/main.ts`.
- Форматирование делает корневой Prettier; не добавляйте локальный конфиг.
- `dist/` и `coverage/` генерируются, вручную не правьте.

## Актуализация документации

При изменении архитектуры этого приложения (структура папок и модулей, ключевые зависимости, скрипты, соглашения) обновляйте этот файл в том же изменении. Если изменение выходит за рамки приложения, обновите и корневой `CLAUDE.md`.
