'use server';

import { redirect } from 'next/navigation';
import { API_URL } from '@/lib/api';
import { setSession } from '@/lib/session';

export interface RegisterState {
  error?: string;
  email?: string;
  fieldErrors?: Partial<
    Record<'email' | 'password' | 'confirmPassword', string>
  >;
}

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export async function register(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return {
      email,
      fieldErrors: {
        password: `Пароль должен содержать от ${MIN_PASSWORD_LENGTH} до ${MAX_PASSWORD_LENGTH} символов`,
      },
    };
  }
  if (password !== confirm) {
    return { email, fieldErrors: { confirmPassword: 'Пароли не совпадают' } };
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return { email, error: 'Сервер недоступен, попробуйте позже' };
  }

  if (res.status === 409) {
    return { email, fieldErrors: { email: 'Этот email уже зарегистрирован' } };
  }
  if (res.status === 400) {
    return { email, error: 'Проверьте email и пароль' };
  }
  if (!res.ok) {
    return { email, error: 'Не удалось зарегистрироваться, попробуйте позже' };
  }

  const { accessToken } = (await res.json()) as { accessToken: string };
  await setSession(accessToken);
  redirect('/');
}
