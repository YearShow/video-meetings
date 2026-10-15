import { access } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runProcess } from './run-process.js';
import { TranscriptionError } from './transcription.error.js';

const DEFAULT_WHISPER_BIN = 'whisper-cli';

// whisper.cpp с флагом -pp пишет в stderr строки вида
// «whisper_print_progress_callback: progress =  10%».
const PROGRESS_RE = /progress\s*=\s*(\d{1,3})%/g;

export const parseWhisperProgress = (chunk: string): number | null => {
  let last: number | null = null;
  for (const match of chunk.matchAll(PROGRESS_RE)) {
    last = Math.min(Number(match[1]), 100);
  }
  return last;
};

// Запуск локального whisper.cpp (`whisper-cli`) с моделью base и русским языком.
// Внешние сервисы не используются: данные записи остаются на сервере.
@Injectable()
export class WhisperRunner {
  private readonly logger = new Logger(WhisperRunner.name);

  constructor(private readonly config: ConfigService) {}

  // onProgress получает процент 0..100 по мере работы Whisper.
  async transcribe(
    inputPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<string> {
    const modelPath = this.config.get<string>('WHISPER_MODEL_PATH');
    if (!modelPath) {
      throw new TranscriptionError('Модель Whisper не настроена');
    }
    // Без этой проверки отсутствие модели выглядело бы как «файл повреждён».
    await access(modelPath).catch(() => {
      throw new TranscriptionError('Файл модели Whisper не найден');
    });
    const bin = this.config.get<string>('WHISPER_BIN') || DEFAULT_WHISPER_BIN;

    let result;
    try {
      // -nt: без таймкодов, результат — чистый текст в stdout; -pp: прогресс в stderr.
      result = await runProcess(
        bin,
        ['-m', modelPath, '-l', 'ru', '-nt', '-pp', '-f', inputPath],
        (chunk) => {
          const percent = parseWhisperProgress(chunk);
          if (percent !== null) onProgress?.(percent);
        },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new TranscriptionError('Whisper не установлен на сервере');
      }
      throw error;
    }

    if (result.code === 0) return result.stdout.trim();

    this.logger.warn(
      `whisper exited with ${result.code}: ${result.stderr.slice(-500)}`,
    );
    if (/failed to (read|open)|audio file/i.test(result.stderr)) {
      throw new TranscriptionError(
        'Файл повреждён или не удалось прочитать его содержимое',
      );
    }
    throw new TranscriptionError('Whisper завершился с ошибкой');
  }
}
