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
- `src/meetings` — встречи: `POST /meetings` (201), `GET /meetings`, `GET /meetings/:id` (404, если встречи нет или она недоступна пользователю). Все эндпоинты закрыты `JwtAuthGuard` (из `src/auth`, текущий пользователь — декоратор `@CurrentUser()`). Встреча принадлежит создателю (`ownerId`). Участники лежат в таблице `MeetingParticipant` (`meetingId`, `userId` с внешним ключом на `users`, `email`; уникальность `(meetingId, userId)`). Клиент передаёт в `participants` email, а сервер при создании находит пользователей и сохраняет их `userId`; email без аккаунта — 400 со списком ненайденных адресов. В ответе участник — `{ email, userId }`. Доступ к встрече и её данным (список, чтение, в дальнейшем файлы) имеют владелец и участники, правило сосредоточено в `MeetingAccessService` (`accessibleBy(userId)` для `where`, `hasAccess(meetingId, userId)`); не дублируйте условие вручную. Реализовано по CQRS, см. ниже.
- `src/meetings/files` — файлы встречи (под `JwtAuthGuard` и `MeetingAccessGuard`, который до чтения тела пускает только владельца и участников; недоступная встреча — 404): `POST /meetings/:meetingId/files` (201, один файл `multipart/form-data`, поле любое) и `GET /meetings/:meetingId/files` (метаданные без `storageKey`, новые сверху). Загрузка разбирается `busboy` напрямую в контроллере (не `FileInterceptor`) и потоком уходит в команду `UploadMeetingFileCommand`, файл не буферизуется. Лимит `MAX_UPLOAD_BYTES` (по умолчанию 500 MiB = 524 288 000 байт, не больше 2³¹−1: размер хранится в INTEGER) проверяется по фактически записанным байтам: превышение — 413, «слишком большой» `Content-Length` отклоняется ещё до чтения тела; не multipart — 415, нет файла или файлов больше одного — 400. При обрыве, ошибке или превышении лимита частичные данные удаляются, записи в БД нет; запись создаётся только после успешной записи файла. Имя файла от клиента (`utf8`) нормализуется и хранится только для отображения, на диск не попадает. Модель — `MeetingFile` (статус `UPLOADED`, удаляется каскадом со встречей).
  - Скачивание по короткоживущей ссылке (браузер открывает её навигацией и не может передать `Authorization`): `POST /meetings/:meetingId/files/:fileId/download-link` (200, под `JwtAuthGuard`, проверка доступа, ответ `{ url }` — относительный путь, `web` добавляет адрес api) и `GET /meetings/:meetingId/files/:fileId/content?token=` (`DownloadTokenGuard` + `MeetingAccessGuard`, доступ перепроверяется при каждом открытии). Токен (`DownloadTokenService`) живёт 60 с, привязан к пользователю и файлу и имеет claim `scope: 'download'`; `JwtAuthGuard` отклоняет любые JWT со `scope`, поэтому токен скачивания не открывает остальной API. Файл ищется внутри встречи из пути (`MeetingFilesService.getAccessible`), чужой файл или встреча — 404, как и запись без данных в хранилище. Отдаётся потоком (`StreamableFile`) как вложение: `Content-Disposition: attachment` с оригинальным именем (RFC 6266, в том числе кириллица), `Content-Type: application/octet-stream` (MIME от пользователя не используется), `nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`. Range-запросы не поддерживаются.
  - `DeleteMeetingFilesCommand(meetingId)` удаляет из хранилища все файлы встречи (внутренняя команда без проверки доступа; эндпоинта удаления встречи пока нет, тот, кто его добавит, должен удалять встречу и вызывать команду). Записи `MeetingFile` удаляются каскадом БД.
