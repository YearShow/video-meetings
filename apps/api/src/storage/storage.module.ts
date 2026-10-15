import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FILE_STORAGE } from './file-storage.js';
import { LocalDiskStorage } from './local-disk.storage.js';

@Module({
  providers: [
    {
      provide: FILE_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new LocalDiskStorage(config.getOrThrow<string>('FILES_DIR')),
    },
  ],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
