import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Server } from 'node:http';

export const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';
export const REQUEST_TIMEOUT_MS = 60 * 60 * 1000; // 1 час

// Настройка, общая для main.ts и e2e-тестов.
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // web (3000) ходит в api (4000) из браузера при загрузке файла: JWT передаётся
  // заголовком Authorization, cookie не используются. Origin строго один, не '*'.
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN') ?? DEFAULT_WEB_ORIGIN,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  });

  // Загрузка файла до 500 MiB на медленном канале идёт дольше 5 минут, которые
  // Node по умолчанию даёт на получение всего запроса. Ноль отключил бы защиту от
  // медленных клиентов на всех маршрутах, поэтому задаём большой, но конечный потолок.
  (app.getHttpServer() as Server).requestTimeout = REQUEST_TIMEOUT_MS;
}
