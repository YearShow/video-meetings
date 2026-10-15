import { Injectable, NotFoundException } from '@nestjs/common';
import type { MeetingFile } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MeetingAccessService } from '../meeting-access.service.js';

@Injectable()
export class MeetingFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MeetingAccessService,
  ) {}

  // Файл, к которому у пользователя есть доступ. Файл ищется внутри встречи из пути,
  // а не только по fileId; чужая встреча и чужой файл неотличимы от несуществующих (404).
  async getAccessible(
    userId: string,
    meetingId: string,
    fileId: string,
  ): Promise<MeetingFile> {
    if (!(await this.access.hasAccess(meetingId, userId))) {
      throw new NotFoundException('Meeting not found');
    }
    const file = await this.prisma.meetingFile.findFirst({
      where: { id: fileId, meetingId },
    });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }
}
