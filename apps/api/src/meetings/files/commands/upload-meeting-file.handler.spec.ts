import { NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import {
  FileTooLargeError,
  type FileStorage,
} from '../../../storage/file-storage.js';
import type { TranscriptionService } from '../../../transcription/transcription.service.js';
import type { MeetingAccessService } from '../../meeting-access.service.js';
import { UploadMeetingFileCommand } from './upload-meeting-file.command.js';
import { UploadMeetingFileHandler } from './upload-meeting-file.handler.js';

describe('UploadMeetingFileHandler', () => {
  const hasAccess = vi.fn();
  const create = vi.fn();
  const save = vi.fn();
  const del = vi.fn();
  const enqueue = vi.fn();
  const handler = new UploadMeetingFileHandler(
    { meetingFile: { create } } as unknown as PrismaService,
    { hasAccess } as unknown as MeetingAccessService,
    { get: () => '1000' } as unknown as ConfigService,
    { save, delete: del } as unknown as FileStorage,
    { enqueue } as unknown as TranscriptionService,
  );

  const content = () => Readable.from([Buffer.from('data')]);
  const command = (stream = content(), name = 'doc.pdf') =>
    new UploadMeetingFileCommand('u1', 'm1', name, 'application/pdf', stream);

  beforeEach(() => {
    vi.resetAllMocks();
    hasAccess.mockResolvedValue(true);
    save.mockResolvedValue({ size: 4 });
    del.mockResolvedValue(undefined);
    create.mockImplementation(({ data }) =>
      Promise.resolve({
        ...data,
        status: 'UPLOADED',
        createdAt: new Date('2030-01-01T00:00:00Z'),
        uploadedBy: { id: 'u1', email: 'u1@example.com' },
        transcription: data.transcription
          ? { status: 'QUEUED', progress: 0, text: null, error: null }
          : null,
      }),
    );
  });

  it('сохраняет файл под серверным ключом и создаёт запись', async () => {
    const view = await handler.execute(command());

    const [key, , options] = save.mock.calls[0];
    expect(key).toMatch(/^meetings\/m1\/[0-9a-f-]{36}$/);
    expect(options).toEqual({ maxBytes: 1000 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: key.split('/')[2],
          meetingId: 'm1',
          uploadedById: 'u1',
          originalName: 'doc.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 4,
          storageKey: key,
        }),
      }),
    );
    expect(view).toEqual({
      id: key.split('/')[2],
      name: 'doc.pdf',
      mimeType: 'application/pdf',
      size: 4,
      status: 'UPLOADED',
      createdAt: new Date('2030-01-01T00:00:00Z'),
      uploadedBy: { id: 'u1', email: 'u1@example.com' },
      transcription: null,
    });
  });

  it('для mp3 создаёт транскрибацию и ставит файл в очередь, не дожидаясь её', async () => {
    const view = await handler.execute(
      new UploadMeetingFileCommand(
        'u1',
        'm1',
        'Запись.MP3',
        'audio/mpeg',
        content(),
      ),
    );

    expect(create.mock.calls[0][0].data.transcription).toEqual({ create: {} });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(view.id);
    expect(view.transcription).toEqual({
      status: 'QUEUED',
      progress: 0,
      text: null,
      error: null,
    });
  });

  it('для файлов других форматов транскрибацию не создаёт', async () => {
    const view = await handler.execute(command());

    expect(create.mock.calls[0][0].data.transcription).toBeUndefined();
    expect(enqueue).not.toHaveBeenCalled();
    expect(view.transcription).toBeNull();
  });

  it('не ставит в очередь, если запись в БД не создалась', async () => {
    create.mockRejectedValue(new Error('db down'));

    await expect(
      handler.execute(
        new UploadMeetingFileCommand(
          'u1',
          'm1',
          'a.mp3',
          'audio/mpeg',
          content(),
        ),
      ),
    ).rejects.toThrow('db down');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('не использует имя от пользователя в ключе хранилища', async () => {
    await handler.execute(command(content(), '../../evil.sh'));

    expect(save.mock.calls[0][0]).not.toContain('evil');
    expect(create.mock.calls[0][0].data.originalName).toBe('evil.sh');
  });

  it('превышение лимита → 413 и записи в БД нет', async () => {
    save.mockRejectedValue(new FileTooLargeError(1000));

    await expect(handler.execute(command())).rejects.toThrow(
      PayloadTooLargeException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('обрыв при записи пробрасывается, записи в БД нет', async () => {
    save.mockRejectedValue(new Error('premature close'));

    await expect(handler.execute(command())).rejects.toThrow('premature close');
    expect(create).not.toHaveBeenCalled();
  });

  it('ошибка БД удаляет уже записанный файл', async () => {
    create.mockRejectedValue(new Error('db down'));

    await expect(handler.execute(command())).rejects.toThrow('db down');
    expect(del).toHaveBeenCalledWith(save.mock.calls[0][0]);
  });

  it('ошибка очистки файла не подменяет исходную ошибку БД', async () => {
    create.mockRejectedValue(new Error('db down'));
    del.mockRejectedValue(new Error('EACCES'));

    await expect(handler.execute(command())).rejects.toThrow('db down');
  });

  it('без доступа к встрече → 404, поток закрыт, в хранилище не пишет', async () => {
    hasAccess.mockResolvedValue(false);
    const stream = content();

    await expect(handler.execute(command(stream))).rejects.toThrow(
      NotFoundException,
    );
    expect(stream.destroyed).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
