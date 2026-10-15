import type { ConfigService } from '@nestjs/config';
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  MAX_SUPPORTED_UPLOAD_BYTES,
  getMaxUploadBytes,
} from './upload-limit.js';

const config = (value: unknown) =>
  ({ get: () => value }) as unknown as ConfigService;

describe('getMaxUploadBytes', () => {
  it.each([
    ['1048576', 1048576],
    [undefined, DEFAULT_MAX_UPLOAD_BYTES],
    ['', DEFAULT_MAX_UPLOAD_BYTES],
    ['abc', DEFAULT_MAX_UPLOAD_BYTES],
    ['0', DEFAULT_MAX_UPLOAD_BYTES],
    ['-5', DEFAULT_MAX_UPLOAD_BYTES],
    ['1.5', DEFAULT_MAX_UPLOAD_BYTES],
  ])('%j → %j', (raw, expected) => {
    expect(getMaxUploadBytes(config(raw))).toBe(expected);
  });

  it('ограничивает лимит размером колонки INTEGER', () => {
    expect(getMaxUploadBytes(config(String(5 * 1024 ** 3)))).toBe(
      MAX_SUPPORTED_UPLOAD_BYTES,
    );
  });
});
