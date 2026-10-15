'use client';

import { useEffect, useState } from 'react';
import { refreshMeetingFiles } from '@/app/meetings/[id]/actions';
import type { MeetingFile } from '@/lib/files';
import { isTranscriptionActive } from '@/lib/transcription';
import { formatDateTime, formatFileSize } from '@/lib/format';
import { DownloadButton } from './download-button';
import { TranscriptionInfo } from './transcription-info';

export const POLL_INTERVAL_MS = 3000;

// Список файлов с автообновлением: пока у какого-то файла транскрибация в очереди
// или идёт, раз в несколько секунд берём свежий список; после завершения опрос стоит.
export function MeetingFileList({
  meetingId,
  files: initial,
}: {
  meetingId: string;
  files: MeetingFile[];
}) {
  const [files, setFiles] = useState(initial);
  // Новые данные с сервера (например, после router.refresh при загрузке) главнее локальных.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setFiles(initial);
  }

  const active = files.some((f) => isTranscriptionActive(f.transcription));

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const result = await refreshMeetingFiles(meetingId);
        // Временный сбой не стирает список: следующий опрос попробует снова.
        if (!stopped && result.ok) setFiles(result.files);
      } catch {
        /* повтор на следующем тике */
      }
    }, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, meetingId]);

  const replace = (file: MeetingFile) =>
    setFiles((list) => list.map((f) => (f.id === file.id ? file : f)));

  return (
    <ul className="flex flex-col divide-y divide-separator">
      {files.map((file) => (
        <li key={file.id} className="flex flex-col gap-2 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
          </div>
          {file.transcription ? (
            <TranscriptionInfo
              meetingId={meetingId}
              fileId={file.id}
              transcription={file.transcription}
              onRetried={replace}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
