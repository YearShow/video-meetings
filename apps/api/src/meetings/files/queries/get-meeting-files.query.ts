import { Query } from '@nestjs/cqrs';
import type { MeetingFileView } from '../file.view.js';

export class GetMeetingFilesQuery extends Query<MeetingFileView[]> {
  constructor(
    public readonly userId: string,
    public readonly meetingId: string,
  ) {
    super();
  }
}
