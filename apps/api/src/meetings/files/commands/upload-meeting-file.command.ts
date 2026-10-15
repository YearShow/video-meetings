import { Command } from '@nestjs/cqrs';
import type { Readable } from 'node:stream';
import type { MeetingFileView } from '../file.view.js';

export class UploadMeetingFileCommand extends Command<MeetingFileView> {
  constructor(
    public readonly userId: string,
    public readonly meetingId: string,
    public readonly fileName: string,
    public readonly mimeType: string,
    public readonly content: Readable,
  ) {
    super();
  }
}
