import { Readable } from 'node:stream';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  StorageObjectNotFoundError,
  type FileStorage,
} from '../storage/file-storage.js';
import { TranscriptionError } from './transcription.error.js';
import { TranscriptionService } from './transcription.service.js';
import type { AudioExtractor } from './audio-extractor.js';
import type { WhisperRunner } from './whisper.runner.js';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('TranscriptionService', () => {
  const findUnique = vi.fn();
  const updateMany = vi.fn();
  const findMany = vi.fn();
  const read = vi.fn();
  const transcribe = vi.fn();
  const extract = vi.fn();
  let concurrency: string | undefined;
  let recovery: string | undefined;

  const build = () =>
    new TranscriptionService(
      {
        meetingFile: { findUnique },
        fileTranscription: { updateMany, findMany },
      } as unknown as PrismaService,
      { transcribe } as unknown as WhisperRunner,
      { extract } as unknown as AudioExtractor,
      {
        get: (key: string) =>
          key === 'TRANSCRIPTION_CONCURRENCY' ? concurrency : recovery,
      } as unknown as ConfigService,
      { read } as unknown as FileStorage,
    );

  const statuses = () =>
    updateMany.mock.calls.map(([arg]) => arg.data.status as string);

  beforeEach(() => {
    vi.resetAllMocks();
    concurrency = undefined;
    recovery = undefined;
    findUnique.mockResolvedValue({
      storageKey: 'meetings/m1/f1',
      originalName: 'rec.mp3',
    });
    updateMany.mockResolvedValue({ count: 1 });
    read.mockImplementation(() => Promise.resolve(Readable.from(['audio'])));
    transcribe.mockResolvedValue('привет мир');
    extract.mockResolvedValue(undefined);
  });

  it('mp3 передаётся в Whisper напрямую, без извлечения звука', async () => {
    build().enqueue('f1');
    await vi.waitFor(() => expect(transcribe).toHaveBeenCalled());

    expect(extract).not.toHaveBeenCalled();
  });

  it('mp4: звук извлекается в wav, и Whisper получает именно его', async () => {
    findUnique.mockResolvedValue({
      storageKey: 'meetings/m1/f1',
      originalName: 'встреча.mp4',
    });

    build().enqueue('f1');
    await vi.waitFor(() => expect(statuses()).toContain('DONE'));

    const [input, output] = extract.mock.calls[0];
    expect(input).toMatch(/input\.mp4$/);
    expect(output).toMatch(/audio\.wav$/);
    expect(transcribe.mock.calls[0][0]).toBe(output);
  });

  it.each([
    'В файле нет звуковой дорожки',
    'Файл повреждён или не удалось прочитать его содержимое',
    'Не удалось извлечь звук из файла',
  ])(
    'mp4: ошибка извлечения «%s» → ERROR, Whisper не запускается',
    async (message) => {
      findUnique.mockResolvedValue({
        storageKey: 'meetings/m1/f1',
        originalName: 'a.mp4',
      });
      extract.mockRejectedValue(new TranscriptionError(message));

      build().enqueue('f1');
      await vi.waitFor(() => expect(statuses()).toContain('ERROR'));

      expect(updateMany).toHaveBeenLastCalledWith({
        where: { fileId: 'f1' },
        data: { status: 'ERROR', error: message },
      });
      expect(transcribe).not.toHaveBeenCalled();
    },
  );

  it('прогресс Whisper сохраняется растущим и не доходит до 100 до завершения', async () => {
    transcribe.mockImplementation(
      async (_path: string, onProgress: (p: number) => void) => {
        onProgress(10);
        onProgress(55.4);
        onProgress(100);
        return 'текст';
      },
    );

    build().enqueue('f1');
    await vi.waitFor(() => expect(statuses()).toContain('DONE'));

    const progressWrites = updateMany.mock.calls
      .map(([arg]) => arg)
      .filter((arg) => arg.where.progress)
      .map((arg) => arg.data.progress);
    expect(progressWrites).toEqual([10, 55, 99]);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fileId: 'f1', status: 'IN_PROGRESS', progress: { lt: 55 } },
      }),
    );
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { fileId: 'f1' },
      data: { status: 'DONE', progress: 100, text: 'текст', error: null },
    });
  });

  it('сбой записи прогресса не роняет расшифровку', async () => {
    updateMany.mockImplementation(({ where }) =>
      where.progress
        ? Promise.reject(new Error('db hiccup'))
        : Promise.resolve({ count: 1 }),
    );
    transcribe.mockImplementation(
      async (_path: string, onProgress: (p: number) => void) => {
        onProgress(30);
        return 'ok';
      },
    );

    build().enqueue('f1');
    await vi.waitFor(() => expect(statuses()).toContain('DONE'));
  });

  it('QUEUED → IN_PROGRESS → DONE: сохраняет текст и 100%', async () => {
    build().enqueue('f1');
    await settle();

    expect(statuses()).toEqual(['IN_PROGRESS', 'DONE']);
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { fileId: 'f1' },
      data: { status: 'DONE', progress: 100, text: 'привет мир', error: null },
    });
    expect(transcribe.mock.calls[0][0]).toMatch(/input\.mp3$/);
  });

  it('enqueue не ждёт расшифровки', async () => {
    transcribe.mockReturnValue(new Promise(() => undefined));

    expect(build().enqueue('f1')).toBeUndefined();
    // Фоновая задача должна дойти до Whisper внутри теста, иначе она заденет моки следующего.
    await vi.waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
  });

  it('сбой Whisper → ERROR с сообщением, очередь продолжает работу', async () => {
    transcribe
      .mockRejectedValueOnce(new TranscriptionError('Whisper упал'))
      .mockResolvedValueOnce('ok');
    const service = build();

    service.enqueue('f1');
    service.enqueue('f2');

    await vi.waitFor(() =>
      expect(updateMany).toHaveBeenCalledWith({
        where: { fileId: 'f2' },
        data: { status: 'DONE', progress: 100, text: 'ok', error: null },
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { fileId: 'f1' },
      data: { status: 'ERROR', error: 'Whisper упал' },
    });
  });

  it('неожиданная ошибка не раскрывает детали пользователю', async () => {
    transcribe.mockRejectedValue(new Error('secret /internal/path'));

    build().enqueue('f1');
    await settle();

    expect(updateMany).toHaveBeenLastCalledWith({
      where: { fileId: 'f1' },
      data: { status: 'ERROR', error: 'Не удалось выполнить транскрибацию' },
    });
  });

  it('файл удалён → задача пропускается без ошибки', async () => {
    findUnique.mockResolvedValue(null);

    build().enqueue('f1');
    await settle();

    expect(updateMany).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('запись транскрибации исчезла → Whisper не запускается', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    build().enqueue('f1');
    await settle();

    expect(transcribe).not.toHaveBeenCalled();
  });

  it('выполняет не больше заданного числа задач одновременно', async () => {
    concurrency = '2';
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    let active = 0;
    let maxActive = 0;
    transcribe.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        return await gates[transcribe.mock.calls.length - 1].promise;
      } finally {
        active--;
      }
    });
    const service = build();

    service.enqueue('f1');
    service.enqueue('f2');
    service.enqueue('f3');
    await settle();
    expect(transcribe).toHaveBeenCalledTimes(2);

    gates[0].resolve('a');
    await settle();
    expect(transcribe).toHaveBeenCalledTimes(3);

    gates[1].resolve('b');
    gates[2].resolve('c');
    await settle();
    expect(maxActive).toBe(2);
  });

  it('по умолчанию задачи идут строго по очереди', async () => {
    const gate = deferred<string>();
    transcribe.mockReturnValueOnce(gate.promise).mockResolvedValue('b');
    const service = build();

    service.enqueue('f1');
    service.enqueue('f2');
    await settle();
    expect(transcribe).toHaveBeenCalledTimes(1);

    gate.resolve('a');
    await settle();
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it('повторная постановка того же файла в очередь игнорируется', async () => {
    const gate = deferred<string>();
    transcribe.mockReturnValue(gate.promise);
    const service = build();

    service.enqueue('f1');
    service.enqueue('f1');
    service.enqueue('f1');
    await vi.waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
    gate.resolve('ok');
    await vi.waitFor(() => expect(statuses()).toContain('DONE'));

    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it('после завершения файл можно поставить в очередь снова (повтор)', async () => {
    const service = build();

    service.enqueue('f1');
    await vi.waitFor(() => expect(statuses()).toContain('DONE'));
    service.enqueue('f1');
    await vi.waitFor(() => expect(transcribe).toHaveBeenCalledTimes(2));
  });

  it('в работу берётся только задача в статусе QUEUED', async () => {
    updateMany.mockResolvedValue({ count: 0 }); // уже DONE/ERROR или удалена

    build().enqueue('f1');
    await settle();

    expect(updateMany.mock.calls[0][0].where).toEqual({
      fileId: 'f1',
      status: 'QUEUED',
    });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('файл пропал из хранилища → ERROR «Файл недоступен», очередь жива', async () => {
    read
      .mockRejectedValueOnce(new StorageObjectNotFoundError('meetings/m1/f1'))
      .mockImplementation(() => Promise.resolve(Readable.from(['audio'])));
    const service = build();

    service.enqueue('f1');
    service.enqueue('f2');
    await vi.waitFor(() =>
      expect(updateMany).toHaveBeenCalledWith({
        where: { fileId: 'f2' },
        data: {
          status: 'DONE',
          progress: 100,
          text: 'привет мир',
          error: null,
        },
      }),
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { fileId: 'f1' },
      data: { status: 'ERROR', error: 'Файл недоступен в хранилище' },
    });
  });

  describe('recover (после рестарта)', () => {
    it('возвращает «В процессе» в очередь и ставит все QUEUED по порядку создания', async () => {
      findMany.mockResolvedValue([{ fileId: 'f1' }, { fileId: 'f2' }]);
      const order: string[] = [];
      findUnique.mockImplementation(({ where }) => {
        order.push(where.id);
        return Promise.resolve({
          storageKey: `meetings/m1/${where.id}`,
          originalName: 'rec.mp3',
        });
      });

      const count = await build().recover();

      expect(updateMany.mock.calls[0][0]).toEqual({
        where: { status: 'IN_PROGRESS' },
        data: { status: 'QUEUED', progress: 0 },
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'QUEUED' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      );
      expect(count).toBe(2);
      await vi.waitFor(() => expect(order).toEqual(['f1', 'f2']));
    });

    it('при старте приложения восстановление выполняется', async () => {
      findMany.mockResolvedValue([]);

      await build().onApplicationBootstrap();

      expect(findMany).toHaveBeenCalledTimes(1);
    });

    it('TRANSCRIPTION_RECOVERY=off отключает восстановление', async () => {
      recovery = 'off';

      await build().onApplicationBootstrap();

      expect(updateMany).not.toHaveBeenCalled();
      expect(findMany).not.toHaveBeenCalled();
    });

    it('сбой БД при восстановлении не роняет запуск', async () => {
      updateMany.mockRejectedValue(new Error('db down'));

      await expect(build().onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });
});
