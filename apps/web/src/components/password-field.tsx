'use client';

import {
  Description,
  FieldError,
  InputGroup,
  Label,
  TextField,
  type TextFieldProps,
} from '@heroui/react';
import { useState, type ReactNode } from 'react';

interface PasswordFieldProps extends Omit<TextFieldProps, 'children' | 'type'> {
  label: string;
  placeholder?: string;
  description?: ReactNode;
}

export function PasswordField({
  label,
  placeholder,
  description,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField isRequired fullWidth {...props}>
      <Label>{label}</Label>
      <InputGroup fullWidth className="min-h-11">
        <InputGroup.Input
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
        />
        <InputGroup.Suffix className="pr-1">
          <button
            type="button"
            aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
            className="flex size-9 items-center justify-center rounded-full text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {visible ? (
                <>
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                </>
              ) : (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
        </InputGroup.Suffix>
      </InputGroup>
      {description && <Description>{description}</Description>}
      <FieldError />
    </TextField>
  );
}
