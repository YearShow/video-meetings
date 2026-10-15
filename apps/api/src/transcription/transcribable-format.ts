import { extname } from 'node:path';

// Форматы, для которых запускается транскрибация. Нужны и расширение имени,
// и MIME-тип: имя и тип приходят от клиента, поэтому одного признака мало.
const FORMATS: Record<string, readonly string[]> = {
  '.mp3': ['audio/mpeg', 'audio/mp3', 'audio/x-mpeg'],
  '.mp4': ['video/mp4', 'audio/mp4'],
};

export const isTranscribable = (fileName: string, mimeType: string): boolean =>
  FORMATS[extname(fileName).toLowerCase()]?.includes(mimeType.toLowerCase()) ??
  false;

export const getTranscribableExtension = (fileName: string): string =>
  extname(fileName).toLowerCase();

// mp3 читается Whisper напрямую, у mp4 сначала извлекается звуковая дорожка.
export const needsAudioExtraction = (fileName: string): boolean =>
  getTranscribableExtension(fileName) === '.mp4';
