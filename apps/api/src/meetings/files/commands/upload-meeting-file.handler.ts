import { randomUUID } from 'node:crypto';
import {
  Inject,
  Logger,
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
import { isTranscribable } from '../../../transcription/transcribable-format.js';
import { TranscriptionService } from '../../../transcription/transcription.service.js';
import { MeetingAccessService } from '../../meeting-access.service.js';
import { normalizeMimeType, sanitizeFileName } from '../file-name.js';
import { fileInclude, toFileView, type MeetingFileView } from '../file.view.js';
import { getMaxUploadBytes } from '../upload-limit.js';
import { UploadMeetingFileCommand } from './upload-meeting-file.command.js';

@CommandHandler(UploadMeetingFileCommand)
export class UploadMeetingFileHandler implements ICommandHandler<UploadMeetingFileCommand> {
  private readonly logger = new Logger(UploadMeetingFileHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MeetingAccessService,
    private readonly config: ConfigService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly transcription: TranscriptionService,
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
    const originalName = sanitizeFileName(command.fileName);
    const mimeType = normalizeMimeType(command.mimeType);
    const transcribe = isTranscribable(originalName, mimeType);
    try {
      const file = await this.prisma.meetingFile.create({
        data: {
          id: fileId,
          meetingId: command.meetingId,
          uploadedById: command.userId,
          originalName,
          mimeType,
          sizeBytes: size,
          storageKey,
          // Для mp3/mp4 сразу заводится транскрибация в статусе QUEUED.
          ...(transcribe && { transcription: { create: {} } }),
        },
        include: fileInclude,
      });
      // Расшифровка идёт в фоне: ответ загрузки её не ждёт.
      if (transcribe) this.transcription.enqueue(file.id);
      return toFileView(file);
    } catch (error) {
      // Ошибка очистки не должна подменять исходную причину сбоя.
      await this.storage.delete(storageKey).catch((cleanupError: unknown) => {
        this.logger.error(
          `Failed to remove orphaned file ${storageKey}`,
          cleanupError instanceof Error ? cleanupError.stack : undefined,
        );
      });
      throw error;
    }
  }
}
