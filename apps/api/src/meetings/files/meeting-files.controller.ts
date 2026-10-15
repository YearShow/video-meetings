import {
  BadRequestException,
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import busboy from 'busboy';
import type { Request, Response } from 'express';
import { Param } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard, type AuthUser } from '../../auth/jwt-auth.guard.js';
import { FileTooLargeError } from '../../storage/file-storage.js';
import { MeetingAccessGuard } from '../meeting-access.guard.js';
import { UploadMeetingFileCommand } from './commands/upload-meeting-file.command.js';
import type { MeetingFileView } from './file.view.js';
import { getMaxUploadBytes } from './upload-limit.js';

// Запас на границы multipart и заголовки части поверх размера файла.
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

@Controller('meetings/:meetingId/files')
@UseGuards(JwtAuthGuard, MeetingAccessGuard)
export class MeetingFilesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly config: ConfigService,
  ) {}

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
      const fail = (error: unknown) => {
        // После ошибки остаток тела не нужен: закрываем соединение после ответа.
        res.setHeader('Connection', 'close');
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
          .then(resolve, fail);
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
