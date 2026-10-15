import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import {
  refreshMeetingFiles,
  retryTranscription,
} from '@/app/meetings/[id]/actions';
import type { MeetingFile } from '@/lib/files';
import type { Transcription } from '@/lib/transcription';
import { MeetingFileList, POLL_INTERVAL_MS } from './meeting-file-list';

vi.mock('@/app/meetings/[id]/actions', () => ({
  getDownloadLink: vi.fn(),
  refreshMeetingFiles: vi.fn(),
  retryTranscription: vi.fn(),
}));

const refresh = vi.mocked(refreshMeetingFiles);
const retry = vi.mocked(retryTranscription);

const tr = (over: Partial<Transcription> = {}): Transcription => ({
  status: 'QUEUED',
  progress: 0,
  text: null,
  error: null,
  ...over,
});

const file = (over: Partial<MeetingFile> = {}): MeetingFile => ({
  id: 'f1',
  name: 'запись.mp3',
  size: 1000,
  createdAt: '2026-03-05T09:30:00.000Z',
  uploadedBy: { id: 'u1', email: 'anna@example.com' },
  transcription: tr(),
  ...over,
});

const tick = () => act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('MeetingFileList: статус транскрибации', () => {
  it.each([
    ['QUEUED', 'В очереди'],
    ['DONE', 'Готово'],
    ['ERROR', 'Ошибка'],
  ] as const)('%s → «%s»', (status, label) => {
    render(
      <MeetingFileList
        meetingId="m1"
        files={[file({ transcription: tr({ status }) })]}
      />,
    );
    expect(screen.getByTestId('transcription')).toHaveTextContent(label);
  });

  it('в процессе: процент и прогресс-бар', () => {
    render(
      <MeetingFileList
        meetingId="m1"
        files={[
          file({ transcription: tr({ status: 'IN_PROGRESS', progress: 42 }) }),
        ]}
      />,
    );
    expect(screen.getByTestId('transcription')).toHaveTextContent(
      'В процессе 42%',
    );
    expect(
      screen.getByRole('progressbar', { name: 'Прогресс транскрибации' }),
    ).toHaveAttribute('aria-valuenow', '42');
  });

  it('у файла другого формата статуса нет', () => {
    render(
      <MeetingFileList
        meetingId="m1"
        files={[file({ name: 'a.pdf', transcription: null })]}
      />,
    );
    expect(screen.queryByTestId('transcription')).not.toBeInTheDocument();
    expect(screen.queryByText(/Транскрибация/)).not.toBeInTheDocument();
  });
});

describe('MeetingFileList: автообновление', () => {
  it('обновляет статус без перезагрузки и останавливает опрос по завершении', async () => {
    refresh
      .mockResolvedValueOnce({
        ok: true,
        files: [
          file({ transcription: tr({ status: 'IN_PROGRESS', progress: 30 }) }),
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        files: [
          file({
            transcription: tr({
              status: 'DONE',
              progress: 100,
              text: 'привет',
            }),
          }),
        ],
      });
    render(<MeetingFileList meetingId="m1" files={[file()]} />);
    expect(screen.getByTestId('transcription')).toHaveTextContent('В очереди');

    await tick();
    expect(screen.getByTestId('transcription')).toHaveTextContent(
      'В процессе 30%',
    );
    await tick();
    expect(screen.getByTestId('transcription')).toHaveTextContent('Готово');
    expect(refresh).toHaveBeenCalledWith('m1');

    await tick();
    await tick();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('не опрашивает, если нечего ждать', async () => {
    render(
      <MeetingFileList
        meetingId="m1"
        files={[
          file({ transcription: tr({ status: 'DONE', text: 'x' }) }),
          file({ id: 'f2', transcription: null }),
        ]}
      />,
    );
    await tick();
    await tick();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('сбой опроса не стирает список, следующий тик пробует снова', async () => {
    refresh
      .mockResolvedValueOnce({ ok: false, reason: 'unavailable' })
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        ok: true,
        files: [file({ transcription: tr({ status: 'DONE', text: 't' }) })],
      });
    render(<MeetingFileList meetingId="m1" files={[file()]} />);

    await tick();
    await tick();
    expect(screen.getByText('запись.mp3')).toBeInTheDocument();
    await tick();
    expect(screen.getByTestId('transcription')).toHaveTextContent('Готово');
  });
});

describe('MeetingFileList: текст и повтор', () => {
  it('готовый текст доступен в раскрывающемся блоке', () => {
    render(
      <MeetingFileList
        meetingId="m1"
        files={[
          file({
            transcription: tr({ status: 'DONE', text: 'добрый день' }),
          }),
        ]}
      />,
    );
    expect(screen.getByText('Показать текст')).toBeInTheDocument();
    expect(screen.getByText('добрый день')).toBeInTheDocument();
  });

  it('пустой текст → «Речь не распознана»', () => {
    render(
      <MeetingFileList
        meetingId="m1"
        files={[file({ transcription: tr({ status: 'DONE', text: '' }) })]}
      />,
    );
    expect(screen.getByText(/Речь в записи не распознана/)).toBeInTheDocument();
  });

  it('ошибка: показывает причину, «Повторить» вызывает действие и возвращает «В очереди»', async () => {
    retry.mockResolvedValue({ file: file({ transcription: tr() }) });
    refresh.mockResolvedValue({ ok: false, reason: 'unavailable' });
    render(
      <MeetingFileList
        meetingId="m1"
        files={[
          file({
            transcription: tr({
              status: 'ERROR',
              error: 'В файле нет звуковой дорожки',
            }),
          }),
        ]}
      />,
    );
    const block = screen.getByTestId('transcription');
    expect(block).toHaveTextContent('В файле нет звуковой дорожки');

    await userEvent.click(
      within(block).getByRole('button', { name: 'Повторить' }),
    );

    expect(retry).toHaveBeenCalledWith('m1', 'f1');
    expect(screen.getByTestId('transcription')).toHaveTextContent('В очереди');
    expect(
      screen.queryByRole('button', { name: 'Повторить' }),
    ).not.toBeInTheDocument();
  });

  it('ошибка повтора показывается, статус остаётся «Ошибка»', async () => {
    retry.mockResolvedValue({ error: 'Транскрибация уже запущена' });
    render(
      <MeetingFileList
        meetingId="m1"
        files={[
          file({ transcription: tr({ status: 'ERROR', error: 'сбой' }) }),
        ]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(screen.getByText('Транскрибация уже запущена')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeEnabled();
  });
});
