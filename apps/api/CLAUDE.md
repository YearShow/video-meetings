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

## Соглашения

- Структура Nest: модуль / контроллер / сервис на каждую фичу, новые модули создавайте через `nest g` или по образцу `src/app.module.ts`.
- Промисы всегда await-ятся или обрабатываются: правило `typescript/no-floating-promises` включено как error.
- Для декораторов и DI используется `reflect-metadata`; не убирайте его импорт из `src/main.ts`.
- Форматирование делает корневой Prettier; не добавляйте локальный конфиг.
- `dist/` и `coverage/` генерируются, вручную не правьте.

## Актуализация документации

При изменении архитектуры этого приложения (структура папок и модулей, ключевые зависимости, скрипты, соглашения) обновляйте этот файл в том же изменении. Если изменение выходит за рамки приложения, обновите и корневой `CLAUDE.md`.
