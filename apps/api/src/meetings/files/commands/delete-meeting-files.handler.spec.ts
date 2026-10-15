import type { FileStorage } from '../../../storage/file-storage.js';
import { DeleteMeetingFilesCommand } from './delete-meeting-files.command.js';
import { DeleteMeetingFilesHandler } from './delete-meeting-files.handler.js';

describe('DeleteMeetingFilesHandler', () => {
  const deletePrefix = vi.fn();
  const handler = new DeleteMeetingFilesHandler({
    deletePrefix,
  } as unknown as FileStorage);

  beforeEach(() => vi.resetAllMocks());

  it('удаляет из хранилища префикс именно этой встречи', async () => {
    await handler.execute(new DeleteMeetingFilesCommand('m1'));

    expect(deletePrefix).toHaveBeenCalledWith('meetings/m1');
  });

  it.each(['', '..', '../x', 'a/b'])(
    'id %j отклоняется, чтобы не снести чужие файлы',
    async (id) => {
      await expect(
        handler.execute(new DeleteMeetingFilesCommand(id)),
      ).rejects.toThrow();
      expect(deletePrefix).not.toHaveBeenCalled();
    },
  );
});
