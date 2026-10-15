import { formatDateTime, formatFileSize } from './format';

const nbsp = (s: string) => s.replace(/\s/g, ' ');

describe('formatFileSize', () => {
  it.each([
    [0, '0 Б'],
    [1023, '1 023 Б'],
    [1024, '1 КБ'],
    [1536, '1,5 КБ'],
    [5 * 1024 * 1024, '5 МБ'],
    [524_288_000, '500 МБ'],
    [2 ** 31 - 1, '2 ГБ'],
  ])('%i → %s', (bytes, expected) => {
    expect(nbsp(formatFileSize(bytes))).toBe(expected);
  });
});

describe('formatDateTime', () => {
  it('форматирует дату по-русски', () => {
    expect(formatDateTime('2026-03-05T09:30:00.000Z', 'UTC')).toMatch(
      /5 марта 2026 г\..*09:30/,
    );
  });
});
