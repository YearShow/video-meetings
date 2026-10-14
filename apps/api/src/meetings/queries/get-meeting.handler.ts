import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MeetingAccessService } from '../meeting-access.service.js';
import {
  meetingInclude,
  toMeetingView,
  type MeetingView,
} from '../meeting.view.js';
import { GetMeetingQuery } from './get-meeting.query.js';

@QueryHandler(GetMeetingQuery)
export class GetMeetingHandler implements IQueryHandler<GetMeetingQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MeetingAccessService,
  ) {}

  async execute(query: GetMeetingQuery): Promise<MeetingView> {
    // Недоступная встреча неотличима от несуществующей (404).
    const meeting = await this.prisma.meeting.findFirst({
      where: {
        id: query.meetingId,
        ...this.access.accessibleBy(query.userId),
      },
      include: meetingInclude,
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    return toMeetingView(meeting);
  }
}
