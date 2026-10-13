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
import { useActionState, useState } from 'react';
import { register, type RegisterState } from './actions';
import { PasswordField } from '@/components/password-field';

const initialState: RegisterState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, initialState);
  const [password, setPassword] = useState('');

  return (
    <Card className="w-full max-w-md p-2">
      <Card.Header className="gap-1">
        <Card.Title className="text-2xl">Создайте аккаунт</Card.Title>
        <Card.Description>
          Зарегистрируйтесь, чтобы создавать видеовстречи и приглашать
          участников.
        </Card.Description>
      </Card.Header>
      <Form
        action={formAction}
        validationErrors={state.fieldErrors}
        className="flex flex-col gap-5"
      >
        <Card.Content className="flex flex-col gap-4">
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
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            value={password}
            onChange={setPassword}
            description="От 8 до 128 символов"
          />
          <PasswordField
            name="confirmPassword"
            label="Повторите пароль"
            autoComplete="new-password"
            placeholder="Введите пароль ещё раз"
            validate={(value) =>
              value && value !== password ? 'Пароли не совпадают' : null
            }
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
            Зарегистрироваться
          </Button>
          <p className="text-center text-sm text-muted">
            Уже есть аккаунт?{' '}
            <Link
              href="/auth/login"
              className="inline-block py-3 font-medium text-accent underline underline-offset-2"
            >
              Войти
            </Link>
          </p>
        </Card.Footer>
      </Form>
    </Card>
  );
}
