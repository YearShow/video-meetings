import type { PrismaService } from '../prisma/prisma.service.js';
import { MeetingAccessService } from './meeting-access.service.js';

describe('MeetingAccessService', () => {
  const findFirst = vi.fn();
  const service = new MeetingAccessService({
    meeting: { findFirst },
  } as unknown as PrismaService);

  beforeEach(() => vi.resetAllMocks());

  it('accessibleBy допускает владельца и участника по id пользователя', () => {
    expect(service.accessibleBy('u1')).toEqual({
      OR: [{ ownerId: 'u1' }, { participants: { some: { userId: 'u1' } } }],
    });
  });

  it('hasAccess ищет встречу по id с условием доступа', async () => {
    findFirst.mockResolvedValue({ id: 'm1' });

    await service.hasAccess('m1', 'u1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1', ...service.accessibleBy('u1') },
      }),
    );
  });

  it.each([
    ['владелец или участник', { id: 'm1' }, true],
    ['посторонний', null, false],
  ])('hasAccess: %s', async (_name, found, expected) => {
    findFirst.mockResolvedValue(found);

    await expect(service.hasAccess('m1', 'u1')).resolves.toBe(expected);
  });
});
