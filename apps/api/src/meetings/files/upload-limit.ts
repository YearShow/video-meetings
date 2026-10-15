import type { ConfigService } from '@nestjs/config';

export const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MiB
// Размер файла хранится в колонке INTEGER (32 бита): лимит не может быть больше.
export const MAX_SUPPORTED_UPLOAD_BYTES = 2 ** 31 - 1;

export const getMaxUploadBytes = (config: ConfigService): number => {
  const value = Number(config.get('MAX_UPLOAD_BYTES'));
  if (!Number.isSafeInteger(value) || value <= 0) {
    return DEFAULT_MAX_UPLOAD_BYTES;
  }
  return Math.min(value, MAX_SUPPORTED_UPLOAD_BYTES);
};
