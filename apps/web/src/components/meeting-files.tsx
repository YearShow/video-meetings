import { Card } from '@heroui/react';
import { MeetingFileList } from './meeting-file-list';
import { FileUpload } from './file-upload';
import type { FilesResult } from '@/lib/files';

const ERROR_MESSAGES = {
  forbidden: 'У вас нет доступа к файлам этой встречи.',
  unavailable: 'Не удалось загрузить список файлов. Обновите страницу позже.',
} satisfies Record<Extract<FilesResult, { ok: false }>['reason'], string>;

export function MeetingFiles({
  meetingId,
  result,
  maxUploadBytes,
}: {
  meetingId: string;
  result: FilesResult;
  maxUploadBytes: number;
}) {
  const files = result.ok ? result.files : [];
  return (
    <Card role="region" aria-labelledby="files-heading">
      <Card.Header>
        <Card.Title id="files-heading" className="text-lg">
          Файлы
        </Card.Title>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        {result.ok ? (
          <FileUpload meetingId={meetingId} maxBytes={maxUploadBytes} />
        ) : null}
        {!result.ok ? (
          <p role="alert" className="py-6 text-center text-danger">
            {ERROR_MESSAGES[result.reason]}
          </p>
        ) : files.length === 0 ? (
          <p className="py-6 text-center text-muted">Файлов пока нет.</p>
        ) : (
          <MeetingFileList meetingId={meetingId} files={files} />
        )}
      </Card.Content>
    </Card>
  );
}
