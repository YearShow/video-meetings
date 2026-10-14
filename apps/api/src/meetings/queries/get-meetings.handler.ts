import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MeetingAccessService } from '../meeting-access.service.js';
import {
  meetingInclude,
  toMeetingView,
  type MeetingView,
} from '../meeting.view.js';
import { GetMeetingsQuery } from './get-meetings.query.js';

@QueryHandler(GetMeetingsQuery)
export class GetMeetingsHandler implements IQueryHandler<GetMeetingsQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MeetingAccessService,
  ) {}

  async execute(query: GetMeetingsQuery): Promise<MeetingView[]> {
    const meetings = await this.prisma.meeting.findMany({
      where: this.access.accessibleBy(query.userId),
      include: meetingInclude,
      orderBy: { date: 'asc' },
    });
    return meetings.map(toMeetingView);
  }
}
