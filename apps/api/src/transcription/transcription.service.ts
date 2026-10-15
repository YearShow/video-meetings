import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  FILE_STORAGE,
  StorageObjectNotFoundError,
  type FileStorage,
} from '../storage/file-storage.js';
import { AudioExtractor } from './audio-extractor.js';
import {
  getTranscribableExtension,
  needsAudioExtraction,
} from './transcribable-format.js';
import {
  GENERIC_TRANSCRIPTION_ERROR,
  TranscriptionError,
} from './transcription.error.js';
import { WhisperRunner } from './whisper.runner.js';

const DEFAULT_CONCURRENCY = 1;

export const getTranscriptionConcurrency = (config: ConfigService): number => {
  const value = Number(config.get('TRANSCRIPTION_CONCURRENCY'));
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_CONCURRENCY;
};

// Очередь транскрибации в памяти процесса: источник истины о статусе — БД,
// очередь только раздаёт работу и не запускает больше `concurrency` задач сразу.
@Injectable()
export class TranscriptionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly queue: string[] = [];
  // Файлы, которые уже в очереди или в работе: повторная постановка игнорируется.
  private readonly active = new Set<string>();
  private running = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whisper: WhisperRunner,
    private readonly extractor: AudioExtractor,
    private readonly config: ConfigService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Несколько экземпляров api на одной БД делили бы чужие задачи: восстановление
    // рассчитано на один экземпляр и отключается значением off (так делают e2e-тесты).
    if (this.config.get('TRANSCRIPTION_RECOVERY') === 'off') return;
    try {
      await this.recover();
    } catch (error) {
      // Сбой восстановления не должен мешать запуску api.
      this.logger.error(
        'Failed to recover transcriptions',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  // После рестарта очередь в памяти пуста, а в БД остались незавершённые задачи:
  // прерванные «В процессе» возвращаются в «В очереди», затем все «В очереди»
  // ставятся в очередь заново в порядке создания. Возвращает число поставленных задач.
  async recover(): Promise<number> {
    await this.prisma.fileTranscription.updateMany({
      where: { status: 'IN_PROGRESS' },
      data: { status: 'QUEUED', progress: 0 },
    });
    const pending = await this.prisma.fileTranscription.findMany({
      where: { status: 'QUEUED' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { fileId: true },
    });
    for (const { fileId } of pending) this.enqueue(fileId);
    if (pending.length > 0) {
      this.logger.log(
        `Re-queued ${pending.length} transcription(s) after start`,
      );
    }
    return pending.length;
  }

  // Ставит файл в очередь и сразу возвращает управление: расшифровка идёт в фоне.
  enqueue(fileId: string): void {
    if (this.active.has(fileId)) return;
    this.active.add(fileId);
    this.queue.push(fileId);
    this.pump();
  }

  private pump(): void {
    const concurrency = getTranscriptionConcurrency(this.config);
    while (this.running < concurrency && this.queue.length > 0) {
      const fileId = this.queue.shift() as string;
      this.running++;
      void this.process(fileId).finally(() => {
        this.active.delete(fileId);
        this.running--;
        this.pump();
      });
    }
  }

  // Никогда не бросает: любой сбой фиксируется статусом ERROR, очередь не ломается.
  private async process(fileId: string): Promise<void> {
    let workDir: string | undefined;
    try {
      const file = await this.prisma.meetingFile.findUnique({
        where: { id: fileId },
        select: { storageKey: true, originalName: true },
      });
      if (!file) return; // файл удалён, запись транскрибации ушла каскадом

      const started = await this.prisma.fileTranscription.updateMany({
        // Только из QUEUED: устаревшая или дублирующая задача чужой статус не трогает.
        where: { fileId, status: 'QUEUED' },
        data: { status: 'IN_PROGRESS', progress: 0, error: null },
      });
      if (started.count === 0) return;

      workDir = await mkdtemp(join(tmpdir(), 'transcription-'));
      const inputPath = join(
        workDir,
        `input${getTranscribableExtension(file.originalName)}`,
      );
      await pipeline(
        await this.readFromStorage(file.storageKey),
        createWriteStream(inputPath),
      );

      let audioPath = inputPath;
      if (needsAudioExtraction(file.originalName)) {
        audioPath = join(workDir, 'audio.wav');
        await this.extractor.extract(inputPath, audioPath);
      }

      const text = await this.whisper.transcribe(audioPath, (percent) =>
        this.saveProgress(fileId, percent),
      );
      await this.prisma.fileTranscription.updateMany({
        where: { fileId },
        data: { status: 'DONE', progress: 100, text, error: null },
      });
    } catch (error) {
      await this.fail(fileId, error);
    } finally {
      if (workDir) {
        await rm(workDir, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
    }
  }

  private async readFromStorage(key: string) {
    try {
      return await this.storage.read(key);
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) {
        throw new TranscriptionError('Файл недоступен в хранилище');
      }
      throw error;
    }
  }

  // Прогресс только растёт и не доходит до 100: это значение ставит завершение.
  // Запись без ожидания; сбой записи прогресса не должен ронять расшифровку.
  private saveProgress(fileId: string, percent: number): void {
    const progress = Math.min(Math.round(percent), 99);
    void this.prisma.fileTranscription
      .updateMany({
        where: { fileId, status: 'IN_PROGRESS', progress: { lt: progress } },
        data: { progress },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to store progress for ${fileId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  private async fail(fileId: string, error: unknown): Promise<void> {
    const message =
      error instanceof TranscriptionError
        ? error.message
        : GENERIC_TRANSCRIPTION_ERROR;
    if (!(error instanceof TranscriptionError)) {
      this.logger.error(
        `Transcription of ${fileId} failed`,
        error instanceof Error ? error.stack : undefined,
      );
    }
    await this.prisma.fileTranscription
      .updateMany({
        where: { fileId },
        data: { status: 'ERROR', error: message },
      })
      .catch((updateError: unknown) => {
        this.logger.error(
          `Failed to store transcription error for ${fileId}`,
          updateError instanceof Error ? updateError.stack : undefined,
        );
      });
  }
}
