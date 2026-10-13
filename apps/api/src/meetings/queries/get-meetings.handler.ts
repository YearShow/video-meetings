import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toMeetingView, type MeetingView } from '../meeting.view.js';
import { GetMeetingsQuery } from './get-meetings.query.js';

@QueryHandler(GetMeetingsQuery)
export class GetMeetingsHandler implements IQueryHandler<GetMeetingsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetMeetingsQuery): Promise<MeetingView[]> {
    const meetings = await this.prisma.meeting.findMany({
      where: { ownerId: query.ownerId },
      orderBy: { date: 'asc' },
    });
    return meetings.map(toMeetingView);
  }
}
