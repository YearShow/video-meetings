import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { MeetingAccessService } from '../../meeting-access.service.js';
import { GetMeetingFilesHandler } from './get-meeting-files.handler.js';
import { GetMeetingFilesQuery } from './get-meeting-files.query.js';

const record = (id: string) => ({
  id,
  meetingId: 'm1',
  uploadedById: 'u1',
  originalName: `${id}.txt`,
  mimeType: 'text/plain',
  sizeBytes: 3,
  storageKey: `meetings/m1/${id}`,
  status: 'UPLOADED',
  createdAt: new Date('2030-01-01T00:00:00Z'),
  uploadedBy: { id: 'u1', email: 'u1@example.com' },
  transcription: null as null | Record<string, unknown>,
});

describe('GetMeetingFilesHandler', () => {
  const hasAccess = vi.fn();
  const findMany = vi.fn();
  const handler = new GetMeetingFilesHandler(
    { meetingFile: { findMany } } as unknown as PrismaService,
    { hasAccess } as unknown as MeetingAccessService,
  );
  const query = new GetMeetingFilesQuery('u1', 'm1');

  beforeEach(() => {
    vi.resetAllMocks();
    hasAccess.mockResolvedValue(true);
  });

  it('возвращает файлы только запрошенной встречи, новые сверху', async () => {
    findMany.mockResolvedValue([record('f2'), record('f1')]);

    const result = await handler.execute(query);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { meetingId: 'm1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(result.map((f) => f.id)).toEqual(['f2', 'f1']);
  });

  it('отдаёт метаданные без внутренних полей', async () => {
    findMany.mockResolvedValue([record('f1')]);

    const [file] = await handler.execute(query);

    expect(file).toEqual({
      id: 'f1',
      name: 'f1.txt',
      mimeType: 'text/plain',
      size: 3,
      status: 'UPLOADED',
      createdAt: new Date('2030-01-01T00:00:00Z'),
      uploadedBy: { id: 'u1', email: 'u1@example.com' },
      transcription: null,
    });
    expect(file).not.toHaveProperty('storageKey');
    expect(file).not.toHaveProperty('meetingId');
  });

  it('отдаёт статус, прогресс и текст транскрибации', async () => {
    findMany.mockResolvedValue([
      {
        ...record('f1'),
        transcription: {
          status: 'DONE',
          progress: 100,
          text: 'привет',
          error: null,
          id: 'internal',
          fileId: 'f1',
        },
      },
    ]);

    const [file] = await handler.execute(query);

    expect(file.transcription).toEqual({
      status: 'DONE',
      progress: 100,
      text: 'привет',
      error: null,
    });
  });

  it('пустая встреча → пустой список', async () => {
    findMany.mockResolvedValue([]);

    await expect(handler.execute(query)).resolves.toEqual([]);
  });

  it('без доступа → 404 и запроса файлов нет', async () => {
    hasAccess.mockResolvedValue(false);

    await expect(handler.execute(query)).rejects.toThrow(NotFoundException);
    expect(findMany).not.toHaveBeenCalled();
  });
});
