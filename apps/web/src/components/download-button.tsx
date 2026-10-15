'use client';

import { Button } from '@heroui/react';
import { useState } from 'react';
import { getDownloadLink } from '@/app/meetings/[id]/actions';

export function DownloadButton({
  meetingId,
  fileId,
  fileName,
}: {
  meetingId: string;
  fileId: string;
  fileName: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const result = await getDownloadLink(meetingId, fileId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      // Имя и тип задаёт api через Content-Disposition: attachment.
      const link = document.createElement('a');
      link.href = result.url;
      link.rel = 'noopener';
      link.click();
    } catch {
      setError('Сервер недоступен, попробуйте позже');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        variant="secondary"
        className="min-h-11"
        isPending={pending}
        onPress={download}
        aria-label={`Скачать ${fileName}`}
      >
        Скачать
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
