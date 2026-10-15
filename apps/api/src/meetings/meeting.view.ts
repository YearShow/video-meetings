import type { Prisma } from '../generated/prisma/client.js';

export const meetingInclude = {
  participants: { orderBy: { email: 'asc' } },
} satisfies Prisma.MeetingInclude;

export type MeetingWithParticipants = Prisma.MeetingGetPayload<{
  include: typeof meetingInclude;
}>;

export interface ParticipantView {
  email: string;
  userId: string;
}

// Модель чтения: то, что отдаём клиенту (без ownerId и служебных полей).
export interface MeetingView {
  id: string;
  title: string;
  date: Date;
  participants: ParticipantView[];
}

export const toMeetingView = (m: MeetingWithParticipants): MeetingView => ({
  id: m.id,
  title: m.title,
  date: m.date,
  participants: m.participants.map((p) => ({
    email: p.email,
    userId: p.userId,
  })),
});
