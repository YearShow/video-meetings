import type { Metadata } from 'next';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Регистрация — Video Meetings',
};

export default function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-accent/10 via-background to-background p-6">
      <RegisterForm />
    </main>
  );
}
