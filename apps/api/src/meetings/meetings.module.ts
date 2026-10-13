import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module.js';
import { CreateMeetingHandler } from './commands/create-meeting.handler.js';
import { MeetingsController } from './meetings.controller.js';
import { GetMeetingHandler } from './queries/get-meeting.handler.js';
import { GetMeetingsHandler } from './queries/get-meetings.handler.js';

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [MeetingsController],
  providers: [CreateMeetingHandler, GetMeetingsHandler, GetMeetingHandler],
})
export class MeetingsModule {}
