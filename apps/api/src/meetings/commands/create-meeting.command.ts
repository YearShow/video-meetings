import { Command } from '@nestjs/cqrs';
import type { MeetingView } from '../meeting.view.js';

export class CreateMeetingCommand extends Command<MeetingView> {
  constructor(
    public readonly ownerId: string,
    public readonly title: string,
    public readonly date: Date,
    public readonly participants: string[],
  ) {
    super();
  }
}
