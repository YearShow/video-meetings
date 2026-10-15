'use server';

import { API_URL } from '@/lib/api';
import { apiFetch } from '@/lib/meetings';
import { isNextControlFlow } from '@/lib/next-errors';
import { getAccessToken } from '@/lib/session';

export type DownloadLinkResult = { url: string } | { error: string };

// Браузер скачивает файл навигацией и не может передать JWT в заголовке,
// поэтому берём у api короткоживущую ссылку (60 с) от имени пользователя.
export async function getDownloadLink(
  meetingId: string,
  fileId: string,
): Promise<DownloadLinkResult> {
  let res: Response;
  try {
    res = await apiFetch(
      `/meetings/${encodeURIComponent(meetingId)}/files/${encodeURIComponent(fileId)}/download-link`,
      { method: 'POST' },
    );
  } catch (error) {
    // redirect() на логин при 401 — не ошибка сети.
    if (isNextControlFlow(error)) throw error;
    return { error: 'Сервер недоступен, попробуйте позже' };
  }
  if (res.status === 403 || res.status === 404) {
    return { error: 'Файл недоступен: возможно, он удалён или нет доступа' };
  }
  if (!res.ok) {
    return { error: 'Не удалось начать скачивание, попробуйте позже' };
  }
  const { url } = (await res.json()) as { url: string };
  return { url: `${API_URL}${url}` };
}

export type UploadCredentialsResult =
  { token: string; apiUrl: string } | { error: string };

// Загрузка идёт напрямую из браузера в api (XHR с прогрессом и отменой), а JWT лежит
// в httpOnly-cookie, поэтому отдаём его клиенту на время одной загрузки.
export async function getUploadCredentials(): Promise<UploadCredentialsResult> {
  const token = await getAccessToken();
  if (!token) return { error: 'Сессия истекла, войдите заново' };
  return { token, apiUrl: API_URL };
}
