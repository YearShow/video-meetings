import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { CreateMeetingCommand } from './create-meeting.command.js';
import { CreateMeetingHandler } from './create-meeting.handler.js';

const date = new Date('2030-01-15T10:00:00.000Z');

describe('CreateMeetingHandler', () => {
  const findMany = vi.fn();
  const create = vi.fn();
  const prisma = {
    user: { findMany },
    meeting: { create },
  } as unknown as PrismaService;
  const handler = new CreateMeetingHandler(prisma);

  const command = (participants: string[]) =>
    new CreateMeetingCommand('owner-id', 'Sync', date, participants);

  beforeEach(() => {
    vi.resetAllMocks();
    create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'meeting-id',
        title: data.title,
        date: data.date,
        ownerId: data.ownerId,
        participants: data.participants.create,
      }),
    );
  });

  it('сохраняет участников с id найденных пользователей', async () => {
    findMany.mockResolvedValue([
      { id: 'u1', email: 'alice@example.com' },
      { id: 'u2', email: 'bob@example.com' },
    ]);

    const view = await handler.execute(
      command(['alice@example.com', 'bob@example.com']),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'owner-id',
          participants: {
            create: [
              { userId: 'u1', email: 'alice@example.com' },
              { userId: 'u2', email: 'bob@example.com' },
            ],
          },
        }),
      }),
    );
    expect(view.participants).toEqual([
      { userId: 'u1', email: 'alice@example.com' },
      { userId: 'u2', email: 'bob@example.com' },
    ]);
  });

  it('нормализует регистр, пробелы и убирает дубликаты email', async () => {
    findMany.mockResolvedValue([{ id: 'u1', email: 'alice@example.com' }]);

    await handler.execute(
      command(['Alice@Example.com', ' alice@example.com ']),
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { in: ['alice@example.com'] } },
      }),
    );
  });

  it('отклоняет встречу, если у участника нет аккаунта, и не пишет в БД', async () => {
    findMany.mockResolvedValue([{ id: 'u1', email: 'alice@example.com' }]);

    const result = handler.execute(
      command(['alice@example.com', 'ghost@example.com']),
    );

    await expect(result).rejects.toThrow(BadRequestException);
    await expect(result).rejects.toThrow('ghost@example.com');
    expect(create).not.toHaveBeenCalled();
  });

  it('создаёт встречу без участников и не обращается к таблице пользователей', async () => {
    const view = await handler.execute(command([]));

    expect(findMany).not.toHaveBeenCalled();
    expect(view.participants).toEqual([]);
  });
});
