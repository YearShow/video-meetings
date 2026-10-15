import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

const PASSWORD = 'correct-horse-battery';
const LIMIT = 1024 * 1024; // 1 MiB вместо 500 MiB, чтобы тесты были быстрыми

const uniqueEmail = () => `user-${randomUUID()}@example.com`;

describe('Meeting files upload (e2e)', () => {
  let app: INestApplication<App>;
  let filesDir: string;

  const createUser = async () => {
    const email = uniqueEmail();
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    return { token: reg.body.accessToken as string, email };
  };

  const createMeeting = async (token: string, participants: string[] = []) => {
    const res = await request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Sync', date: '2030-01-15T10:00:00.000Z', participants })
      .expect(201);
    return res.body.id as string;
  };

  const upload = (
    token: string | null,
    meetingId: string,
    content: Buffer,
    filename = 'doc.txt',
    contentType = 'text/plain',
  ) => {
    const req = request(app.getHttpServer()).post(
      `/meetings/${meetingId}/files`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.attach('file', content, { filename, contentType });
  };

  const listFiles = (token: string | null, meetingId: string) => {
    const req = request(app.getHttpServer()).get(
      `/meetings/${meetingId}/files`,
    );
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  // Каталог хранилища без служебного .tmp: только файлы встреч.
  const storedFiles = async () => {
    const root = path.join(filesDir, 'meetings');
    const exists = await stat(root).then(
      () => true,
      () => false,
    );
    if (!exists) return [];
    const result: string[] = [];
    for (const meeting of await readdir(root)) {
      for (const file of await readdir(path.join(root, meeting))) {
        result.push(`${meeting}/${file}`);
      }
    }
    return result;
  };

  const tmpFiles = () =>
    readdir(path.join(filesDir, '.tmp')).catch(() => [] as string[]);

  beforeAll(async () => {
    filesDir = await mkdtemp(path.join(tmpdir(), 'meeting-files-'));
    process.env.FILES_DIR = filesDir;
    process.env.MAX_UPLOAD_BYTES = String(LIMIT);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await rm(filesDir, { recursive: true, force: true });
    delete process.env.FILES_DIR;
    delete process.env.MAX_UPLOAD_BYTES;
  });

  describe('POST /meetings/:id/files', () => {
    it('владелец загружает файл и получает его метаданные', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);

      const res = await upload(
        owner.token,
        meetingId,
        Buffer.from('hello'),
        'notes.txt',
      ).expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        name: 'notes.txt',
        mimeType: 'text/plain',
        size: 5,
        status: 'UPLOADED',
        createdAt: expect.any(String),
        uploadedBy: { id: expect.any(String), email: owner.email },
        transcription: null,
      });
      expect(JSON.stringify(res.body)).not.toContain('storageKey');
      expect(await storedFiles()).toContain(`${meetingId}/${res.body.id}`);
    });

    it('участник встречи тоже может загрузить файл', async () => {
      const owner = await createUser();
      const participant = await createUser();
      const meetingId = await createMeeting(owner.token, [participant.email]);

      const res = await upload(
        participant.token,
        meetingId,
        Buffer.from('x'),
      ).expect(201);

      expect(res.body.uploadedBy.email).toBe(participant.email);
    });

    it('сохраняет кириллическое имя файла', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);

      const res = await upload(
        owner.token,
        meetingId,
        Buffer.from('x'),
        'Запись встречи.txt',
      ).expect(201);

      expect(res.body.name).toBe('Запись встречи.txt');
    });

    it('имя с ../ не влияет на путь в хранилище', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);

      const res = await upload(
        owner.token,
        meetingId,
        Buffer.from('x'),
        '../../evil.txt',
      ).expect(201);

      expect(res.body.name).toBe('evil.txt');
      expect(await storedFiles()).toContain(`${meetingId}/${res.body.id}`);
    });

    it('принимает файл ровно в размер лимита', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);

      const res = await upload(
        owner.token,
        meetingId,
        Buffer.alloc(LIMIT, 1),
      ).expect(201);

      expect(res.body.size).toBe(LIMIT);
    });

    it('файл больше лимита → 413 без следов в хранилище и БД', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);
      const before = await storedFiles();

      // Тело чуть больше лимита, но меньше порога раннего отказа по Content-Length,
      // поэтому отказывает именно потоковая проверка.
      await upload(owner.token, meetingId, Buffer.alloc(LIMIT + 1, 1)).expect(
        413,
      );

      expect(await storedFiles()).toEqual(before);
      expect(await tmpFiles()).toEqual([]);
    });

    it('очень большое тело отклоняется ранним 413 по Content-Length', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);
      const before = await storedFiles();

      // supertest/superagent при отказе до конца отправки может получить
      // сетевую ошибку вместо ответа: принимаем 413 или обрыв соединения.
      const result = await upload(
        owner.token,
        meetingId,
        Buffer.alloc(LIMIT * 3, 1),
      ).then(
        (r) => r.status,
        (e: NodeJS.ErrnoException) => e.code ?? e.message,
      );

      expect([413, 'ECONNRESET', 'EPIPE']).toContain(result);
      expect(await storedFiles()).toEqual(before);
      expect(await tmpFiles()).toEqual([]);
    });

    it('запрос без файла → 400', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.token}`)
        .field('note', 'no file')
        .expect(400);
    });

    it('два файла в одном запросе → 400, ничего не сохраняется', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);
      const before = await storedFiles();

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.token}`)
        .attach('file', Buffer.from('a'), 'a.txt')
        .attach('file', Buffer.from('b'), 'b.txt')
        .expect(400);

      expect(await storedFiles()).toEqual(before);
    });

    it('не multipart → 415', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ a: 1 })
        .expect(415);
    });

    it('обрыв соединения посреди загрузки не оставляет файла и записи', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);
      const before = await storedFiles();

      const server = await app.listen(0);
      const { port } = (server as Server).address() as AddressInfo;
      const boundary = `----test${randomUUID()}`;
      const head = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      );

      await new Promise<void>((resolve) => {
        const req = httpRequest({
          port,
          method: 'POST',
          path: `/meetings/${meetingId}/files`,
          headers: {
            Authorization: `Bearer ${owner.token}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            // Заявляем больше, чем отправим: тело не будет завершено.
            'Content-Length': String(LIMIT / 2),
          },
        });
        req.on('error', () => undefined);
        req.on('close', () => resolve());
        req.write(Buffer.concat([head, Buffer.alloc(64 * 1024, 1)]));
        setTimeout(() => req.destroy(), 200);
      });

      // Серверу нужно время заметить обрыв и очистить данные.
      await vi.waitFor(async () => {
        expect(await tmpFiles()).toEqual([]);
      });
      expect(await storedFiles()).toEqual(before);

      await listFiles(owner.token, meetingId).expect(200, []);
    });
  });

  describe('GET /meetings/:id/files', () => {
    it('пустая встреча → пустой список', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);

      await listFiles(owner.token, meetingId).expect(200, []);
    });

    it('возвращает метаданные файлов, новые сверху', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);
      const first = await upload(
        owner.token,
        meetingId,
        Buffer.from('one'),
        'one.txt',
      ).expect(201);
      const second = await upload(
        owner.token,
        meetingId,
        Buffer.from('three'),
        'two.txt',
      ).expect(201);

      const res = await listFiles(owner.token, meetingId).expect(200);

      expect(res.body).toEqual([second.body, first.body]);
      expect(res.body[1]).toEqual({
        id: expect.any(String),
        name: 'one.txt',
        mimeType: 'text/plain',
        size: 3,
        status: 'UPLOADED',
        createdAt: expect.any(String),
        uploadedBy: { id: expect.any(String), email: owner.email },
        transcription: null,
      });
      expect(JSON.stringify(res.body)).not.toContain('storageKey');
    });

    it('показывает только файлы своей встречи', async () => {
      const owner = await createUser();
      const mine = await createMeeting(owner.token);
      const other = await createMeeting(owner.token);
      const inMine = await upload(owner.token, mine, Buffer.from('a')).expect(
        201,
      );
      await upload(owner.token, other, Buffer.from('b')).expect(201);

      const res = await listFiles(owner.token, mine).expect(200);

      expect(res.body).toEqual([inMine.body]);
    });

    it('участник видит файлы встречи', async () => {
      const owner = await createUser();
      const participant = await createUser();
      const meetingId = await createMeeting(owner.token, [participant.email]);
      const uploaded = await upload(
        owner.token,
        meetingId,
        Buffer.from('x'),
      ).expect(201);

      const res = await listFiles(participant.token, meetingId).expect(200);

      expect(res.body).toEqual([uploaded.body]);
    });

    it('неудачная загрузка не появляется в списке', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);

      await upload(owner.token, meetingId, Buffer.alloc(LIMIT + 1, 1)).expect(
        413,
      );

      await listFiles(owner.token, meetingId).expect(200, []);
    });
  });

  describe('CORS', () => {
    const WEB = 'http://localhost:3000';

    it('preflight от web разрешает POST с Authorization', async () => {
      const res = await request(app.getHttpServer())
        .options('/meetings/any/files')
        .set('Origin', WEB)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization')
        .expect(204);

      expect(res.headers['access-control-allow-origin']).toBe(WEB);
      expect(res.headers['access-control-allow-headers']).toMatch(
        /authorization/i,
      );
      expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
    });

    it('ответы содержат разрешённый origin', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);

      const res = await listFiles(owner.token, meetingId)
        .set('Origin', WEB)
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe(WEB);
    });

    it('чужому origin разрешение не выдаётся', async () => {
      const res = await request(app.getHttpServer())
        .options('/meetings/any/files')
        .set('Origin', 'http://evil.example')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).not.toBe(
        'http://evil.example',
      );
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('ошибка доступа тоже несёт CORS-заголовки, браузер увидит 404', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const meetingId = await createMeeting(owner.token);

      const res = await listFiles(stranger.token, meetingId)
        .set('Origin', WEB)
        .expect(404);

      expect(res.headers['access-control-allow-origin']).toBe(WEB);
    });
  });

  describe('доступ', () => {
    it('без токена → 401', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);

      await upload(null, meetingId, Buffer.from('x')).expect(401);
    });

    it('невалидный токен → 401', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);

      await upload('not.a.jwt', meetingId, Buffer.from('x')).expect(401);
    });

    it('посторонний → 404 и ничего не сохраняется', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const meetingId = await createMeeting(owner.token);
      const before = await storedFiles();

      await upload(stranger.token, meetingId, Buffer.from('x')).expect(404);

      expect(await storedFiles()).toEqual(before);
    });

    it('несуществующая встреча → 404', async () => {
      const owner = await createUser();

      await upload(owner.token, randomUUID(), Buffer.from('x')).expect(404);
    });

    it('список: без токена → 401', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);

      await listFiles(null, meetingId).expect(401);
    });

    it('список: посторонний → 404, файлы не раскрываются', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const meetingId = await createMeeting(owner.token);
      await upload(owner.token, meetingId, Buffer.from('x')).expect(201);

      const res = await listFiles(stranger.token, meetingId).expect(404);

      expect(JSON.stringify(res.body)).not.toContain('.txt');
    });

    it('список: несуществующая встреча → 404', async () => {
      const owner = await createUser();

      await listFiles(owner.token, randomUUID()).expect(404);
    });
  });
});
