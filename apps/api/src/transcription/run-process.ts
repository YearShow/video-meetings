import { spawn } from 'node:child_process';

const MAX_OUTPUT_BYTES = 256 * 1024;

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

// Запускает процесс без shell. Бросает ошибку spawn (например, ENOENT), а не
// ненулевой код выхода — его разбирает вызывающий. `onStderr` получает сырые
// куски stderr (прогресс Whisper и ffmpeg приходит туда).
export const runProcess = (
  bin: string,
  args: string[],
  onStderr?: (chunk: string) => void,
): Promise<ProcessResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      onStderr?.(chunk);
      // Ошибка обычно в конце вывода: держим хвост, а не начало.
      stderr = (stderr + chunk).slice(-MAX_OUTPUT_BYTES);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
