import { ConflictException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { TranscriptionService } from '../../../transcription/transcription.service.js';
import { fileInclude, toFileView, type MeetingFileView } from '../file.view.js';
import { MeetingFilesService } from '../meeting-files.service.js';
import { RetryTranscriptionCommand } from './retry-transcription.command.js';

// Повторный запуск транскрибации: только для файла в статусе ERROR. Доступ такой же,
// как к самому файлу (владелец и участники встречи).
@CommandHandler(RetryTranscriptionCommand)
export class RetryTranscriptionHandler implements ICommandHandler<RetryTranscriptionCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: MeetingFilesService,
    private readonly transcription: TranscriptionService,
  ) {}

  async execute(command: RetryTranscriptionCommand): Promise<MeetingFileView> {
    const file = await this.files.getAccessible(
      command.userId,
      command.meetingId,
      command.fileId,
    );

    // Переход ERROR → QUEUED одним условным обновлением: два одновременных
    // «Повторить» не поставят файл в очередь дважды.
    const { count } = await this.prisma.fileTranscription.updateMany({
      where: { fileId: file.id, status: 'ERROR' },
      data: { status: 'QUEUED', progress: 0, text: null, error: null },
    });
    if (count === 0) {
      const exists = await this.prisma.fileTranscription.findUnique({
        where: { fileId: file.id },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Transcription not found');
      throw new ConflictException('Transcription is not in error state');
    }

    // Ответ собирается до постановки в очередь: воркер мог бы уже сменить статус,
    // а клиенту нужно состояние сразу после повтора (QUEUED).
    const updated = await this.prisma.meetingFile.findUniqueOrThrow({
      where: { id: file.id },
      include: fileInclude,
    });
    this.transcription.enqueue(file.id);
    return toFileView(updated);
  }
}
