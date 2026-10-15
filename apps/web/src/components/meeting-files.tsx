import { Card } from '@heroui/react';
import { DownloadButton } from './download-button';
import type { MeetingFile } from '@/lib/files';
import { formatDateTime, formatFileSize } from '@/lib/format';

export function MeetingFiles({
  meetingId,
  files,
}: {
  meetingId: string;
  files: MeetingFile[];
}) {
  return (
    <Card role="region" aria-labelledby="files-heading">
      <Card.Header>
        <Card.Title id="files-heading" className="text-lg">
          Файлы
        </Card.Title>
      </Card.Header>
      <Card.Content>
        {files.length === 0 ? (
          <p className="py-6 text-center text-muted">Файлов пока нет.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-separator">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium break-all">{file.name}</span>
                  <span className="text-sm text-muted">
                    {formatFileSize(file.size)} ·{' '}
                    <time dateTime={file.createdAt}>
                      {formatDateTime(file.createdAt)}
                    </time>
                  </span>
                  <span className="text-sm break-all text-muted">
                    Загрузил: {file.uploadedBy.email}
                  </span>
                </div>
                <DownloadButton
                  meetingId={meetingId}
                  fileId={file.id}
                  fileName={file.name}
                />
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}
