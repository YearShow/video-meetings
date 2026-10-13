import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard, type AuthUser } from '../auth/jwt-auth.guard.js';
import { CreateMeetingCommand } from './commands/create-meeting.command.js';
import { CreateMeetingDto } from './meetings.dto.js';
import { GetMeetingQuery } from './queries/get-meeting.query.js';
import { GetMeetingsQuery } from './queries/get-meetings.query.js';

@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMeetingDto) {
    return this.commandBus.execute(
      new CreateMeetingCommand(
        user.id,
        dto.title,
        new Date(dto.date),
        dto.participants,
      ),
    );
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.queryBus.execute(new GetMeetingsQuery(user.id));
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.queryBus.execute(new GetMeetingQuery(user.id, id));
  }
}
