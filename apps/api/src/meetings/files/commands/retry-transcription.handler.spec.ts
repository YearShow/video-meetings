import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { TranscriptionService } from '../../../transcription/transcription.service.js';
import type { MeetingFilesService } from '../meeting-files.service.js';
import { RetryTranscriptionCommand } from './retry-transcription.command.js';
import { RetryTranscriptionHandler } from './retry-transcription.handler.js';

describe('RetryTranscriptionHandler', () => {
  const getAccessible = vi.fn();
  const updateMany = vi.fn();
  const findUnique = vi.fn();
  const findUniqueOrThrow = vi.fn();
  const enqueue = vi.fn();
  const handler = new RetryTranscriptionHandler(
    {
      fileTranscription: { updateMany, findUnique },
      meetingFile: { findUniqueOrThrow },
    } as unknown as PrismaService,
    { getAccessible } as unknown as MeetingFilesService,
    { enqueue } as unknown as TranscriptionService,
  );
  const command = new RetryTranscriptionCommand('u1', 'm1', 'f1');

  beforeEach(() => {
    vi.resetAllMocks();
    getAccessible.mockResolvedValue({ id: 'f1', meetingId: 'm1' });
    updateMany.mockResolvedValue({ count: 1 });
    findUniqueOrThrow.mockResolvedValue({
      id: 'f1',
      originalName: 'a.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 5,
      status: 'UPLOADED',
      createdAt: new Date('2030-01-01T00:00:00Z'),
      uploadedBy: { id: 'u1', email: 'u1@example.com' },
      transcription: { status: 'QUEUED', progress: 0, text: null, error: null },
    });
  });

  it('ERROR → QUEUED: сбрасывает состояние, ставит в очередь, возвращает файл', async () => {
    const view = await handler.execute(command);

    expect(updateMany).toHaveBeenCalledWith({
      where: { fileId: 'f1', status: 'ERROR' },
      data: { status: 'QUEUED', progress: 0, text: null, error: null },
    });
    expect(enqueue).toHaveBeenCalledWith('f1');
    expect(view.transcription).toEqual({
      status: 'QUEUED',
      progress: 0,
      text: null,
      error: null,
    });
  });

  it('нет доступа к встрече или файлу → 404, ничего не меняется', async () => {
    getAccessible.mockRejectedValue(new NotFoundException());

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(updateMany).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('файл без транскрибации (не mp3/mp4) → 404', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue(null);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('статус не ERROR (в очереди, в процессе, готово) → 409', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue({ id: 't1' });

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
