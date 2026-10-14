import { Query } from '@nestjs/cqrs';
import type { MeetingView } from '../meeting.view.js';

export class GetMeetingQuery extends Query<MeetingView> {
  constructor(
    public readonly userId: string,
    public readonly meetingId: string,
  ) {
    super();
  }
}
