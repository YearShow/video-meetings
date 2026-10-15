import type { Readable } from 'node:stream';

// Абстракция хранилища файлов. Сейчас единственная реализация — локальный диск,
// позже её можно заменить на S3-совместимое без изменения API.
export interface FileStorage {
  // Записывает поток под ключом. Если данных больше maxBytes — бросает
  // FileTooLargeError; при любой ошибке или обрыве потока ничего не остаётся.
  save(
    key: string,
    source: Readable,
    options: { maxBytes: number },
  ): Promise<{ size: number }>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  // Удаляет все объекты с общим префиксом (например, все файлы встречи).
  deletePrefix(prefix: string): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');

export class FileTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`File exceeds ${maxBytes} bytes`);
    this.name = 'FileTooLargeError';
  }
}

export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid storage key: ${JSON.stringify(key)}`);
    this.name = 'InvalidStorageKeyError';
  }
}

export class StorageObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Storage object not found: ${JSON.stringify(key)}`);
    this.name = 'StorageObjectNotFoundError';
  }
}
