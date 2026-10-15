import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../../storage/file-storage.js';
import { DeleteMeetingFilesCommand } from './delete-meeting-files.command.js';

// Id встречи — uuid; пустая строка или `..` дали бы префикс шире одной встречи.
const MEETING_ID_PATTERN = /^[\w-]+$/;

@CommandHandler(DeleteMeetingFilesCommand)
export class DeleteMeetingFilesHandler implements ICommandHandler<DeleteMeetingFilesCommand> {
  constructor(@Inject(FILE_STORAGE) private readonly storage: FileStorage) {}

  async execute(command: DeleteMeetingFilesCommand): Promise<void> {
    if (!MEETING_ID_PATTERN.test(command.meetingId)) {
      throw new Error(
        `Invalid meeting id: ${JSON.stringify(command.meetingId)}`,
      );
    }
    await this.storage.deletePrefix(`meetings/${command.meetingId}`);
  }
}
