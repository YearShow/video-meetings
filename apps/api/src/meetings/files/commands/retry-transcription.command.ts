import { Command } from '@nestjs/cqrs';
import type { MeetingFileView } from '../file.view.js';

export class RetryTranscriptionCommand extends Command<MeetingFileView> {
  constructor(
    public readonly userId: string,
    public readonly meetingId: string,
    public readonly fileId: string,
  ) {
    super();
  }
}
