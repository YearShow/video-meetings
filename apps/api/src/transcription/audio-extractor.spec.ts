import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { AudioExtractor, classifyFfmpegError } from './audio-extractor.js';
import { TranscriptionError } from './transcription.error.js';

describe('classifyFfmpegError', () => {
  it.each([
    ["Stream map '0:a:0' matches no streams.", 'В файле нет звуковой дорожки'],
    [
      'Output file #0 does not contain any stream',
      'В файле нет звуковой дорожки',
    ],
    [
      'Invalid data found when processing input',
      'Файл повреждён или не удалось прочитать его содержимое',
    ],
    [
      'moov atom not found',
      'Файл повреждён или не удалось прочитать его содержимое',
    ],
    ['something unexpected', 'Не удалось извлечь звук из файла'],
  ])('%s → %s', (stderr, message) => {
    const error = classifyFfmpegError(stderr);
    expect(error).toBeInstanceOf(TranscriptionError);
    expect(error.message).toBe(message);
  });
});

describe('AudioExtractor', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'audio-extractor-spec-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const extractor = (bin?: string) =>
    new AudioExtractor({
      get: (key: string) => (key === 'FFMPEG_BIN' ? bin : undefined),
    } as unknown as ConfigService);

  const fakeBin = async (name: string, body: string) => {
    const path = join(dir, name);
    await writeFile(path, `#!/bin/sh\n${body}\n`);
    await chmod(path, 0o755);
    return path;
  };

  it('вызывает ffmpeg: первая аудиодорожка → wav 16 кГц моно', async () => {
    const out = join(dir, 'args.txt');
    const bin = await fakeBin('ok', `echo "$@" > ${out}`);

    await extractor(bin).extract('/in.mp4', '/out.wav');

    const { readFile } = await import('node:fs/promises');
    const args = await readFile(out, 'utf8');
    expect(args).toContain('-i /in.mp4');
    expect(args).toContain('-map 0:a:0');
    expect(args).toContain('-ac 1 -ar 16000');
    expect(args.trim().endsWith('/out.wav')).toBe(true);
  });

  it('нет дорожки → «нет звуковой дорожки»', async () => {
    const bin = await fakeBin(
      'noaudio',
      `echo "Stream map '0:a:0' matches no streams." >&2; exit 1`,
    );

    await expect(extractor(bin).extract('/in.mp4', '/o.wav')).rejects.toThrow(
      'В файле нет звуковой дорожки',
    );
  });

  it('повреждённый файл → «файл повреждён»', async () => {
    const bin = await fakeBin(
      'corrupt',
      'echo "Invalid data found when processing input" >&2; exit 1',
    );

    await expect(extractor(bin).extract('/in.mp4', '/o.wav')).rejects.toThrow(
      'Файл повреждён',
    );
  });

  it('ffmpeg не установлен → TranscriptionError', async () => {
    await expect(
      extractor(join(dir, 'missing')).extract('/in.mp4', '/o.wav'),
    ).rejects.toThrow('ffmpeg не установлен');
  });
});
