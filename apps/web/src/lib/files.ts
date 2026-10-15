import { isNextControlFlow } from './next-errors';
import { apiFetch } from './meetings';

export interface MeetingFile {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  uploadedBy: { id: string; email: string };
}

// forbidden — встреча недоступна пользователю (api отвечает 403/404),
// unavailable — api не ответил или упал.
export type FilesResult =
  | { ok: true; files: MeetingFile[] }
  | { ok: false; reason: 'forbidden' | 'unavailable' };

export async function getMeetingFiles(meetingId: string): Promise<FilesResult> {
  let res: Response;
  try {
    res = await apiFetch(`/meetings/${encodeURIComponent(meetingId)}/files`);
  } catch (error) {
    // redirect() внутри apiFetch тоже бросает исключение: его пропускаем.
    if (isNextControlFlow(error)) throw error;
    return { ok: false, reason: 'unavailable' };
  }
  if (res.status === 403 || res.status === 404) {
    return { ok: false, reason: 'forbidden' };
  }
  if (!res.ok) return { ok: false, reason: 'unavailable' };
  return { ok: true, files: await res.json() };
}
