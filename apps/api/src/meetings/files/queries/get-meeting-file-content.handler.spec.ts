import { NotFoundException } from '@nestjs/common';
import { Readable } from 'node:stream';
import {
  StorageObjectNotFoundError,
  type FileStorage,
} from '../../../storage/file-storage.js';
import type { MeetingFilesService } from '../meeting-files.service.js';
import { GetMeetingFileContentHandler } from './get-meeting-file-content.handler.js';
import { GetMeetingFileContentQuery } from './get-meeting-file-content.query.js';

describe('GetMeetingFileContentHandler', () => {
  const getAccessible = vi.fn();
  const read = vi.fn();
  const handler = new GetMeetingFileContentHandler(
    { getAccessible } as unknown as MeetingFilesService,
    { read } as unknown as FileStorage,
  );
  const query = new GetMeetingFileContentQuery('u1', 'm1', 'f1');

  beforeEach(() => {
    vi.resetAllMocks();
    getAccessible.mockResolvedValue({
      id: 'f1',
      originalName: 'Запись.mp4',
      sizeBytes: 3,
      storageKey: 'meetings/m1/f1',
    });
  });

  it('отдаёт оригинальное имя, размер и поток из хранилища', async () => {
    const stream = Readable.from([Buffer.from('abc')]);
    read.mockResolvedValue(stream);

    const result = await handler.execute(query);

    expect(read).toHaveBeenCalledWith('meetings/m1/f1');
    expect(result).toEqual({ name: 'Запись.mp4', size: 3, content: stream });
    expect(getAccessible).toHaveBeenCalledWith('u1', 'm1', 'f1');
  });

  it('нет доступа → ошибка сервиса, хранилище не читается', async () => {
    getAccessible.mockRejectedValue(new NotFoundException());

    await expect(handler.execute(query)).rejects.toThrow(NotFoundException);
    expect(read).not.toHaveBeenCalled();
  });

  it('запись есть, данных в хранилище нет → 404', async () => {
    read.mockRejectedValue(new StorageObjectNotFoundError('meetings/m1/f1'));

    await expect(handler.execute(query)).rejects.toThrow(NotFoundException);
  });

  it('прочие ошибки хранилища не маскируются под 404', async () => {
    read.mockRejectedValue(new Error('EIO'));

    await expect(handler.execute(query)).rejects.toThrow('EIO');
  });
});
