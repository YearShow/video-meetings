'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/meetings';
import { clearSession } from '@/lib/session';

export interface CreateMeetingState {
  error?: string;
  fieldErrors?: Partial<Record<'title' | 'date' | 'participants', string>>;
  values?: { title: string; date: string; participants: string };
  created?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function logout() {
  await clearSession();
  redirect('/auth/login');
}

export async function createMeeting(
  prev: CreateMeetingState,
  formData: FormData,
): Promise<CreateMeetingState> {
  const title = String(formData.get('title') ?? '').trim();
  const date = String(formData.get('date') ?? '');
  const participantsRaw = String(formData.get('participants') ?? '');
  const values = { title, date, participants: participantsRaw };

  const participants = participantsRaw
    .split(/[\s,;]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const fieldErrors: NonNullable<CreateMeetingState['fieldErrors']> = {};
  if (!title) fieldErrors.title = 'Введите название встречи';
  if (title.length > 200) fieldErrors.title = 'Не более 200 символов';
  if (!date || Number.isNaN(Date.parse(date))) {
    fieldErrors.date = 'Укажите дату и время';
  }
  const bad = participants.find((p) => !EMAIL_RE.test(p));
  if (bad) fieldErrors.participants = `Некорректный email: ${bad}`;
  if (participants.length > 100) {
    fieldErrors.participants = 'Не более 100 участников';
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { values, fieldErrors };
  }

  let res: Response;
  try {
    res = await apiFetch('/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        date: new Date(date).toISOString(),
        participants,
      }),
    });
  } catch {
    return { values, error: 'Сервер недоступен, попробуйте позже' };
  }
  if (!res.ok) {
    return { values, error: 'Не удалось создать встречу, попробуйте позже' };
  }

  revalidatePath('/');
  return { created: (prev.created ?? 0) + 1 };
}
