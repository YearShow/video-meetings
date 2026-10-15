export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // как в api по умолчанию

export type UploadFailure =
  'aborted' | 'too-large' | 'unauthorized' | 'forbidden' | 'network' | 'server';

export type UploadResult = { ok: true } | { ok: false; reason: UploadFailure };

interface UploadOptions {
  url: string;
  token: string;
  file: File;
  onProgress: (percent: number) => void;
  signal: AbortSignal;
}

function failureFromStatus(status: number): UploadFailure {
  if (status === 401) return 'unauthorized';
  if (status === 403 || status === 404) return 'forbidden';
  if (status === 413) return 'too-large';
  return 'server';
}

// fetch не умеет прогресс отправки, поэтому XHR. Промис не отклоняется:
// исход (в т. ч. отмена) приходит в результате.
export function uploadFile({
  url,
  token,
  file,
  onProgress,
  signal,
}: UploadOptions): Promise<UploadResult> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve({ ok: false, reason: 'aborted' });
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const finish = (result: UploadResult) => {
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    };

    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(
          Math.min(100, Math.round((event.loaded / event.total) * 100)),
        );
      }
    };
    xhr.onload = () =>
      finish(
        xhr.status >= 200 && xhr.status < 300
          ? { ok: true }
          : { ok: false, reason: failureFromStatus(xhr.status) },
      );
    // Сервер может ответить 413 и закрыть соединение до конца отправки:
    // браузер тогда сообщает об ошибке сети, а не о статусе.
    xhr.onerror = () => finish({ ok: false, reason: 'network' });
    xhr.onabort = () => finish({ ok: false, reason: 'aborted' });

    const body = new FormData();
    body.append('file', file);
    xhr.send(body);
  });
}
