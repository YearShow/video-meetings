import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/api';

// Оптимистичная проверка: без cookie сразу ведём на логин.
// Настоящая проверка токена происходит в api (401 → /auth/expired).
export function proxy(request: NextRequest) {
  if (!request.cookies.has(ACCESS_TOKEN_COOKIE)) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/',
};
