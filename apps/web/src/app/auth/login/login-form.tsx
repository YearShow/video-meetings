'use client';

import {
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  TextField,
} from '@heroui/react';
import Link from 'next/link';
import { useActionState } from 'react';
import { PasswordField } from '@/components/password-field';
import { login, type LoginState } from './actions';

const initialState: LoginState = {};

export function LoginForm({ sessionExpired }: { sessionExpired: boolean }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <Card className="w-full max-w-md p-2">
      <Card.Header className="gap-1">
        <Card.Title className="text-2xl">Вход</Card.Title>
        <Card.Description>
          Войдите, чтобы управлять своими видеовстречами.
        </Card.Description>
      </Card.Header>
      <Form action={formAction} className="flex flex-col gap-5">
        <Card.Content className="flex flex-col gap-4">
          {sessionExpired && !state.error && (
            <p role="status" className="text-sm text-muted">
              Сессия истекла, войдите снова.
            </p>
          )}
          <TextField
            isRequired
            fullWidth
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.email}
          >
            <Label>Email</Label>
            <Input className="min-h-11" placeholder="you@example.com" />
            <FieldError />
          </TextField>
          <PasswordField
            name="password"
            label="Пароль"
            autoComplete="current-password"
            maxLength={128}
          />
          {state.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
        </Card.Content>
        <Card.Footer className="flex-col items-stretch gap-3">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isPending={pending}
          >
            Войти
          </Button>
          <p className="text-center text-sm text-muted">
            Нет аккаунта?{' '}
            <Link
              href="/register"
              className="inline-block py-3 font-medium text-accent underline underline-offset-2"
            >
              Зарегистрироваться
            </Link>
          </p>
        </Card.Footer>
      </Form>
    </Card>
  );
}
