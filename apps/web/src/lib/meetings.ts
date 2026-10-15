import { redirect } from 'next/navigation';
import { API_URL } from './api';
import { getAccessToken } from './session';

export interface Profile {
  id: string;
  email: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  participants: { email: string; userId: string }[];
}

export const LOGIN_PATH = '/auth/login';
// Route handler сбрасывает просроченную cookie и ведёт на логин.
export const SESSION_EXPIRED_PATH = '/auth/expired';

// Запрос к api от имени текущего пользователя; 401 означает конец сессии.
export async function apiFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  if (!token) {
    redirect(LOGIN_PATH);
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });
  if (res.status === 401) {
    redirect(SESSION_EXPIRED_PATH);
  }
  return res;
}

export async function getProfile(): Promise<Profile> {
  const res = await apiFetch('/auth/me');
  if (!res.ok) {
    throw new Error(`GET /auth/me failed: ${res.status}`);
  }
  return res.json();
}

export async function getMeetings(): Promise<Meeting[]> {
  const res = await apiFetch('/meetings');
  if (!res.ok) {
    throw new Error(`GET /meetings failed: ${res.status}`);
  }
  return res.json();
}
