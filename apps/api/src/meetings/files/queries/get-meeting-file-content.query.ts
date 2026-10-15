import { Query } from '@nestjs/cqrs';
import type { Readable } from 'node:stream';

export interface MeetingFileContent {
  name: string;
  size: number;
  content: Readable;
}

export class GetMeetingFileContentQuery extends Query<MeetingFileContent> {
  constructor(
    public readonly userId: string,
    public readonly meetingId: string,
    public readonly fileId: string,
  ) {
    super();
  }
}
