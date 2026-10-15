import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import request from 'supertest';
import type { Response } from 'superagent';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { DeleteMeetingFilesCommand } from './../src/meetings/files/commands/delete-meeting-files.command.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const PASSWORD = 'correct-horse-battery';
const MiB = 1024 * 1024;

// Тело вложения приходит как octet-stream: supertest сам его не разбирает.
const binary = (r: Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  r.on('data', (c: Buffer) => chunks.push(c));
  r.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Meeting files download and cleanup (e2e)', () => {
  let app: INestApplication<App>;
  let filesDir: string;
  let prisma: PrismaService;

  const createUser = async () => {
    const email = `user-${randomUUID()}@example.com`;
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

  const upload = async (
    token: string,
    meetingId: string,
    content: Buffer,
    filename = 'doc.txt',
  ) => {
    const res = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', content, { filename, contentType: 'text/plain' })
      .expect(201);
    return res.body.id as string;
  };

  const downloadLink = (
    token: string | null,
    meetingId: string,
    id: string,
  ) => {
    const req = request(app.getHttpServer()).post(
      `/meetings/${meetingId}/files/${id}/download-link`,
    );
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  // Ссылка, как её получает браузер; открывается без Authorization.
  const getDownloadUrl = async (
    token: string,
    meetingId: string,
    id: string,
  ) => {
    const link = await downloadLink(token, meetingId, id).expect(200);
    return link.body.url as string;
  };

  const storedIds = async (meetingId: string) =>
    readdir(path.join(filesDir, 'meetings', meetingId)).catch(
      () => [] as string[],
    );

  beforeAll(async () => {
    filesDir = await mkdtemp(path.join(tmpdir(), 'meeting-files-dl-'));
    process.env.FILES_DIR = filesDir;
    process.env.MAX_UPLOAD_BYTES = String(200 * MiB);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
    await rm(filesDir, { recursive: true, force: true });
    delete process.env.FILES_DIR;
    delete process.env.MAX_UPLOAD_BYTES;
  });

  describe('скачивание', () => {
    it('отдаёт вложение с оригинальным именем и тем же содержимым', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);
      const content = randomBytes(5000);
      const id = await upload(owner.token, meetingId, content, 'notes.txt');

      const res = await request(app.getHttpServer())
        .get(await getDownloadUrl(owner.token, meetingId, id))
        .buffer(true)
        .parse(binary)
        .expect(200);

      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="notes.txt"',
      );
      expect(res.headers['content-type']).toBe('application/octet-stream');
      expect(res.headers['content-length']).toBe('5000');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect((res.body as Buffer).equals(content)).toBe(true);
    });

    it('кириллическое имя передаётся в filename*', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);
      const id = await upload(
        owner.token,
        meetingId,
        Buffer.from('x'),
        'Запись встречи.txt',
      );

      const res = await request(app.getHttpServer())
        .get(await getDownloadUrl(owner.token, meetingId, id))
        .expect(200);

      expect(res.headers['content-disposition']).toContain(
        `filename*=UTF-8''${encodeURIComponent('Запись встречи.txt')}`,
      );
    });

    it('участник тоже скачивает', async () => {
      const owner = await createUser();
      const participant = await createUser();
      const meetingId = await createMeeting(owner.token, [participant.email]);
      const id = await upload(owner.token, meetingId, Buffer.from('hi'));

      const res = await request(app.getHttpServer())
        .get(await getDownloadUrl(participant.token, meetingId, id))
        .buffer(true)
        .parse(binary)
        .expect(200);

      expect((res.body as Buffer).toString()).toBe('hi');
    });

    it('ссылка выдаётся без токена → 401, постороннему → 404', async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const meetingId = await createMeeting(owner.token);
      const id = await upload(owner.token, meetingId, Buffer.from('x'));

      await downloadLink(null, meetingId, id).expect(401);
      await downloadLink(stranger.token, meetingId, id).expect(404);
    });

    it('несуществующий файл → 404', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);

      await downloadLink(owner.token, meetingId, randomUUID()).expect(404);
    });

    it('файл другой встречи по пути этой встречи → 404', async () => {
      const owner = await createUser();
      const mine = await createMeeting(owner.token);
      const other = await createMeeting(owner.token);
      const id = await upload(owner.token, other, Buffer.from('x'));

      await downloadLink(owner.token, mine, id).expect(404);
    });

    it('запись есть, а данных в хранилище нет → 404', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);
      const id = await upload(owner.token, meetingId, Buffer.from('x'));
      await rm(path.join(filesDir, 'meetings', meetingId, id));

      request(app.getHttpServer())
        .get(await getDownloadUrl(owner.token, meetingId, id))
        .expect(404);
    });

    describe('эндпоинт content', () => {
      it('без токена и с мусорным токеном → 401', async () => {
        const owner = await createUser();
        const meetingId = await createMeeting(owner.token);
        const id = await upload(owner.token, meetingId, Buffer.from('x'));
        const url = `/meetings/${meetingId}/files/${id}/content`;

        await request(app.getHttpServer()).get(url).expect(401);
        await request(app.getHttpServer()).get(`${url}?token=junk`).expect(401);
      });

      it('обычный токен доступа не открывает скачивание', async () => {
        const owner = await createUser();
        const meetingId = await createMeeting(owner.token);
        const id = await upload(owner.token, meetingId, Buffer.from('x'));

        await request(app.getHttpServer())
          .get(`/meetings/${meetingId}/files/${id}/content`)
          .query({ token: owner.token })
          .set('Authorization', `Bearer ${owner.token}`)
          .expect(401);
      });

      it('токен скачивания не открывает остальной API', async () => {
        const owner = await createUser();
        const meetingId = await createMeeting(owner.token);
        const id = await upload(owner.token, meetingId, Buffer.from('x'));
        const link = await downloadLink(owner.token, meetingId, id).expect(200);
        const token = new URL(link.body.url, 'http://x').searchParams.get(
          'token',
        );

        await request(app.getHttpServer())
          .get('/meetings')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
        await request(app.getHttpServer())
          .get(`/meetings/${meetingId}/files`)
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
      });

      it('токен выдан на один файл и не открывает другой', async () => {
        const owner = await createUser();
        const meetingId = await createMeeting(owner.token);
        const a = await upload(owner.token, meetingId, Buffer.from('a'));
        const b = await upload(owner.token, meetingId, Buffer.from('b'));
        const link = await downloadLink(owner.token, meetingId, a).expect(200);
        const token = new URL(link.body.url, 'http://x').searchParams.get(
          'token',
        );

        await request(app.getHttpServer())
          .get(`/meetings/${meetingId}/files/${b}/content`)
          .query({ token })
          .expect(401);
      });

      it('доступ перепроверяется при открытии ссылки', async () => {
        const owner = await createUser();
        const participant = await createUser();
        const meetingId = await createMeeting(owner.token, [participant.email]);
        const id = await upload(owner.token, meetingId, Buffer.from('x'));
        const link = await downloadLink(
          participant.token,
          meetingId,
          id,
        ).expect(200);
        await prisma.meetingParticipant.deleteMany({ where: { meetingId } });

        await request(app.getHttpServer()).get(link.body.url).expect(404);
      });
    });
  });

  describe('сохранность', () => {
    it('файл > 100 МБ скачивается побайтово идентичным', async () => {
      const owner = await createUser();
      const meetingId = await createMeeting(owner.token);
      // 101 МиБ из случайных блоков: повтор блока не даёт совпасть случайно при сдвиге.
      const blocks = Array.from({ length: 101 }, () => randomBytes(MiB));
      const content = Buffer.concat(blocks);
      const expected = createHash('sha256').update(content).digest('hex');
      const id = await upload(owner.token, meetingId, content, 'big.bin');

      const link = await downloadLink(owner.token, meetingId, id).expect(200);
      const { port } = (
        (await app.listen(0).then((s) => s)) as Server
      ).address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}${link.body.url}`);
      expect(res.status).toBe(200);
      const hash = createHash('sha256');
      let size = 0;
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        hash.update(chunk);
        size += chunk.length;
      }

      expect(size).toBe(content.length);
      expect(hash.digest('hex')).toBe(expected);
    }, 120_000);
  });

  describe('удаление встречи', () => {
    it('каскадом удаляет записи, команда очищает хранилище, чужие файлы целы', async () => {
      const owner = await createUser();
      const doomed = await createMeeting(owner.token);
      const kept = await createMeeting(owner.token);
      await upload(owner.token, doomed, Buffer.from('a'));
      await upload(owner.token, doomed, Buffer.from('b'));
      const keptId = await upload(owner.token, kept, Buffer.from('c'));
      expect(await storedIds(doomed)).toHaveLength(2);

      await prisma.meeting.delete({ where: { id: doomed } });
      await app.get(CommandBus).execute(new DeleteMeetingFilesCommand(doomed));

      expect(
        await prisma.meetingFile.count({ where: { meetingId: doomed } }),
      ).toBe(0);
      expect(
        await stat(path.join(filesDir, 'meetings', doomed)).catch(() => null),
      ).toBeNull();
      expect(await storedIds(kept)).toEqual([keptId]);
      expect(
        await prisma.meetingFile.count({ where: { meetingId: kept } }),
      ).toBe(1);
    });

    it('очистка встречи без файлов не падает', async () => {
      await expect(
        app
          .get(CommandBus)
          .execute(new DeleteMeetingFilesCommand(randomUUID())),
      ).resolves.toBeUndefined();
    });
  });
});
