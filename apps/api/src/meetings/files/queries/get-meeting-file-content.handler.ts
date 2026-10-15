import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  FILE_STORAGE,
  StorageObjectNotFoundError,
  type FileStorage,
} from '../../../storage/file-storage.js';
import { MeetingFilesService } from '../meeting-files.service.js';
import {
  GetMeetingFileContentQuery,
  type MeetingFileContent,
} from './get-meeting-file-content.query.js';

@QueryHandler(GetMeetingFileContentQuery)
export class GetMeetingFileContentHandler implements IQueryHandler<GetMeetingFileContentQuery> {
  private readonly logger = new Logger(GetMeetingFileContentHandler.name);

  constructor(
    private readonly files: MeetingFilesService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async execute(
    query: GetMeetingFileContentQuery,
  ): Promise<MeetingFileContent> {
    const file = await this.files.getAccessible(
      query.userId,
      query.meetingId,
      query.fileId,
    );
    try {
      const content = await this.storage.read(file.storageKey);
      return { name: file.originalName, size: file.sizeBytes, content };
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) {
        // Запись есть, а данных в хранилище нет: расхождение, о котором нужно знать.
        this.logger.error(`File ${file.id} is missing in storage`);
        throw new NotFoundException('File not found');
      }
      throw error;
    }
  }
}
