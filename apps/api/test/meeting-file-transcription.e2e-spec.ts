import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { TranscriptionService } from './../src/transcription/transcription.service.js';

const PASSWORD = 'correct-horse-battery';

describe('Meeting file transcription (e2e)', () => {
  let app: INestApplication<App>;
  let workDir: string;
  // Путь вычисляется при первом обращении, когда workDir уже создан.
  const failFlag = () => path.join(workDir, 'whisper-fail');

  const createUserWithEmail = async () => {
    const email = `user-${randomUUID()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    return { token: reg.body.accessToken as string, email };
  };
  const createUser = async () => (await createUserWithEmail()).token;

  const createMeeting = async (token: string, participants: string[] = []) => {
    const res = await request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Sync',
        date: '2030-01-15T10:00:00.000Z',
        participants,
      })
      .expect(201);
    return res.body.id as string;
  };

  const upload = (
    token: string,
    meetingId: string,
    filename: string,
    contentType: string,
    content = 'audio',
  ) =>
    request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(content), { filename, contentType });

  const listFiles = (token: string, meetingId: string) =>
    request(app.getHttpServer())
      .get(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`);

  const transcriptionOf = async (
    token: string,
    meetingId: string,
    fileId: string,
  ) => {
    const res = await listFiles(token, meetingId).expect(200);
    return (res.body as { id: string; transcription: unknown }[]).find(
      (f) => f.id === fileId,
    )?.transcription;
  };

  beforeAll(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'transcription-e2e-'));
    // Подставной whisper: не требует модели и бинарника в окружении тестов.
    // Пока существует файл-флаг, whisper «падает» — так проверяется повтор после ошибки.
    const bin = path.join(workDir, 'fake-whisper');
    await writeFile(
      bin,
      `#!/bin/sh
sleep 0.3
if [ -e "${failFlag()}" ]; then
  echo "boom" >&2
  exit 2
fi
echo "привет из записи"
`,
    );
    await chmod(bin, 0o755);

    // Подставной ffmpeg: «извлекает» звук копированием, а файл с маркером noaudio
    // имитирует видео без звуковой дорожки.
    const ffmpeg = path.join(workDir, 'fake-ffmpeg');
    await writeFile(
      ffmpeg,
      `#!/bin/sh
for last; do :; done
while [ $# -gt 0 ]; do [ "$1" = "-i" ] && input="$2"; shift; done
if grep -q noaudio "$input"; then
  echo "Stream map '0:a:0' matches no streams." >&2
  exit 1
fi
cp "$input" "$last"
`,
    );
    await chmod(ffmpeg, 0o755);

    process.env.FILES_DIR = path.join(workDir, 'files');
    process.env.FFMPEG_BIN = ffmpeg;
    process.env.WHISPER_BIN = bin;
    process.env.WHISPER_MODEL_PATH = '/models/ggml-base.bin';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await rm(workDir, { recursive: true, force: true });
    delete process.env.FILES_DIR;
    delete process.env.FFMPEG_BIN;
    delete process.env.WHISPER_BIN;
    delete process.env.WHISPER_MODEL_PATH;
  });

  it('mp3: ответ загрузки сразу со статусом QUEUED, затем DONE с текстом', async () => {
    const token = await createUser();
    const meetingId = await createMeeting(token);

    const res = await upload(
      token,
      meetingId,
      'запись.mp3',
      'audio/mpeg',
    ).expect(201);
    expect(res.body.transcription).toEqual({
      status: 'QUEUED',
      progress: 0,
      text: null,
      error: null,
    });

    await vi.waitFor(
      async () =>
        expect(await transcriptionOf(token, meetingId, res.body.id)).toEqual({
          status: 'DONE',
          progress: 100,
          text: 'привет из записи',
          error: null,
        }),
      { timeout: 10_000, interval: 100 },
    );
  });

  it('mp4: расшифровывается звуковая дорожка, как у mp3', async () => {
    const token = await createUser();
    const meetingId = await createMeeting(token);

    const res = await upload(
      token,
      meetingId,
      'встреча.mp4',
      'video/mp4',
    ).expect(201);
    expect(res.body.transcription.status).toBe('QUEUED');

    await vi.waitFor(
      async () =>
        expect(await transcriptionOf(token, meetingId, res.body.id)).toEqual({
          status: 'DONE',
          progress: 100,
          text: 'привет из записи',
          error: null,
        }),
      { timeout: 10_000, interval: 100 },
    );
  });

  it('mp4 без звуковой дорожки → ERROR с понятной причиной', async () => {
    const token = await createUser();
    const meetingId = await createMeeting(token);

    const res = await upload(
      token,
      meetingId,
      'silent.mp4',
      'video/mp4',
      'noaudio',
    ).expect(201);

    await vi.waitFor(
      async () =>
        expect(await transcriptionOf(token, meetingId, res.body.id)).toEqual({
          status: 'ERROR',
          progress: 0,
          text: null,
          error: 'В файле нет звуковой дорожки',
        }),
      { timeout: 10_000, interval: 100 },
    );
  });

  const waitForStatus = (
    token: string,
    meetingId: string,
    fileId: string,
    status: string,
  ) =>
    vi.waitFor(
      async () =>
        expect(
          (await transcriptionOf(token, meetingId, fileId)) as {
            status: string;
          },
        ).toMatchObject({ status }),
      { timeout: 10_000, interval: 100 },
    );

  const retry = (token: string, meetingId: string, fileId: string) =>
    request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files/${fileId}/transcription/retry`)
      .set('Authorization', `Bearer ${token}`);

  describe('повторный запуск', () => {
    it('ERROR → QUEUED → DONE на исправном файле', async () => {
      const token = await createUser();
      const meetingId = await createMeeting(token);
      await writeFile(failFlag(), '');
      let fileId: string;
      try {
        const res = await upload(
          token,
          meetingId,
          'a.mp3',
          'audio/mpeg',
        ).expect(201);
        fileId = res.body.id;
        await waitForStatus(token, meetingId, fileId, 'ERROR');
        expect(await transcriptionOf(token, meetingId, fileId)).toMatchObject({
          error: 'Whisper завершился с ошибкой',
        });
      } finally {
        await unlink(failFlag());
      }

      const res = await retry(token, meetingId, fileId).expect(200);
      expect(res.body.id).toBe(fileId);
      expect(res.body.transcription).toEqual({
        status: 'QUEUED',
        progress: 0,
        text: null,
        error: null,
      });

      await waitForStatus(token, meetingId, fileId, 'DONE');
      expect(await transcriptionOf(token, meetingId, fileId)).toMatchObject({
        text: 'привет из записи',
        error: null,
      });
    });

    it('если файл не в статусе ERROR → 409', async () => {
      const token = await createUser();
      const meetingId = await createMeeting(token);
      const res = await upload(token, meetingId, 'a.mp3', 'audio/mpeg').expect(
        201,
      );
      await waitForStatus(token, meetingId, res.body.id, 'DONE');

      await retry(token, meetingId, res.body.id).expect(409);
    });

    it('файл без транскрибации (не mp3/mp4) → 404', async () => {
      const token = await createUser();
      const meetingId = await createMeeting(token);
      const res = await upload(token, meetingId, 'n.txt', 'text/plain').expect(
        201,
      );

      await retry(token, meetingId, res.body.id).expect(404);
    });

    it('без токена → 401', async () => {
      await request(app.getHttpServer())
        .post(
          `/meetings/${randomUUID()}/files/${randomUUID()}/transcription/retry`,
        )
        .expect(401);
    });
  });

  describe('права доступа', () => {
    it('участник видит статус и текст и может повторить; посторонний — нет (404)', async () => {
      const owner = await createUserWithEmail();
      const participant = await createUserWithEmail();
      const stranger = await createUserWithEmail();
      const meetingId = await createMeeting(owner.token, [participant.email]);
      await writeFile(failFlag(), '');
      let fileId: string;
      try {
        const res = await upload(
          owner.token,
          meetingId,
          'a.mp3',
          'audio/mpeg',
        ).expect(201);
        fileId = res.body.id;
        await waitForStatus(participant.token, meetingId, fileId, 'ERROR');
      } finally {
        await unlink(failFlag());
      }

      // Посторонний не видит ни список, ни не может запустить повтор.
      await listFiles(stranger.token, meetingId).expect(404);
      await retry(stranger.token, meetingId, fileId).expect(404);
      expect(
        await transcriptionOf(participant.token, meetingId, fileId),
      ).toMatchObject({ status: 'ERROR' });

      await retry(participant.token, meetingId, fileId).expect(200);
      await waitForStatus(owner.token, meetingId, fileId, 'DONE');
      expect(
        await transcriptionOf(participant.token, meetingId, fileId),
      ).toMatchObject({ text: 'привет из записи' });
    });

    it('файл другой встречи по своей встрече не повторить → 404', async () => {
      const a = await createUser();
      const b = await createUser();
      const meetingA = await createMeeting(a);
      const meetingB = await createMeeting(b);
      const res = await upload(a, meetingA, 'a.mp3', 'audio/mpeg').expect(201);
      await waitForStatus(a, meetingA, res.body.id, 'DONE');

      await retry(b, meetingB, res.body.id).expect(404);
    });
  });

  describe('устойчивость', () => {
    it('после рестарта прерванные задачи возвращаются в очередь и доходят до DONE', async () => {
      const token = await createUser();
      const meetingId = await createMeeting(token);
      const res = await upload(token, meetingId, 'a.mp3', 'audio/mpeg').expect(
        201,
      );
      await waitForStatus(token, meetingId, res.body.id, 'DONE');

      // Имитация падения процесса посреди расшифровки.
      await app.get(PrismaService).fileTranscription.update({
        where: { fileId: res.body.id },
        data: { status: 'IN_PROGRESS', progress: 40, text: null },
      });
      await app.get(TranscriptionService, { strict: false }).recover();

      await waitForStatus(token, meetingId, res.body.id, 'DONE');
      expect(
        await transcriptionOf(token, meetingId, res.body.id),
      ).toMatchObject({ progress: 100, text: 'привет из записи' });
    });

    it('файл удалён из хранилища → ERROR, очередь продолжает работу', async () => {
      const token = await createUser();
      const meetingId = await createMeeting(token);
      const first = await upload(
        token,
        meetingId,
        'a.mp3',
        'audio/mpeg',
      ).expect(201);
      await waitForStatus(token, meetingId, first.body.id, 'DONE');
      await rm(
        path.join(workDir, 'files', 'meetings', meetingId, first.body.id),
      );
      await app.get(PrismaService).fileTranscription.update({
        where: { fileId: first.body.id },
        data: { status: 'QUEUED', progress: 0, text: null },
      });
      await app.get(TranscriptionService, { strict: false }).recover();

      await waitForStatus(token, meetingId, first.body.id, 'ERROR');
      expect(
        await transcriptionOf(token, meetingId, first.body.id),
      ).toMatchObject({ error: 'Файл недоступен в хранилище' });

      const second = await upload(
        token,
        meetingId,
        'b.mp3',
        'audio/mpeg',
      ).expect(201);
      await waitForStatus(token, meetingId, second.body.id, 'DONE');
    });
  });

  it('файлы не mp3 не получают транскрибацию', async () => {
    const token = await createUser();
    const meetingId = await createMeeting(token);

    const res = await upload(
      token,
      meetingId,
      'notes.txt',
      'text/plain',
    ).expect(201);

    expect(res.body.transcription).toBeNull();
    expect(await transcriptionOf(token, meetingId, res.body.id)).toBeNull();
  });

  it('статус и текст видны только тем, у кого есть доступ к встрече', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const meetingId = await createMeeting(owner);
    await upload(owner, meetingId, 'a.mp3', 'audio/mpeg').expect(201);

    await listFiles(stranger, meetingId).expect(404);
  });
});
