import type { Prisma } from '../../generated/prisma/client.js';

export const fileInclude = {
  uploadedBy: { select: { id: true, email: true } },
  transcription: {
    select: { status: true, progress: true, text: true, error: true },
  },
} satisfies Prisma.MeetingFileInclude;

export type MeetingFileWithAuthor = Prisma.MeetingFileGetPayload<{
  include: typeof fileInclude;
}>;

export type TranscriptionStatus = 'QUEUED' | 'IN_PROGRESS' | 'DONE' | 'ERROR';

// Состояние транскрибации; у файлов, которые не расшифровываются, его нет (null).
export interface TranscriptionView {
  status: TranscriptionStatus;
  progress: number;
  text: string | null;
  error: string | null;
}

// Модель чтения: без storageKey и других внутренних полей.
export interface MeetingFileView {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  status: 'UPLOADED';
  createdAt: Date;
  uploadedBy: { id: string; email: string };
  transcription: TranscriptionView | null;
}

export const toFileView = (f: MeetingFileWithAuthor): MeetingFileView => ({
  id: f.id,
  name: f.originalName,
  mimeType: f.mimeType,
  size: f.sizeBytes,
  status: f.status,
  createdAt: f.createdAt,
  uploadedBy: { id: f.uploadedBy.id, email: f.uploadedBy.email },
  transcription: f.transcription
    ? {
        status: f.transcription.status,
        progress: f.transcription.progress,
        text: f.transcription.text,
        error: f.transcription.error,
      }
    : null,
});
