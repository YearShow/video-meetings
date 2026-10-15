const MAX_NAME_LENGTH = 255;
const DEFAULT_MIME_TYPE = 'application/octet-stream';

// Имя от пользователя нужно только для отображения и заголовка скачивания,
// в путь на диске оно не попадает. Убираем каталоги, управляющие символы, обрезаем.
export const sanitizeFileName = (raw: string): string => {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .normalize('NFC')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned === '' || cleaned === '.' || cleaned === '..'
    ? 'file'
    : cleaned;
};

export const normalizeMimeType = (raw: string): string => {
  const value = raw.trim().slice(0, 255);
  // Только тип/подтип: параметры (charset и т. п.) отбрасываются, регистр приводится к нижнему.
  const match = /^([\w.+-]+\/[\w.+-]+)\s*(?:;|$)/.exec(value);
  return match ? match[1].toLowerCase() : DEFAULT_MIME_TYPE;
};
