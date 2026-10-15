import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MeetingAccessService } from '../../meeting-access.service.js';
import { fileInclude, toFileView, type MeetingFileView } from '../file.view.js';
import { GetMeetingFilesQuery } from './get-meeting-files.query.js';

@QueryHandler(GetMeetingFilesQuery)
export class GetMeetingFilesHandler implements IQueryHandler<GetMeetingFilesQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MeetingAccessService,
  ) {}

  async execute(query: GetMeetingFilesQuery): Promise<MeetingFileView[]> {
    // Доступ проверяется и здесь, а не только в guard: правило не обходится другим входом.
    if (!(await this.access.hasAccess(query.meetingId, query.userId))) {
      throw new NotFoundException('Meeting not found');
    }
    const files = await this.prisma.meetingFile.findMany({
      where: { meetingId: query.meetingId },
      include: fileInclude,
      // Новые сверху; id как стабильный вторичный ключ при одинаковом времени.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return files.map(toFileView);
  }
}
