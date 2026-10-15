import { Card } from '@heroui/react';
import type { MeetingFile } from '@/lib/files';
import { formatDateTime, formatFileSize } from '@/lib/format';

export function MeetingFiles({ files }: { files: MeetingFile[] }) {
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
              <li key={file.id} className="flex flex-col gap-0.5 py-3">
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
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}
