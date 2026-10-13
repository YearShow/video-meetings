import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

const PASSWORD = 'correct-horse-battery';

// Уникальный email на каждый вызов: тесты не зависят от состояния БД и друг от друга.
const uniqueEmail = () => `user-${randomUUID()}@example.com`;

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  const register = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/auth/register').send(body);

  const login = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/auth/login').send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Валидация должна быть подключена внутри AppModule (APP_PIPE),
    // а не только в main.ts, иначе этот тест её не увидит.
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('создаёт пользователя и возвращает JWT', async () => {
      const email = uniqueEmail();

      const res = await register({ email, password: PASSWORD }).expect(201);

      expect(res.body).toEqual({ accessToken: expect.any(String) });
      expect(res.body.accessToken.split('.')).toHaveLength(3);
    });

    it('кладёт в токен идентификатор пользователя и срок действия', async () => {
      const res = await register({
        email: uniqueEmail(),
        password: PASSWORD,
      }).expect(201);

      const payload = decodeJwtPayload(res.body.accessToken);

      expect(payload.sub).toEqual(expect.any(String));
      expect(payload.exp).toEqual(expect.any(Number));
      expect(payload.exp as number).toBeGreaterThan(Date.now() / 1000);
    });

    it('после регистрации пользователь может войти с теми же данными', async () => {
      const email = uniqueEmail();
      await register({ email, password: PASSWORD }).expect(201);

      await login({ email, password: PASSWORD }).expect(200);
    });

    it('не возвращает пароль и его хэш в ответе', async () => {
      const res = await register({
        email: uniqueEmail(),
        password: PASSWORD,
      }).expect(201);

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(PASSWORD);
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('возвращает 409, если email уже зарегистрирован', async () => {
      const email = uniqueEmail();
      await register({ email, password: PASSWORD }).expect(201);

      await register({ email, password: 'another-password-1' }).expect(409);
    });

    it('считает email регистронезависимым', async () => {
      const email = uniqueEmail();
      await register({ email, password: PASSWORD }).expect(201);

      await register({ email: email.toUpperCase(), password: PASSWORD }).expect(
        409,
      );
    });

    it('повторная регистрация не меняет пароль существующего пользователя', async () => {
      const email = uniqueEmail();
      await register({ email, password: PASSWORD }).expect(201);
      await register({ email, password: 'another-password-1' }).expect(409);

      await login({ email, password: PASSWORD }).expect(200);
      await login({ email, password: 'another-password-1' }).expect(401);
    });

    it.each([
      ['без email', { password: PASSWORD }],
      ['без пароля', { email: 'user@example.com' }],
      ['с пустым телом', {}],
      ['с невалидным email', { email: 'not-an-email', password: PASSWORD }],
      ['с пустым email', { email: '', password: PASSWORD }],
      [
        'со слишком коротким паролем',
        { email: 'user@example.com', password: '123' },
      ],
      [
        'с паролем не строкой',
        { email: 'user@example.com', password: 12345678 },
      ],
    ])('возвращает 400 для запроса %s', async (_name, body) => {
      await register(body).expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('возвращает JWT для существующего пользователя', async () => {
      const email = uniqueEmail();
      await register({ email, password: PASSWORD }).expect(201);

      const res = await login({ email, password: PASSWORD }).expect(200);

      expect(res.body).toEqual({ accessToken: expect.any(String) });
      expect(res.body.accessToken.split('.')).toHaveLength(3);
    });

    it('выдаёт токен с тем же sub, что и при регистрации', async () => {
      const email = uniqueEmail();
      const registered = await register({ email, password: PASSWORD }).expect(
        201,
      );

      const res = await login({ email, password: PASSWORD }).expect(200);

      expect(decodeJwtPayload(res.body.accessToken).sub).toBe(
        decodeJwtPayload(registered.body.accessToken).sub,
      );
    });

    it('находит пользователя без учёта регистра email', async () => {
      const email = uniqueEmail();
      await register({ email, password: PASSWORD }).expect(201);

      await login({ email: email.toUpperCase(), password: PASSWORD }).expect(
        200,
      );
    });

    it('возвращает 401 при неверном пароле', async () => {
      const email = uniqueEmail();
      await register({ email, password: PASSWORD }).expect(201);

      await login({ email, password: 'wrong-password-1' }).expect(401);
    });

    it('возвращает 401 для несуществующего пользователя', async () => {
      await login({ email: uniqueEmail(), password: PASSWORD }).expect(401);
    });

    it('не раскрывает, существует ли email: ответ одинаков для неверного пароля и неизвестного email', async () => {
      const email = uniqueEmail();
      await register({ email, password: PASSWORD }).expect(201);

      const wrongPassword = await login({
        email,
        password: 'wrong-password-1',
      }).expect(401);
      const unknownEmail = await login({
        email: uniqueEmail(),
        password: PASSWORD,
      }).expect(401);

      expect(wrongPassword.body).toEqual(unknownEmail.body);
    });

    it('не создаёт пользователя: после неудачного входа регистрация с тем же email проходит', async () => {
      const email = uniqueEmail();

      await login({ email, password: PASSWORD }).expect(401);

      // Если бы login создал пользователя, здесь был бы 409.
      await register({ email, password: PASSWORD }).expect(201);
    });

    it.each([
      ['без email', { password: PASSWORD }],
      ['без пароля', { email: 'user@example.com' }],
      ['с пустым телом', {}],
      ['с невалидным email', { email: 'not-an-email', password: PASSWORD }],
      [
        'с паролем не строкой',
        { email: 'user@example.com', password: 12345678 },
      ],
    ])('возвращает 400 для запроса %s', async (_name, body) => {
      await login(body).expect(400);
    });
  });
});
