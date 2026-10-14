import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

const PASSWORD = 'correct-horse-battery';

const uniqueEmail = () => `user-${randomUUID()}@example.com`;

describe('Meetings (e2e)', () => {
  let app: INestApplication<App>;

  // Регистрирует нового пользователя и возвращает его Bearer-токен.
  const createUserToken = async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail(), password: PASSWORD })
      .expect(201);
    return res.body.accessToken as string;
  };

  // Пользователь с аккаунтом: токен, email и id (его можно звать на встречу).
  const createUser = async () => {
    const email = uniqueEmail();
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    const token = reg.body.accessToken as string;
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return { token, email, userId: me.body.id as string };
  };

  const validMeeting = (participants: string[] = []) => ({
    title: `Planning ${randomUUID()}`,
    date: '2030-01-15T10:00:00.000Z',
    participants,
  });

  const createMeeting = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const listMeetings = (token: string) =>
    request(app.getHttpServer())
      .get('/meetings')
      .set('Authorization', `Bearer ${token}`);

  const getMeeting = (token: string, id: string) =>
    request(app.getHttpServer())
      .get(`/meetings/${id}`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /meetings', () => {
    it('создаёт встречу, находя участников по email и сохраняя их id', async () => {
      const token = await createUserToken();
      const alice = await createUser();
      const bob = await createUser();
      const body = validMeeting([alice.email, bob.email]);

      const res = await createMeeting(token, body).expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        title: body.title,
        date: body.date,
        participants: expect.arrayContaining([
          { email: alice.email, userId: alice.userId },
          { email: bob.email, userId: bob.userId },
        ]),
      });
      expect(res.body.participants).toHaveLength(2);
    });

    it('находит участника независимо от регистра email и не дублирует его', async () => {
      const token = await createUserToken();
      const alice = await createUser();

      const res = await createMeeting(
        token,
        validMeeting([alice.email.toUpperCase(), alice.email]),
      ).expect(201);

      expect(res.body.participants).toEqual([
        { email: alice.email, userId: alice.userId },
      ]);
    });

    it('возвращает 400 и не создаёт встречу, если у участника нет аккаунта', async () => {
      const token = await createUserToken();
      const alice = await createUser();
      const ghost = uniqueEmail();

      const res = await createMeeting(
        token,
        validMeeting([alice.email, ghost]),
      ).expect(400);

      expect(res.body.message).toContain(ghost);
      const list = await listMeetings(token).expect(200);
      expect(list.body).toEqual([]);
    });

    it('создаёт встречу без участников, если передан пустой массив', async () => {
      const token = await createUserToken();

      const res = await createMeeting(token, validMeeting([])).expect(201);

      expect(res.body.participants).toEqual([]);
    });

    it('созданная встреча доступна по GET /meetings/:id', async () => {
      const token = await createUserToken();
      const created = await createMeeting(token, validMeeting()).expect(201);

      const res = await getMeeting(token, created.body.id).expect(200);

      expect(res.body).toEqual(created.body);
    });

    it('возвращает 401 без токена', async () => {
      await request(app.getHttpServer())
        .post('/meetings')
        .send(validMeeting())
        .expect(401);
    });

    it('возвращает 401 с невалидным токеном', async () => {
      await createMeeting('not.a.jwt', validMeeting()).expect(401);
    });

    it.each([
      ['без title', { date: '2030-01-15T10:00:00.000Z', participants: [] }],
      [
        'с пустым title',
        { title: '', date: '2030-01-15T10:00:00.000Z', participants: [] },
      ],
      [
        'с title не строкой',
        { title: 123, date: '2030-01-15T10:00:00.000Z', participants: [] },
      ],
      ['без date', { title: 'Sync', participants: [] }],
      [
        'с невалидной date',
        { title: 'Sync', date: 'не дата', participants: [] },
      ],
      ['без participants', { title: 'Sync', date: '2030-01-15T10:00:00.000Z' }],
      [
        'с participants не массивом',
        {
          title: 'Sync',
          date: '2030-01-15T10:00:00.000Z',
          participants: 'alice@example.com',
        },
      ],
      [
        'с невалидным email в participants',
        {
          title: 'Sync',
          date: '2030-01-15T10:00:00.000Z',
          participants: ['not-an-email'],
        },
      ],
      ['с пустым телом', {}],
    ])('возвращает 400 для запроса %s', async (_name, body) => {
      const token = await createUserToken();

      await createMeeting(token, body).expect(400);
    });
  });

  describe('GET /meetings', () => {
    it('возвращает пустой список для пользователя без встреч', async () => {
      const token = await createUserToken();

      const res = await listMeetings(token).expect(200);

      expect(res.body).toEqual([]);
    });

    it('возвращает все встречи текущего пользователя', async () => {
      const token = await createUserToken();
      const first = await createMeeting(token, validMeeting()).expect(201);
      const second = await createMeeting(token, validMeeting()).expect(201);

      const res = await listMeetings(token).expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body).toEqual(
        expect.arrayContaining([first.body, second.body]),
      );
    });

    it('возвращает встречи, на которые пользователь приглашён участником', async () => {
      const owner = await createUserToken();
      const participant = await createUser();
      const invited = await createMeeting(
        owner,
        validMeeting([participant.email]),
      ).expect(201);
      await createMeeting(owner, validMeeting()).expect(201);

      const res = await listMeetings(participant.token).expect(200);

      expect(res.body).toEqual([invited.body]);
    });

    it('не возвращает встречи других пользователей', async () => {
      const alice = await createUserToken();
      const bob = await createUserToken();
      const aliceMeeting = await createMeeting(alice, validMeeting()).expect(
        201,
      );
      await createMeeting(bob, validMeeting()).expect(201);

      const res = await listMeetings(alice).expect(200);

      expect(res.body).toEqual([aliceMeeting.body]);
    });

    it('возвращает 401 без токена', async () => {
      await request(app.getHttpServer()).get('/meetings').expect(401);
    });
  });

  describe('GET /meetings/:id', () => {
    it('возвращает встречу по id', async () => {
      const token = await createUserToken();
      const alice = await createUser();
      const body = validMeeting([alice.email]);
      const created = await createMeeting(token, body).expect(201);

      const res = await getMeeting(token, created.body.id).expect(200);

      expect(res.body).toEqual({
        id: created.body.id,
        title: body.title,
        date: body.date,
        participants: [{ email: alice.email, userId: alice.userId }],
      });
    });

    it('возвращает встречу участнику, а постороннему даёт 404', async () => {
      const owner = await createUserToken();
      const participant = await createUser();
      const stranger = await createUserToken();
      const created = await createMeeting(
        owner,
        validMeeting([participant.email]),
      ).expect(201);

      await getMeeting(participant.token, created.body.id).expect(200);
      await getMeeting(stranger, created.body.id).expect(404);
    });

    it('возвращает 404, если встречи с таким id нет', async () => {
      const token = await createUserToken();
      // Встреча существует, но с другим id: исключаем ложный 404 от отсутствующего маршрута.
      await createMeeting(token, validMeeting()).expect(201);

      await getMeeting(token, randomUUID()).expect(404);
    });

    it('возвращает 404 для чужой встречи, не раскрывая её существование', async () => {
      const alice = await createUserToken();
      const bob = await createUserToken();
      const aliceMeeting = await createMeeting(alice, validMeeting()).expect(
        201,
      );

      await getMeeting(bob, aliceMeeting.body.id).expect(404);
    });

    it('возвращает 404 для id, который не является UUID', async () => {
      const token = await createUserToken();
      await createMeeting(token, validMeeting()).expect(201);

      await getMeeting(token, 'not-a-uuid').expect(404);
    });

    it('возвращает 401 без токена', async () => {
      const token = await createUserToken();
      const created = await createMeeting(token, validMeeting()).expect(201);

      await request(app.getHttpServer())
        .get(`/meetings/${created.body.id}`)
        .expect(401);
    });
  });
});
