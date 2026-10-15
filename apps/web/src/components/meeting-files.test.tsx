import { vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { MeetingFile } from '@/lib/files';
import { MeetingFiles } from './meeting-files';

vi.mock('@/app/meetings/[id]/actions', () => ({
  getDownloadLink: vi.fn(),
  getUploadCredentials: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const file = (over: Partial<MeetingFile> = {}): MeetingFile => ({
  id: 'f1',
  name: 'отчёт.pdf',
  size: 1536,
  createdAt: '2026-03-05T09:30:00.000Z',
  uploadedBy: { id: 'u1', email: 'anna@example.com' },
  ...over,
});

describe('MeetingFiles: список', () => {
  it('показывает имя, размер, дату и автора', () => {
    render(
      <MeetingFiles meetingId="m1" result={{ ok: true, files: [file()] }} />,
    );
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('отчёт.pdf')).toBeInTheDocument();
    expect(item).toHaveTextContent(/1,5\s*КБ/);
    expect(item).toHaveTextContent('5 марта 2026');
    expect(item).toHaveTextContent('anna@example.com');
    expect(within(item).getByText(/5 марта/)).toHaveAttribute(
      'datetime',
      '2026-03-05T09:30:00.000Z',
    );
  });

  it('рендерит все файлы в порядке api', () => {
    render(
      <MeetingFiles
        meetingId="m1"
        result={{
          ok: true,
          files: [
            file({ id: 'a', name: 'a.txt' }),
            file({ id: 'b', name: 'b.txt' }),
          ],
        }}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('a.txt'),
      expect.stringContaining('b.txt'),
    ]);
  });

  it('показывает пустое состояние', () => {
    render(<MeetingFiles meetingId="m1" result={{ ok: true, files: [] }} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText('Файлов пока нет.')).toBeInTheDocument();
  });
});

describe('MeetingFiles: ошибки', () => {
  it('сообщает об отсутствии доступа (403/404)', () => {
    render(
      <MeetingFiles
        meetingId="m1"
        result={{ ok: false, reason: 'forbidden' }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('нет доступа');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('Файлов пока нет.')).not.toBeInTheDocument();
  });

  it('сообщает о сбое загрузки списка (сеть, 5xx)', () => {
    render(
      <MeetingFiles
        meetingId="m1"
        result={{ ok: false, reason: 'unavailable' }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить');
  });
});
