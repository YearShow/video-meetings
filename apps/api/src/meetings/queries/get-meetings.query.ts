import { Query } from '@nestjs/cqrs';
import type { MeetingView } from '../meeting.view.js';

export class GetMeetingsQuery extends Query<MeetingView[]> {
  constructor(public readonly ownerId: string) {
    super();
  }
}
