import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { DownloadTokenService } from '../download-token.service.js';
import { MeetingFilesService } from '../meeting-files.service.js';
import { CreateDownloadLinkQuery } from './create-download-link.query.js';

// Выдаёт относительную ссылку на скачивание (web добавляет адрес api). Ничего не пишет:
// токен подписывается, но нигде не сохраняется.
@QueryHandler(CreateDownloadLinkQuery)
export class CreateDownloadLinkHandler implements IQueryHandler<CreateDownloadLinkQuery> {
  constructor(
    private readonly files: MeetingFilesService,
    private readonly tokens: DownloadTokenService,
  ) {}

  async execute(query: CreateDownloadLinkQuery): Promise<{ url: string }> {
    const file = await this.files.getAccessible(
      query.userId,
      query.meetingId,
      query.fileId,
    );
    const token = await this.tokens.sign(query.userId, file.id);
    return {
      url: `/meetings/${file.meetingId}/files/${file.id}/content?token=${encodeURIComponent(token)}`,
    };
  }
}
