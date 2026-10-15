import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module.js';
import { CreateMeetingHandler } from './commands/create-meeting.handler.js';
import { StorageModule } from '../storage/storage.module.js';
import { UploadMeetingFileHandler } from './files/commands/upload-meeting-file.handler.js';
import { GetMeetingFilesHandler } from './files/queries/get-meeting-files.handler.js';
import { MeetingFilesController } from './files/meeting-files.controller.js';
import { DeleteMeetingFilesHandler } from './files/commands/delete-meeting-files.handler.js';
import { DownloadTokenGuard } from './files/download-token.guard.js';
import { DownloadTokenService } from './files/download-token.service.js';
import { MeetingFileContentController } from './files/meeting-file-content.controller.js';
import { MeetingFilesService } from './files/meeting-files.service.js';
import { CreateDownloadLinkHandler } from './files/queries/create-download-link.handler.js';
import { GetMeetingFileContentHandler } from './files/queries/get-meeting-file-content.handler.js';
import { MeetingAccessGuard } from './meeting-access.guard.js';
import { MeetingAccessService } from './meeting-access.service.js';
import { MeetingsController } from './meetings.controller.js';
import { GetMeetingHandler } from './queries/get-meeting.handler.js';
import { GetMeetingsHandler } from './queries/get-meetings.handler.js';

@Module({
  imports: [CqrsModule, AuthModule, StorageModule],
  controllers: [
    MeetingsController,
    MeetingFilesController,
    MeetingFileContentController,
  ],
  providers: [
    MeetingAccessService,
    MeetingAccessGuard,
    MeetingFilesService,
    DownloadTokenService,
    DownloadTokenGuard,
    UploadMeetingFileHandler,
    DeleteMeetingFilesHandler,
    CreateDownloadLinkHandler,
    GetMeetingFileContentHandler,
    GetMeetingFilesHandler,
    CreateMeetingHandler,
    GetMeetingsHandler,
    GetMeetingHandler,
  ],
  exports: [MeetingAccessService],
})
export class MeetingsModule {}
