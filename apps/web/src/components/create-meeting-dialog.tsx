'use client';

import {
  Button,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  TextArea,
  TextField,
  Description,
} from '@heroui/react';
import { useActionState, useState } from 'react';
import { createMeeting, type CreateMeetingState } from '@/app/actions';

const initialState: CreateMeetingState = {};

export function CreateMeetingDialog() {
  const [state, formAction, pending] = useActionState(
    createMeeting,
    initialState,
  );
  // Окно открыто, пока не закрыто вручную и не создана новая встреча:
  // успешное создание увеличивает state.created и закрывает окно.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const open = openedAt !== null && openedAt === (state.created ?? 0);
  const setOpen = (value: boolean) =>
    setOpenedAt(value ? (state.created ?? 0) : null);

  return (
    <Modal>
      <Button
        variant="primary"
        size="lg"
        className="min-h-11"
        onPress={() => setOpen(true)}
      >
        Создать встречу
      </Button>
      <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Новая встреча</Modal.Heading>
            </Modal.Header>
            <Form
              action={formAction}
              validationErrors={state.fieldErrors}
              className="flex flex-col gap-4"
            >
              <Modal.Body className="flex flex-col gap-4 p-1">
                <TextField
                  isRequired
                  fullWidth
                  name="title"
                  maxLength={200}
                  defaultValue={state.values?.title}
                  autoFocus
                >
                  <Label>Название</Label>
                  <Input className="min-h-11" placeholder="Планёрка команды" />
                  <FieldError />
                </TextField>
                <TextField
                  isRequired
                  fullWidth
                  name="date"
                  type="datetime-local"
                  defaultValue={state.values?.date}
                >
                  <Label>Дата и время</Label>
                  <Input className="min-h-11" />
                  <FieldError />
                </TextField>
                <TextField
                  fullWidth
                  name="participants"
                  defaultValue={state.values?.participants}
                >
                  <Label>Участники</Label>
                  <TextArea
                    rows={3}
                    placeholder="anna@example.com, boris@example.com"
                  />
                  <Description>
                    Email через запятую или с новой строки
                  </Description>
                  <FieldError />
                </TextField>
                {state.error && (
                  <p role="alert" className="text-sm text-danger">
                    {state.error}
                  </p>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button
                  slot="close"
                  variant="secondary"
                  className="min-h-11"
                  onPress={() => setOpen(false)}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="min-h-11"
                  isPending={pending}
                >
                  Создать
                </Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
