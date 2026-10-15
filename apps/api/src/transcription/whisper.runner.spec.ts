import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { TranscriptionError } from './transcription.error.js';
import { parseWhisperProgress, WhisperRunner } from './whisper.runner.js';

describe('WhisperRunner', () => {
  let dir: string;

  let model: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'whisper-runner-spec-'));
    model = join(dir, 'ggml-base.bin');
    await writeFile(model, '');
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const runner = (env: Record<string, string | undefined>) =>
    new WhisperRunner({
      get: (key: string) => env[key],
    } as unknown as ConfigService);

  const fakeBin = async (name: string, body: string) => {
    const path = join(dir, name);
    await writeFile(path, `#!/bin/sh\n${body}\n`);
    await chmod(path, 0o755);
    return path;
  };

  it('запускает whisper с моделью и русским языком, возвращает текст из stdout', async () => {
    const bin = await fakeBin('ok', 'echo "$@"; echo " привет "');

    const text = await runner({
      WHISPER_BIN: bin,
      WHISPER_MODEL_PATH: model,
    }).transcribe('/tmp/in.mp3');

    expect(text).toContain(`-m ${model} -l ru`);
    expect(text).toContain('-f /tmp/in.mp3');
    expect(text).toContain('привет');
  });

  it('файла модели нет → «Файл модели Whisper не найден»', async () => {
    const bin = await fakeBin('never', 'echo no');

    await expect(
      runner({
        WHISPER_BIN: bin,
        WHISPER_MODEL_PATH: join(dir, 'absent.bin'),
      }).transcribe('/tmp/in.mp3'),
    ).rejects.toThrow('Файл модели Whisper не найден');
  });

  it('без пути к модели → понятная ошибка', async () => {
    await expect(runner({}).transcribe('/tmp/in.mp3')).rejects.toThrow(
      'Модель Whisper не настроена',
    );
  });

  it('нет бинарника → TranscriptionError', async () => {
    await expect(
      runner({
        WHISPER_BIN: join(dir, 'missing'),
        WHISPER_MODEL_PATH: model,
      }).transcribe('/tmp/in.mp3'),
    ).rejects.toThrow(TranscriptionError);
  });

  it('ненулевой код выхода → общая ошибка без внутренних деталей', async () => {
    const bin = await fakeBin('fail', 'echo "secret /srv/path" >&2; exit 3');

    const error = await runner({
      WHISPER_BIN: bin,
      WHISPER_MODEL_PATH: model,
    })
      .transcribe('/tmp/in.mp3')
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(TranscriptionError);
    expect((error as Error).message).toBe('Whisper завершился с ошибкой');
  });

  it('Whisper не смог прочитать аудио → «файл повреждён»', async () => {
    const bin = await fakeBin(
      'corrupt',
      'echo "error: failed to read audio file" >&2; exit 2',
    );

    await expect(
      runner({ WHISPER_BIN: bin, WHISPER_MODEL_PATH: model }).transcribe(
        '/tmp/in.mp3',
      ),
    ).rejects.toThrow('Файл повреждён');
  });

  it('передаёт прогресс из stderr по мере работы', async () => {
    const bin = await fakeBin(
      'progress',
      'echo "whisper_print_progress_callback: progress =  10%" >&2; sleep 0.2\n' +
        'echo "whisper_print_progress_callback: progress =  60%" >&2; sleep 0.2\n' +
        'echo "whisper_print_progress_callback: progress = 100%" >&2\n' +
        'echo готово',
    );
    const seen: number[] = [];

    const text = await runner({
      WHISPER_BIN: bin,
      WHISPER_MODEL_PATH: model,
    }).transcribe('/tmp/in.mp3', (p) => seen.push(p));

    expect(text).toBe('готово');
    expect(seen).toEqual([10, 60, 100]);
  });
});

describe('parseWhisperProgress', () => {
  it('берёт последнее значение из куска вывода', () => {
    expect(
      parseWhisperProgress(
        'progress =  5%\nwhisper_print_progress_callback: progress =  15%\n',
      ),
    ).toBe(15);
  });

  it('нет прогресса → null; значение ограничено 100', () => {
    expect(parseWhisperProgress('system_info: n_threads = 4')).toBeNull();
    expect(parseWhisperProgress('progress = 250%')).toBe(100);
  });
});
