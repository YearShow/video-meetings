'use client';

import { Button } from '@heroui/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getUploadCredentials } from '@/app/meetings/[id]/actions';
import { formatFileSize } from '@/lib/format';
import { uploadFile, type UploadFailure } from '@/lib/upload';

const FAILURE_MESSAGES: Record<Exclude<UploadFailure, 'aborted'>, string> = {
  'too-large': 'Файл больше допустимого размера: сервер отклонил загрузку.',
  unauthorized: 'Сессия истекла, войдите заново.',
  forbidden: 'У вас нет доступа к файлам этой встречи.',
  'not-found': 'Встреча не найдена: возможно, она удалена.',
  rejected: 'Сервер не принял файл. Выберите другой файл.',
  network: 'Не удалось отправить файл: проверьте соединение.',
  server: 'Сервер не смог принять файл. Попробуйте ещё раз.',
};

type State =
  | { status: 'idle'; message?: string; error?: string }
  | { status: 'uploading'; file: File; percent: number }
  | { status: 'failed'; file: File; reason: Exclude<UploadFailure, 'aborted'> };

// Ошибки, после которых повтор того же файла не поможет.
const NO_RETRY: UploadFailure[] = [
  'unauthorized',
  'forbidden',
  'not-found',
  'rejected',
];

export function FileUpload({
  meetingId,
  maxBytes,
}: {
  meetingId: string;
  maxBytes: number;
}) {
  const limitText = formatFileSize(maxBytes);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<State>({ status: 'idle' });
  const [dragging, setDragging] = useState(false);
  const mountedRef = useRef(true);

  // Уход со страницы прерывает загрузку и не даёт обновить состояние и чужой маршрут.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  async function start(file: File) {
    if (file.size > maxBytes) {
      setState({
        status: 'idle',
        error: `Файл «${file.name}» (${formatFileSize(file.size)}) больше ${limitText}, загрузка не начата.`,
      });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'uploading', file, percent: 0 });

    let result;
    try {
      const credentials = await getUploadCredentials();
      if (controller.signal.aborted) {
        result = { ok: false, reason: 'aborted' } as const;
      } else if ('error' in credentials) {
        result = { ok: false, reason: 'unauthorized' } as const;
      } else {
        result = await uploadFile({
          url: `${credentials.apiUrl}/meetings/${encodeURIComponent(meetingId)}/files`,
          token: credentials.token,
          file,
          signal: controller.signal,
          onProgress: (percent) =>
            setState((s) => (s.status === 'uploading' ? { ...s, percent } : s)),
        });
      }
    } catch {
      result = { ok: false, reason: 'network' } as const;
    }
    abortRef.current = null;
    if (!mountedRef.current) return;

    if (result.ok) {
      setState({ status: 'idle', message: `Файл «${file.name}» загружен.` });
      router.refresh();
    } else if (result.reason === 'aborted') {
      setState({ status: 'idle', message: 'Загрузка отменена.' });
      // Файл мог целиком дойти до api раньше отмены: сверяем список с сервером.
      router.refresh();
    } else {
      setState({ status: 'failed', file, reason: result.reason });
    }
  }

  function pick(files: FileList | File[]) {
    if (files.length === 0) return;
    if (files.length > 1) {
      setState({
        status: 'idle',
        error: 'Можно загрузить только один файл за раз.',
      });
      return;
    }
    void start(files[0]);
  }

  const uploading = state.status === 'uploading';

  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!uploading) pick(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center sm:p-6 ${
          dragging ? 'border-accent bg-accent/10' : 'border-separator'
        }`}
      >
        <p className="text-sm text-muted">
          Перетащите файл сюда или выберите на устройстве (до {limitText}).
        </p>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-label="Файл для загрузки"
          disabled={uploading}
          onChange={(e) => {
            pick(e.target.files ?? []);
            e.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          className="min-h-11"
          isDisabled={uploading}
          onPress={() => inputRef.current?.click()}
        >
          Выбрать файл
        </Button>
      </div>

      {state.status === 'uploading' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 break-all">{state.file.name}</span>
            <span aria-hidden="true">{state.percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`Загрузка ${state.file.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.percent}
            className="h-2 w-full overflow-hidden rounded-full bg-separator"
          >
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${state.percent}%` }}
            />
          </div>
          <Button
            variant="secondary"
            className="min-h-11 self-start"
            onPress={() => abortRef.current?.abort()}
          >
            Отменить
          </Button>
        </div>
      ) : null}

      {state.status === 'failed' ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm text-danger">
            {FAILURE_MESSAGES[state.reason]}
          </p>
          {state.reason === 'unauthorized' ? (
            <Link
              href="/auth/expired"
              className="inline-flex min-h-11 items-center text-sm underline"
            >
              Войти заново
            </Link>
          ) : NO_RETRY.includes(state.reason) ? null : (
            <Button
              variant="secondary"
              className="min-h-11"
              onPress={() => void start(state.file)}
            >
              Повторить
            </Button>
          )}
        </div>
      ) : null}

      {state.status === 'idle' && state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.status === 'idle' && state.message ? (
        <p role="status" className="text-sm text-muted">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
