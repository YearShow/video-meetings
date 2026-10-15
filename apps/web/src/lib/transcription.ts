// Без серверных импортов: модуль используют и клиентские компоненты.
export type TranscriptionStatus = 'QUEUED' | 'IN_PROGRESS' | 'DONE' | 'ERROR';

// null у файлов, которые не расшифровываются (не mp3/mp4).
export interface Transcription {
  status: TranscriptionStatus;
  progress: number;
  text: string | null;
  error: string | null;
}

export const isTranscriptionActive = (t: Transcription | null): boolean =>
  t?.status === 'QUEUED' || t?.status === 'IN_PROGRESS';
