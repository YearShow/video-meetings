import type { ConfigService } from '@nestjs/config';

export const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MiB

export const getMaxUploadBytes = (config: ConfigService): number => {
  const value = Number(config.get('MAX_UPLOAD_BYTES'));
  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_MAX_UPLOAD_BYTES;
};
