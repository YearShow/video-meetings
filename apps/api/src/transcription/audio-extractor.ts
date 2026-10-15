import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranscriptionError } from './transcription.error.js';
import { runProcess } from './run-process.js';

const DEFAULT_FFMPEG_BIN = 'ffmpeg';

// Извлекает звуковую дорожку в WAV 16 кГц моно — формат, который читает whisper.cpp.
@Injectable()
export class AudioExtractor {
  private readonly logger = new Logger(AudioExtractor.name);

  constructor(private readonly config: ConfigService) {}

  async extract(inputPath: string, outputPath: string): Promise<void> {
    const bin = this.config.get<string>('FFMPEG_BIN') || DEFAULT_FFMPEG_BIN;
    let result;
    try {
      result = await runProcess(bin, [
        '-nostdin',
        '-y',
        '-i',
        inputPath,
        // Явный выбор первой аудиодорожки: без неё ffmpeg молча выдал бы пустой файл.
        '-map',
        '0:a:0',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-f',
        'wav',
        outputPath,
      ]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new TranscriptionError(
          'ffmpeg не установлен на сервере: нельзя извлечь звук из видео',
        );
      }
      throw error;
    }
    if (result.code === 0) return;

    this.logger.warn(
      `ffmpeg exited with ${result.code}: ${result.stderr.slice(-500)}`,
    );
    throw classifyFfmpegError(result.stderr);
  }
}

export const classifyFfmpegError = (stderr: string): TranscriptionError => {
  if (/matches no streams|does not contain any stream/i.test(stderr)) {
    return new TranscriptionError('В файле нет звуковой дорожки');
  }
  if (
    /invalid data found|moov atom not found|could not find codec/i.test(stderr)
  ) {
    return new TranscriptionError(
      'Файл повреждён или не удалось прочитать его содержимое',
    );
  }
  return new TranscriptionError('Не удалось извлечь звук из файла');
};
