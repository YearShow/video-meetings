import { normalizeMimeType, sanitizeFileName } from './file-name.js';

describe('sanitizeFileName', () => {
  it.each([
    ['report.pdf', 'report.pdf'],
    ['Запись встречи.mp4', 'Запись встречи.mp4'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\doc.txt', 'doc.txt'],
    ['a/b/c.txt', 'c.txt'],
    ['  spaced.txt  ', 'spaced.txt'],
    ['bad\u0000na\nme.txt', 'badname.txt'],
    ['', 'file'],
    ['..', 'file'],
    ['.', 'file'],
    ['dir/', 'file'],
  ])('%j → %j', (raw, expected) => {
    expect(sanitizeFileName(raw)).toBe(expected);
  });

  it('нормализует юникод в NFC', () => {
    expect(sanitizeFileName('e\u0301.txt')).toBe('\u00e9.txt');
  });

  it('обрезает длинное имя до 255 символов', () => {
    expect(sanitizeFileName('a'.repeat(300))).toHaveLength(255);
  });
});

describe('normalizeMimeType', () => {
  it.each([
    ['video/mp4', 'video/mp4'],
    ['text/plain; charset=utf-8', 'text/plain; charset=utf-8'],
    ['', 'application/octet-stream'],
    ['garbage', 'application/octet-stream'],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeMimeType(raw)).toBe(expected);
  });
});
