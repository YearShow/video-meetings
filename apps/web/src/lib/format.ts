const UNITS = ['Б', 'КБ', 'МБ', 'ГБ'];

// Размер файла в двоичных единицах: 1536 → «1,5 КБ».
export function formatFileSize(bytes: number) {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
  return `${text} ${UNITS[unit]}`;
}

export function formatDateTime(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}
