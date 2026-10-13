import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toMeetingView, type MeetingView } from '../meeting.view.js';
import { CreateMeetingCommand } from './create-meeting.command.js';

@CommandHandler(CreateMeetingCommand)
export class CreateMeetingHandler implements ICommandHandler<CreateMeetingCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateMeetingCommand): Promise<MeetingView> {
    const meeting = await this.prisma.meeting.create({
      data: {
        ownerId: command.ownerId,
        title: command.title,
        date: command.date,
        participants: command.participants,
      },
    });
    return toMeetingView(meeting);
  }
}
