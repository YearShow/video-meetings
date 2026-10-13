'use server';

import { redirect } from 'next/navigation';
import { API_URL } from '@/lib/api';
import { setSession } from '@/lib/session';

export interface LoginState {
  error?: string;
  email?: string;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return { email, error: 'Сервер недоступен, попробуйте позже' };
  }

  if (res.status === 401) {
    return { email, error: 'Неверный email или пароль' };
  }
  if (res.status === 400) {
    return { email, error: 'Проверьте email и пароль' };
  }
  if (!res.ok) {
    return { email, error: 'Не удалось войти, попробуйте позже' };
  }

  const { accessToken } = (await res.json()) as { accessToken: string };
  await setSession(accessToken);
  redirect('/');
}
