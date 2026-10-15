import { DEFAULT_MAX_UPLOAD_BYTES, parseMaxUploadBytes } from './upload';

describe('parseMaxUploadBytes', () => {
  it('без значения или с мусором — лимит по умолчанию', () => {
    for (const value of [undefined, '', 'abc', '0', '-5', '1.5']) {
      expect(parseMaxUploadBytes(value)).toBe(DEFAULT_MAX_UPLOAD_BYTES);
    }
  });

  it('берёт значение из переменной', () => {
    expect(parseMaxUploadBytes('1048576')).toBe(1048576);
  });

  it('не больше 2^31 - 1, как в api', () => {
    expect(parseMaxUploadBytes(String(2 ** 40))).toBe(2 ** 31 - 1);
  });
});
