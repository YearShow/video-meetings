import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import busboy from 'busboy';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard, type AuthUser } from '../../auth/jwt-auth.guard.js';
import { FileTooLargeError } from '../../storage/file-storage.js';
import { MeetingAccessGuard } from '../meeting-access.guard.js';
import { RetryTranscriptionCommand } from './commands/retry-transcription.command.js';
import { UploadMeetingFileCommand } from './commands/upload-meeting-file.command.js';
import type { MeetingFileView } from './file.view.js';
import { CreateDownloadLinkQuery } from './queries/create-download-link.query.js';
import { GetMeetingFilesQuery } from './queries/get-meeting-files.query.js';
import { getMaxUploadBytes } from './upload-limit.js';

// Запас на границы multipart и заголовки части поверх размера файла.
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

@Controller('meetings/:meetingId/files')
@UseGuards(JwtAuthGuard, MeetingAccessGuard)
export class MeetingFilesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly config: ConfigService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
  ): Promise<MeetingFileView[]> {
    return this.queryBus.execute(new GetMeetingFilesQuery(user.id, meetingId));
  }

  // Ссылка на скачивание: проверка доступа здесь, по обычному JWT. Сама ссылка
  // живёт минуту и открывается навигацией браузера (см. MeetingFileContentController).
  @Post(':fileId/download-link')
  @HttpCode(200)
  downloadLink(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
    @Param('fileId') fileId: string,
  ): Promise<{ url: string }> {
    return this.queryBus.execute(
      new CreateDownloadLinkQuery(user.id, meetingId, fileId),
    );
  }

  // Повторный запуск транскрибации после ошибки (409, если файл не в статусе ERROR).
  @Post(':fileId/transcription/retry')
  @HttpCode(200)
  retryTranscription(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
    @Param('fileId') fileId: string,
  ): Promise<MeetingFileView> {
    return this.commandBus.execute(
      new RetryTranscriptionCommand(user.id, meetingId, fileId),
    );
  }

  // Один файл за раз, multipart/form-data. Файл не буферизуется: поток из busboy
  // сразу уходит в команду и дальше в хранилище.
  @Post()
  upload(
    @CurrentUser() user: AuthUser,
    @Param('meetingId') meetingId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeetingFileView> {
    const maxBytes = getMaxUploadBytes(this.config);

    if (!req.is('multipart/form-data')) {
      throw new UnsupportedMediaTypeException(
        'Expected multipart/form-data with a single file',
      );
    }
    const declared = Number(req.headers['content-length']);
    if (declared > maxBytes + MULTIPART_OVERHEAD_BYTES) {
      // Отказ до чтения тела; соединение закрывается, остаток тела не принимаем.
      res.setHeader('Connection', 'close');
      throw new PayloadTooLargeException(
        `File exceeds the limit of ${maxBytes} bytes`,
      );
    }

    return new Promise<MeetingFileView>((resolve, reject) => {
      let fileSeen = false;
      let settled = false;
      const succeed = (view: MeetingFileView) => {
        if (settled) return;
        settled = true;
        resolve(view);
      };
      // Первая ошибка побеждает: остальные (ошибка парсера после отказа команды,
      // close без файла и т. п.) игнорируются и не пишут в уже отправленный ответ.
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        // После ошибки остаток тела не нужен: закрываем соединение после ответа.
        if (!res.headersSent) res.setHeader('Connection', 'close');
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const parser = busboy({
        headers: req.headers,
        defParamCharset: 'utf8',
        // busboy шлёт limit уже при достижении лимита, а не при превышении, поэтому
        // даём ему на байт больше; точную границу проверяет хранилище по записанным байтам.
        limits: { files: 1, fileSize: maxBytes + 1, fields: 0, parts: 2 },
      });

      parser.on('file', (_field, stream, info) => {
        fileSeen = true;
        // busboy усекает поток на лимите и сообщает об этом событием limit:
        // превращаем усечение в ошибку, чтобы хранилище удалило частичные данные.
        stream.on('limit', () =>
          stream.destroy(new FileTooLargeError(maxBytes)),
        );
        this.commandBus
          .execute(
            new UploadMeetingFileCommand(
              user.id,
              meetingId,
              info.filename ?? '',
              info.mimeType,
              stream,
            ),
          )
          .then(succeed, fail);
      });
      parser.on('filesLimit', () =>
        fail(new BadRequestException('Only one file per request is allowed')),
      );
      parser.on('fieldsLimit', () =>
        fail(new BadRequestException('Unexpected form field')),
      );
      parser.on('partsLimit', () =>
        fail(new BadRequestException('Too many form parts')),
      );
      parser.on('error', fail);
      parser.on('close', () => {
        if (!fileSeen) fail(new BadRequestException('File is required'));
      });

      // Обрыв соединения клиентом: разрушаем разбор, поток файла завершится
      // ошибкой, и хранилище удалит частичный файл.
      req.on('error', (error) => parser.destroy(error));
      req.on('aborted', () =>
        parser.destroy(new Error('Upload aborted by client')),
      );
      req.pipe(parser);
    });
  }
}
