import { render, screen, within } from '@testing-library/react';
import type { MeetingFile } from '@/lib/files';
import { MeetingFiles } from './meeting-files';

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
    render(<MeetingFiles files={[file()]} />);
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
        files={[
          file({ id: 'a', name: 'a.txt' }),
          file({ id: 'b', name: 'b.txt' }),
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('a.txt'),
      expect.stringContaining('b.txt'),
    ]);
  });

  it('показывает пустое состояние', () => {
    render(<MeetingFiles files={[]} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText('Файлов пока нет.')).toBeInTheDocument();
  });
});
