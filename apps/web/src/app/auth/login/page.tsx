import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Вход — Video Meetings',
};

// searchParams — динамические данные: читаем их под Suspense,
// чтобы остальная страница предрендерилась.
async function Form({
  searchParams,
}: Pick<PageProps<'/auth/login'>, 'searchParams'>) {
  const { expired } = await searchParams;
  return <LoginForm sessionExpired={expired === '1'} />;
}

export default function LoginPage({ searchParams }: PageProps<'/auth/login'>) {
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-accent/10 via-background to-background p-6">
      <Suspense fallback={<LoginForm sessionExpired={false} />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
