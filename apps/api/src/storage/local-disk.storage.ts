import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { OnModuleInit } from '@nestjs/common';
import {
  FileTooLargeError,
  InvalidStorageKeyError,
  StorageObjectNotFoundError,
  type FileStorage,
} from './file-storage.js';

const TMP_DIR = '.tmp';
// Запись до requestTimeout (1 час) ещё может идти; старше — остаток упавшего процесса.
const STALE_TMP_AGE_MS = 2 * 60 * 60 * 1000;

export class LocalDiskStorage implements FileStorage, OnModuleInit {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  // При старте убираем недописанные файлы, оставшиеся после падения процесса.
  async onModuleInit(): Promise<void> {
    await this.cleanupTemp(STALE_TMP_AGE_MS);
  }

  // Запись идёт во временный файл на том же томе, затем атомарный rename:
  // читатель никогда не увидит недописанный файл.
  async save(
    key: string,
    source: Readable,
    options: { maxBytes: number },
  ): Promise<{ size: number }> {
    const target = this.resolve(key);
    const tmpDir = path.join(this.root, TMP_DIR);
    await mkdir(tmpDir, { recursive: true });
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = path.join(tmpDir, randomUUID());

    // Размер считаем по фактически записанным байтам, а не по заголовкам клиента.
    let size = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > options.maxBytes) {
          callback(new FileTooLargeError(options.maxBytes));
          return;
        }
        callback(null, chunk);
      },
    });

    try {
      await pipeline(source, limiter, createWriteStream(tmp, { flags: 'wx' }));
      await rename(tmp, target);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
    return { size };
  }

  async read(key: string): Promise<Readable> {
    const file = this.resolve(key);
    try {
      await stat(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageObjectNotFoundError(key);
      }
      throw error;
    }
    return createReadStream(file);
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    await rm(this.resolve(prefix), { recursive: true, force: true });
  }

  // Удаляет временные файлы старше maxAgeMs (остатки после падения процесса).
  async cleanupTemp(maxAgeMs: number): Promise<number> {
    const dir = path.join(this.root, TMP_DIR);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return 0;
    }
    let removed = 0;
    for (const name of names) {
      const file = path.join(dir, name);
      const info = await stat(file).catch(() => null);
      if (info && Date.now() - info.mtimeMs > maxAgeMs) {
        await rm(file, { force: true });
        removed++;
      }
    }
    return removed;
  }

  // Ключ строит сервер, но путь всё равно проверяется: он не должен выходить
  // за каталог хранилища и не должен попадать во временный каталог.
  private resolve(key: string): string {
    const resolved = path.resolve(this.root, key);
    const relative = path.relative(this.root, resolved);
    if (
      key === '' ||
      key.includes('\0') ||
      relative === '' ||
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      relative.split(path.sep)[0] === TMP_DIR
    ) {
      throw new InvalidStorageKeyError(key);
    }
    return resolved;
  }
}
