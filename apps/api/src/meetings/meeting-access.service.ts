import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Единое правило доступа к встрече: её видят владелец и участники (по id пользователя).
// Используйте его во всех запросах и командах, которые работают со встречей и её данными.
@Injectable()
export class MeetingAccessService {
  constructor(private readonly prisma: PrismaService) {}

  // Условие для where: встречи, доступные пользователю.
  accessibleBy(userId: string): Prisma.MeetingWhereInput {
    return {
      OR: [{ ownerId: userId }, { participants: { some: { userId } } }],
    };
  }

  async hasAccess(meetingId: string, userId: string): Promise<boolean> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, ...this.accessibleBy(userId) },
      select: { id: true },
    });
    return meeting !== null;
  }
}
