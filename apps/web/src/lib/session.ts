import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from './api';

// Совпадает со сроком жизни JWT в api (1 час): cookie не переживёт токен.
const SESSION_SECONDS = 60 * 60;

export async function setSession(accessToken: string) {
  (await cookies()).set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

export async function getAccessToken() {
  return (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
}

export async function clearSession() {
  (await cookies()).delete(ACCESS_TOKEN_COOKIE);
}
