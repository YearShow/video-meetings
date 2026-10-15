import { randomUUID } from 'node:crypto';
import {
  Inject,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  FILE_STORAGE,
  FileTooLargeError,
  type FileStorage,
} from '../../../storage/file-storage.js';
import { MeetingAccessService } from '../../meeting-access.service.js';
import { normalizeMimeType, sanitizeFileName } from '../file-name.js';
import { fileInclude, toFileView, type MeetingFileView } from '../file.view.js';
import { getMaxUploadBytes } from '../upload-limit.js';
import { UploadMeetingFileCommand } from './upload-meeting-file.command.js';

@CommandHandler(UploadMeetingFileCommand)
export class UploadMeetingFileHandler implements ICommandHandler<UploadMeetingFileCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MeetingAccessService,
    private readonly config: ConfigService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async execute(command: UploadMeetingFileCommand): Promise<MeetingFileView> {
    // Доступ проверяется и здесь, а не только в guard: правило не обходится другим входом.
    if (!(await this.access.hasAccess(command.meetingId, command.userId))) {
      command.content.destroy();
      throw new NotFoundException('Meeting not found');
    }

    // Ключ строит сервер из id, имя от пользователя в путь не попадает.
    const fileId = randomUUID();
    const storageKey = `meetings/${command.meetingId}/${fileId}`;

    let size: number;
    try {
      ({ size } = await this.storage.save(storageKey, command.content, {
        maxBytes: getMaxUploadBytes(this.config),
      }));
    } catch (error) {
      if (error instanceof FileTooLargeError) {
        throw new PayloadTooLargeException(
          `File exceeds the limit of ${error.maxBytes} bytes`,
        );
      }
      throw error;
    }

    // Запись в БД создаётся только после успешной записи файла; если она упала,
    // файл в хранилище удаляется, чтобы не осталось неучтённых данных.
    try {
      const file = await this.prisma.meetingFile.create({
        data: {
          id: fileId,
          meetingId: command.meetingId,
          uploadedById: command.userId,
          originalName: sanitizeFileName(command.fileName),
          mimeType: normalizeMimeType(command.mimeType),
          sizeBytes: size,
          storageKey,
        },
        include: fileInclude,
      });
      return toFileView(file);
    } catch (error) {
      await this.storage.delete(storageKey);
      throw error;
    }
  }
}
