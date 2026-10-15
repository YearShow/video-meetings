import { NotFoundException } from '@nestjs/common';
import type { DownloadTokenService } from '../download-token.service.js';
import type { MeetingFilesService } from '../meeting-files.service.js';
import { CreateDownloadLinkHandler } from './create-download-link.handler.js';
import { CreateDownloadLinkQuery } from './create-download-link.query.js';

describe('CreateDownloadLinkHandler', () => {
  const getAccessible = vi.fn();
  const sign = vi.fn();
  const handler = new CreateDownloadLinkHandler(
    { getAccessible } as unknown as MeetingFilesService,
    { sign } as unknown as DownloadTokenService,
  );
  const query = new CreateDownloadLinkQuery('u1', 'm1', 'f1');

  beforeEach(() => vi.resetAllMocks());

  it('возвращает ссылку на content с токеном', async () => {
    getAccessible.mockResolvedValue({ id: 'f1', meetingId: 'm1' });
    sign.mockResolvedValue('a.b+c');

    await expect(handler.execute(query)).resolves.toEqual({
      url: '/meetings/m1/files/f1/content?token=a.b%2Bc',
    });
    expect(sign).toHaveBeenCalledWith('u1', 'f1');
  });

  it('нет доступа → 404 и токен не подписывается', async () => {
    getAccessible.mockRejectedValue(new NotFoundException());

    await expect(handler.execute(query)).rejects.toThrow(NotFoundException);
    expect(sign).not.toHaveBeenCalled();
  });
});
