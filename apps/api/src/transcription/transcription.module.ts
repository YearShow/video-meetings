import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { AudioExtractor } from './audio-extractor.js';
import { TranscriptionService } from './transcription.service.js';
import { WhisperRunner } from './whisper.runner.js';

@Module({
  imports: [StorageModule],
  providers: [TranscriptionService, WhisperRunner, AudioExtractor],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
