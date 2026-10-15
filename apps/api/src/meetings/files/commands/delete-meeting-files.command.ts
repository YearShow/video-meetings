import { Command } from '@nestjs/cqrs';

// Удаляет из хранилища все файлы встречи. Записи в БД удаляются каскадом вместе
// со встречей; команду вызывает тот, кто удаляет встречу (внутренняя, без проверки доступа).
export class DeleteMeetingFilesCommand extends Command<void> {
  constructor(public readonly meetingId: string) {
    super();
  }
}
