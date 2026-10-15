import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { MeetingAccessService } from '../meeting-access.service.js';
import { MeetingFilesService } from './meeting-files.service.js';

describe('MeetingFilesService.getAccessible', () => {
  const hasAccess = vi.fn();
  const findFirst = vi.fn();
  const service = new MeetingFilesService(
    { meetingFile: { findFirst } } as unknown as PrismaService,
    { hasAccess } as unknown as MeetingAccessService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    hasAccess.mockResolvedValue(true);
  });

  it('возвращает файл, ища его внутри встречи из пути', async () => {
    findFirst.mockResolvedValue({ id: 'f1' });

    await expect(service.getAccessible('u1', 'm1', 'f1')).resolves.toEqual({
      id: 'f1',
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'f1', meetingId: 'm1' },
    });
  });

  it('нет доступа к встрече → 404 без запроса файла', async () => {
    hasAccess.mockResolvedValue(false);

    await expect(service.getAccessible('u1', 'm1', 'f1')).rejects.toThrow(
      NotFoundException,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('файла нет во встрече → 404', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.getAccessible('u1', 'm1', 'f1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
