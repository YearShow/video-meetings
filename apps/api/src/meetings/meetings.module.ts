import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module.js';
import { CreateMeetingHandler } from './commands/create-meeting.handler.js';
import { StorageModule } from '../storage/storage.module.js';
import { UploadMeetingFileHandler } from './files/commands/upload-meeting-file.handler.js';
import { GetMeetingFilesHandler } from './files/queries/get-meeting-files.handler.js';
import { MeetingFilesController } from './files/meeting-files.controller.js';
import { MeetingAccessGuard } from './meeting-access.guard.js';
import { MeetingAccessService } from './meeting-access.service.js';
import { MeetingsController } from './meetings.controller.js';
import { GetMeetingHandler } from './queries/get-meeting.handler.js';
import { GetMeetingsHandler } from './queries/get-meetings.handler.js';

@Module({
  imports: [CqrsModule, AuthModule, StorageModule],
  controllers: [MeetingsController, MeetingFilesController],
  providers: [
    MeetingAccessService,
    MeetingAccessGuard,
    UploadMeetingFileHandler,
    GetMeetingFilesHandler,
    CreateMeetingHandler,
    GetMeetingsHandler,
    GetMeetingHandler,
  ],
  exports: [MeetingAccessService],
})
export class MeetingsModule {}
