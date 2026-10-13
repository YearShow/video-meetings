import type { Meeting } from '../generated/prisma/client.js';

// Модель чтения: то, что отдаём клиенту (без ownerId и служебных полей).
export interface MeetingView {
  id: string;
  title: string;
  date: Date;
  participants: string[];
}

export const toMeetingView = (m: Meeting): MeetingView => ({
  id: m.id,
  title: m.title,
  date: m.date,
  participants: m.participants,
});
