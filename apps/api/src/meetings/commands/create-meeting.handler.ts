import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  meetingInclude,
  toMeetingView,
  type MeetingView,
} from '../meeting.view.js';
import { CreateMeetingCommand } from './create-meeting.command.js';

@CommandHandler(CreateMeetingCommand)
export class CreateMeetingHandler implements ICommandHandler<CreateMeetingCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateMeetingCommand): Promise<MeetingView> {
    // Email нормализуется так же, как при регистрации (нижний регистр).
    const emails = [
      ...new Set(command.participants.map((e) => e.trim().toLowerCase())),
    ];
    const users =
      emails.length > 0
        ? await this.prisma.user.findMany({
            where: { email: { in: emails } },
            select: { id: true, email: true },
          })
        : [];

    // Участником может быть только пользователь с аккаунтом.
    const known = new Set(users.map((u) => u.email));
    const unknown = emails.filter((e) => !known.has(e));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Пользователи не найдены: ${unknown.join(', ')}`,
      );
    }

    const meeting = await this.prisma.meeting.create({
      data: {
        ownerId: command.ownerId,
        title: command.title,
        date: command.date,
        participants: {
          // Владелец уже имеет доступ как создатель, отдельной строкой он не нужен.
          create: users
            .filter((u) => u.id !== command.ownerId)
            .map((u) => ({ userId: u.id, email: u.email })),
        },
      },
      include: meetingInclude,
    });
    return toMeetingView(meeting);
  }
}
