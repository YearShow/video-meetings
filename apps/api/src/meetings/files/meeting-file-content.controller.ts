import {
  Controller,
  Get,
  Header,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthUser } from '../../auth/jwt-auth.guard.js';
import { MeetingAccessGuard } from '../meeting-access.guard.js';
import { DownloadTokenGuard } from './download-token.guard.js';
import {
  GetMeetingFileContentQuery,
  type MeetingFileContent,
} from './queries/get-meeting-file-content.query.js';

// Скачивание по ссылке с токеном (`?token=`), а не по Authorization: браузер открывает
// ссылку навигацией. Токен принимает только DownloadTokenGuard, доступ к встрече
// проверяется заново при каждом открытии.
@Controller('meetings/:meetingId/files/:fileId/content')
@UseGuards(DownloadTokenGuard, MeetingAccessGuard)
export class MeetingFileContentController {
  constructor(private readonly queryBus: QueryBus) {}

  // Файл всегда отдаётся как вложение с нейтральным типом: MIME от пользователя
  // не доверяем, браузер не должен выполнять или показывать содержимое.
  @Get()
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Cache-Control', 'private, no-store')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file: MeetingFileContent = await this.queryBus.execute(
      new GetMeetingFileContentQuery(user.id, meetingId, fileId),
    );
    // Express формирует filename и filename*=UTF-8'' (кириллица, кавычки, переводы строк).
    res.attachment(file.name);
    // attachment() подставляет тип по расширению имени: возвращаем нейтральный.
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', file.size);
    return new StreamableFile(file.content);
  }
}
