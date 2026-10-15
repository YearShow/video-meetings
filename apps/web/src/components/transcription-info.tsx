'use client';

import { Button, Chip, ProgressBar } from '@heroui/react';
import { useState } from 'react';
import { retryTranscription } from '@/app/meetings/[id]/actions';
import type { MeetingFile } from '@/lib/files';
import type { Transcription } from '@/lib/transcription';

const LABELS: Record<Transcription['status'], string> = {
  QUEUED: 'В очереди',
  IN_PROGRESS: 'В процессе',
  DONE: 'Готово',
  ERROR: 'Ошибка',
};

const COLORS = {
  QUEUED: 'default',
  IN_PROGRESS: 'accent',
  DONE: 'success',
  ERROR: 'danger',
} as const;

export function TranscriptionInfo({
  meetingId,
  fileId,
  transcription,
  onRetried,
}: {
  meetingId: string;
  fileId: string;
  transcription: Transcription;
  onRetried: (file: MeetingFile) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status, progress, text } = transcription;

  async function retry() {
    setPending(true);
    setError(null);
    try {
      const result = await retryTranscription(meetingId, fileId);
      if ('error' in result) setError(result.error);
      else onRetried(result.file);
    } catch {
      setError('Сервер недоступен, попробуйте позже');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="transcription">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Транскрибация:</span>
        <Chip color={COLORS[status]} size="sm">
          {LABELS[status]}
          {status === 'IN_PROGRESS' ? ` ${progress}%` : ''}
        </Chip>
      </div>
      {status === 'IN_PROGRESS' ? (
        <ProgressBar
          aria-label="Прогресс транскрибации"
          value={progress}
          size="sm"
        >
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      ) : null}
      {status === 'DONE' ? (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2 underline">
            Показать текст
          </summary>
          {text ? (
            <p className="max-h-80 overflow-y-auto rounded-lg bg-surface-secondary p-3 break-words whitespace-pre-wrap">
              {text}
            </p>
          ) : (
            <p className="text-muted">Речь в записи не распознана.</p>
          )}
        </details>
      ) : null}
      {status === 'ERROR' ? (
        <div className="flex flex-col items-start gap-1">
          <p role="alert" className="text-sm text-danger">
            {transcription.error ?? 'Не удалось выполнить транскрибацию'}
          </p>
          <Button
            variant="secondary"
            className="min-h-11"
            isPending={pending}
            onPress={retry}
          >
            Повторить
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
