import type { Prisma } from '../../generated/prisma/client.js';

export const fileInclude = {
  uploadedBy: { select: { id: true, email: true } },
} satisfies Prisma.MeetingFileInclude;

export type MeetingFileWithAuthor = Prisma.MeetingFileGetPayload<{
  include: typeof fileInclude;
}>;

// Модель чтения: без storageKey и других внутренних полей.
export interface MeetingFileView {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  status: 'UPLOADED';
  createdAt: Date;
  uploadedBy: { id: string; email: string };
}

export const toFileView = (f: MeetingFileWithAuthor): MeetingFileView => ({
  id: f.id,
  name: f.originalName,
  mimeType: f.mimeType,
  size: f.sizeBytes,
  status: f.status,
  createdAt: f.createdAt,
  uploadedBy: { id: f.uploadedBy.id, email: f.uploadedBy.email },
});