- `src/transcription` — транскрибация файлов встречи локальным whisper.cpp (`whisper-cli`, модель `base`, язык `ru`; внешние сервисы не используются). При загрузке mp3 или mp4 (расширение и MIME, `isTranscribable`) `UploadMeetingFileHandler` в одной записи с файлом создаёт `FileTranscription` (статус `QUEUED`, `progress`, `text`, `error`; каскадно удаляется с файлом) и вызывает `TranscriptionService.enqueue`; ответ загрузки не ждёт расшифровки. Очередь живёт в памяти процесса, источник истины — БД; одновременно идёт не больше `TRANSCRIPTION_CONCURRENCY` задач (по умолчанию 1). Задача читает файл из хранилища во временный каталог (очищается всегда); у mp4 `AudioExtractor` (`FFMPEG_BIN`) сначала извлекает первую аудиодорожку в WAV 16 кГц моно, mp3 идёт в Whisper напрямую. `WhisperRunner` (`WHISPER_BIN`, `WHISPER_MODEL_PATH`; не задана или файла нет — понятная ошибка до запуска) запускается с `-pp`, процент из stderr пишется в `progress` (только растёт, до завершения не выше 99). Статусы: `IN_PROGRESS` → `DONE` (текст, 100) или `ERROR`. Ошибки классифицируются: нет звуковой дорожки, файл повреждён, прочие сбои ffmpeg/Whisper; `TranscriptionError` с готовым русским сообщением показывается пользователю, остальное — общее «Не удалось выполнить транскрибацию», детали (stderr) только в логе. Состояние отдаётся полем `transcription` (`null` для других форматов) в `GET /meetings/:id/files` и ответе загрузки. Повтор: `POST /meetings/:meetingId/files/:fileId/transcription/retry` (200, `RetryTranscriptionCommand`; доступ как к файлу, чужое — 404, нет транскрибации — 404, статус не `ERROR` — 409; переход `ERROR` → `QUEUED` одним условным обновлением, ответ — файл в состоянии `QUEUED`). Очередь не ставит один файл дважды, а задача берётся в работу только из `QUEUED`. Восстановление после рестарта: при старте `TranscriptionService.recover()` возвращает прерванные `IN_PROGRESS` в `QUEUED` и ставит все `QUEUED` в очередь по порядку создания; рассчитано на один экземпляр api, отключается `TRANSCRIPTION_RECOVERY=off` (так сделано в e2e, где тесты делят одну БД). Файл, удалённый из БД, пропускается (запись транскрибации уходит каскадом), пропавший из хранилища — `ERROR` «Файл недоступен в хранилище»; очередь продолжает работу. План и статус фаз: `docs/plan-meeting-file-transcription.md`.
- `src/storage` — абстракция `FileStorage` (токен `FILE_STORAGE`: `save`/`read`/`delete`/`deletePrefix`) и `LocalDiskStorage`: каталог `FILES_DIR` (не отдаётся как статика, в git не попадает), запись во временный файл `.tmp/` и атомарный `rename`, ключи вида `meetings/<meetingId>/<fileId>` строит сервер, ключ вне каталога отклоняется. При старте `LocalDiskStorage` удаляет из `.tmp/` недописанные файлы старше 2 часов (остатки упавшего процесса). Заменяется на S3-совместимое без изменения API.
- `src/app.setup.ts` — `configureApp()`, общая для `main.ts` и e2e-тестов: CORS только для `WEB_ORIGIN` (по умолчанию `http://localhost:3000`, методы GET/POST, заголовки `Authorization` и `Content-Type`) и `requestTimeout` в 1 час (долгая загрузка не обрывается таймаутом Node в 5 минут, но защита от медленных клиентов остаётся). В e2e вызывайте её после `createNestApplication()`.
- Конфигурация через `@nestjs/config`: `apps/api/.env` (не коммитится, пример — в корневом `.env.example`), переменные `DATABASE_URL`, `JWT_SECRET` и `FILES_DIR` обязательны, `MAX_UPLOAD_BYTES` и `WEB_ORIGIN` необязательны; `PORT` необязателен (по умолчанию 4000, порт 3000 занимает `web`).
- Docker: `apps/api/Dockerfile` (контекст — корень репозитория; отдельный этап собирает whisper.cpp (`whisper-cli`, `WHISPER_CPP_VERSION`), в runtime ставятся `ffmpeg` и `libgomp1`, модель монтируется compose в `/models` только для чтения, `WHISPER_MODEL_PATH=/models/ggml-base.bin`; `npm ci -w apps/api`, Prisma Client и сборка, запуск от пользователя `node`, команда запуска сначала выполняет `prisma migrate deploy`) и сервис `api` в `docker-compose.yml`. `FILES_DIR=/data/files` — точка монтирования именованного volume `api_files`; не заменяйте его bind-mount без учёта владельца каталога (`node`).
- e2e-тесты ходят в реальную БД из Docker Compose: перед запуском `docker compose up -d postgres` и `npm run db:deploy`. Файлы e2e делят одну БД; на однопоточной БД (например, PGlite) запускайте с `--no-file-parallelism`.

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

## Файлы встреч

Обоснование решений (хранилище, загрузка потоком, токен скачивания): `docs/research-meeting-file-upload.md`.
